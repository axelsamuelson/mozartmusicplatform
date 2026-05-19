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
import type { LiveSessionRow } from "@/lib/types/live";

function toQueuedTrack(
  id: string,
  meta: {
    track_name: string | null;
    artist_name: string | null;
    image_url: string | null;
  },
): SpotifyQueuedTrack {
  return {
    spotify_track_id: id,
    track_name: meta.track_name ?? "Unknown track",
    artist_name: meta.artist_name,
    image_url: meta.image_url,
  };
}

async function upcomingFromPlaylistApi(
  hostToken: string,
  playlistId: string,
  currentTrackId: string,
  limit: number,
  exclude: Set<string>,
): Promise<string[]> {
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

async function upcomingFromPlaylistContext(
  admin: SupabaseClient,
  session: LiveSessionRow,
  hostToken: string,
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
    const currentIndex = trackIds.indexOf(currentTrackId);
    const start = currentIndex >= 0 ? currentIndex + 1 : 0;
    const nextIds: string[] = [];
    for (let i = start; i < trackIds.length && nextIds.length < limit; i++) {
      const id = trackIds[i]!;
      if (exclude.has(id)) continue;
      nextIds.push(id);
      exclude.add(id);
    }
    if (nextIds.length > 0) return nextIds;
  }

  return upcomingFromPlaylistApi(hostToken, playlistId, currentTrackId, limit, exclude);
}

/**
 * Next tracks on the host's Spotify (explicit queue, then playlist context).
 */
export async function fetchHostPlaybackUpcoming(
  admin: SupabaseClient,
  session: LiveSessionRow,
  limit: number,
  excludeTrackIds: Set<string> = new Set(),
): Promise<SpotifyQueuedTrack[]> {
  if (limit <= 0) return [];

  const exclude = new Set(excludeTrackIds);
  let hostToken: string;
  try {
    hostToken = await getHostToken(admin, session);
  } catch {
    return [];
  }

  const results: SpotifyQueuedTrack[] = [];

  try {
    const explicitQueue = await fetchSpotifyPlayerQueue(hostToken);
    for (const track of explicitQueue) {
      if (results.length >= limit) break;
      if (exclude.has(track.spotify_track_id)) continue;
      exclude.add(track.spotify_track_id);
      results.push(track);
    }
  } catch {
    /* fall through to playlist context */
  }

  if (results.length >= limit) return results;

  const playback = await fetchCurrentPlayback(hostToken).catch(() => null);
  const currentTrackId = playback?.trackId ?? session.spotify_track_id ?? null;
  if (!currentTrackId) return results;

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
    const meta = await enrichTracksFromCacheAndSpotify(
      admin,
      playlistTrackIds,
      hostToken,
    );
    for (const id of playlistTrackIds) {
      const m = meta.get(id);
      if (!m) continue;
      results.push(
        toQueuedTrack(id, {
          track_name: m.track_name,
          artist_name: m.artist_name,
          image_url: m.image_url,
        }),
      );
    }
  }

  return results.slice(0, limit);
}
