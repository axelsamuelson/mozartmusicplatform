import type { SupabaseClient } from "@supabase/supabase-js";

import { enrichTracksFromCacheAndSpotify } from "@/lib/live/enrichTrackMetadata";
import { getHostToken } from "@/lib/live/getHostToken";
import {
  fetchCurrentPlayback,
  playlistIdFromContextUri,
} from "@/lib/spotify/currentlyPlaying";
import {
  fetchSpotifyPlayerQueue,
  type SpotifyQueuedTrack,
} from "@/lib/spotify/playerQueue";
import { isSpotifyCircuitOpen } from "@/lib/spotify/rateLimiter";
import type { LiveSessionRow } from "@/lib/types/live";

function toQueuedTrack(
  id: string,
  meta: {
    track_name: string | null;
    artist_name: string | null;
    image_url: string | null;
  },
): SpotifyQueuedTrack | null {
  const trackName = meta.track_name?.trim();
  if (!trackName) return null;

  return {
    spotify_track_id: id,
    track_name: trackName,
    artist_name: meta.artist_name,
    image_url: meta.image_url,
  };
}

function nextTrackIdsFromList(
  trackIds: string[],
  currentTrackId: string,
  limit: number,
  exclude: Set<string>,
): string[] {
  const currentIndex = trackIds.indexOf(currentTrackId);
  const start = currentIndex >= 0 ? currentIndex + 1 : 0;
  const nextIds: string[] = [];
  for (let i = start; i < trackIds.length && nextIds.length < limit; i++) {
    const id = trackIds[i]!;
    if (exclude.has(id)) continue;
    nextIds.push(id);
    exclude.add(id);
  }
  return nextIds;
}

async function upcomingFromPlaylistApi(
  hostToken: string,
  playlistId: string,
  currentTrackId: string,
  limit: number,
  exclude: Set<string>,
): Promise<string[]> {
  if (isSpotifyCircuitOpen()) return [];

  const fields = encodeURIComponent("items(track(id)),next");
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50&fields=${fields}`;
  const allIds: string[] = [];

  for (let page = 0; page < 6 && url; page++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${hostToken}` },
      cache: "no-store",
    });
    if (!res.ok) break;

    const body = (await res.json()) as {
      items?: { track?: { id?: string } | null }[];
      next?: string | null;
    };

    for (const row of body.items ?? []) {
      const id = row.track?.id;
      if (typeof id === "string" && id.length > 0) allIds.push(id);
    }

    const currentIndex = allIds.indexOf(currentTrackId);
    if (currentIndex >= 0 && allIds.length >= currentIndex + 1 + limit) break;

    url = body.next ?? null;
  }

  const currentIndex = allIds.indexOf(currentTrackId);
  const start = currentIndex >= 0 ? currentIndex + 1 : 0;
  const nextIds: string[] = [];
  for (let i = start; i < allIds.length && nextIds.length < limit; i++) {
    const id = allIds[i]!;
    if (exclude.has(id)) continue;
    nextIds.push(id);
    exclude.add(id);
  }
  return nextIds;
}

async function upcomingFromCachedPlaylists(
  admin: SupabaseClient,
  hostUserId: string,
  currentTrackId: string,
  limit: number,
  exclude: Set<string>,
): Promise<string[]> {
  const { data: rows } = await admin
    .from("playlist_tracks")
    .select("playlist_id, track_ids")
    .eq("user_id", hostUserId)
    .limit(80);

  for (const row of rows ?? []) {
    const trackIds = Array.isArray(row.track_ids)
      ? (row.track_ids as string[]).filter((id) => typeof id === "string" && id.length > 0)
      : [];
    if (trackIds.length === 0) continue;
    const nextIds = nextTrackIdsFromList(trackIds, currentTrackId, limit, exclude);
    if (nextIds.length > 0) return nextIds;
  }

  return [];
}

async function upcomingFromPlaylistContext(
  admin: SupabaseClient,
  session: LiveSessionRow,
  hostToken: string | null,
  contextUri: string | null,
  currentTrackId: string,
  limit: number,
  exclude: Set<string>,
): Promise<string[]> {
  const playlistId = playlistIdFromContextUri(contextUri);
  if (!playlistId) return [];

  const { data: cached } = await admin
    .from("playlist_tracks")
    .select("track_ids")
    .eq("user_id", session.host_user_id)
    .eq("playlist_id", playlistId)
    .maybeSingle();

  const trackIds = Array.isArray(cached?.track_ids)
    ? (cached.track_ids as string[]).filter((id) => typeof id === "string" && id.length > 0)
    : [];

  if (trackIds.length > 0) {
    const nextIds = nextTrackIdsFromList(trackIds, currentTrackId, limit, exclude);
    if (nextIds.length > 0) return nextIds;
  }

  if (!hostToken) return [];
  return upcomingFromPlaylistApi(hostToken, playlistId, currentTrackId, limit, exclude);
}

async function tracksFromIds(
  admin: SupabaseClient,
  session: LiveSessionRow,
  trackIds: string[],
  hostToken: string | null,
  currentTrackId: string | null,
): Promise<SpotifyQueuedTrack[]> {
  if (trackIds.length === 0) return [];

  const meta = await enrichTracksFromCacheAndSpotify(admin, trackIds, hostToken);
  const results: SpotifyQueuedTrack[] = [];

  for (const id of trackIds) {
    const m = meta.get(id);
    if (!m) continue;
    const track = toQueuedTrack(id, {
      track_name:
        m.track_name ?? (id === currentTrackId ? session.track_name : null),
      artist_name:
        m.artist_name ?? (id === currentTrackId ? session.artist_name : null),
      image_url:
        m.image_url ?? (id === currentTrackId ? session.image_url : null),
    });
    if (track) results.push(track);
  }

  return results;
}

export type FetchHostPlaybackUpcomingOptions = {
  callerUserId?: string;
  hostAccessToken?: string;
};

function logQueuePreview(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  if (detail !== undefined) {
    console.log(`[queue-preview] ${message}`, detail);
  } else {
    console.log(`[queue-preview] ${message}`);
  }
}

async function resolveHostToken(
  admin: SupabaseClient,
  session: LiveSessionRow,
  options?: FetchHostPlaybackUpcomingOptions,
): Promise<string | null> {
  if (isSpotifyCircuitOpen()) return null;

  if (options?.hostAccessToken?.trim()) {
    return options.hostAccessToken.trim();
  }

  try {
    return await getHostToken(admin, session, options?.callerUserId);
  } catch (e) {
    logQueuePreview("no host Spotify token", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Upcoming host tracks when the guest queue is empty.
 * Prefers synced playlist_tracks (no API), then Spotify device queue + playlist context.
 */
export async function fetchHostPlaybackUpcoming(
  admin: SupabaseClient,
  session: LiveSessionRow,
  limit: number,
  excludeTrackIds: Set<string> = new Set(),
  options?: FetchHostPlaybackUpcomingOptions,
): Promise<SpotifyQueuedTrack[]> {
  if (limit <= 0) return [];

  const exclude = new Set(excludeTrackIds);
  const results: SpotifyQueuedTrack[] = [];
  const hostToken = await resolveHostToken(admin, session, options);
  const spotifyUserId = session.host_user_id;

  let currentTrackId = session.spotify_track_id?.trim() ?? null;

  if (!currentTrackId && hostToken && !isSpotifyCircuitOpen()) {
    const playback = await fetchCurrentPlayback(hostToken, {
      userId: spotifyUserId,
    }).catch(() => null);
    currentTrackId = playback?.trackId ?? null;
  }

  if (currentTrackId) {
    const cachedIds = await upcomingFromCachedPlaylists(
      admin,
      session.host_user_id,
      currentTrackId,
      limit,
      exclude,
    );
    if (cachedIds.length > 0) {
      const cachedTracks = await tracksFromIds(
        admin,
        session,
        cachedIds,
        hostToken,
        currentTrackId,
      );
      for (const track of cachedTracks) {
        if (results.length >= limit) break;
        results.push(track);
      }
      logQueuePreview(`playlist_tracks cache: ${results.length} track(s)`);
    }
  }

  if (results.length < limit && hostToken && !isSpotifyCircuitOpen()) {
    try {
      const deviceQueue = await fetchSpotifyPlayerQueue(hostToken);
      logQueuePreview(`Spotify device queue: ${deviceQueue.length} track(s)`);
      for (const track of deviceQueue) {
        if (results.length >= limit) break;
        if (exclude.has(track.spotify_track_id)) continue;
        exclude.add(track.spotify_track_id);
        results.push(track);
      }
    } catch (e) {
      logQueuePreview(
        "Spotify device queue failed",
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (results.length < limit && currentTrackId && hostToken && !isSpotifyCircuitOpen()) {
    const playback = await fetchCurrentPlayback(hostToken, {
      userId: spotifyUserId,
    }).catch((e) => {
      logQueuePreview("current playback failed", e instanceof Error ? e.message : e);
      return null;
    });

    const playlistTrackIds = await upcomingFromPlaylistContext(
      admin,
      session,
      hostToken,
      playback?.contextUri ?? null,
      currentTrackId,
      limit - results.length,
      exclude,
    );

    if (playlistTrackIds.length > 0) {
      const playlistTracks = await tracksFromIds(
        admin,
        session,
        playlistTrackIds,
        hostToken,
        currentTrackId,
      );
      for (const track of playlistTracks) {
        if (results.length >= limit) break;
        results.push(track);
      }
    }
  }

  logQueuePreview(`resolved ${results.length} upcoming track(s)`);
  return results.slice(0, limit);
}
