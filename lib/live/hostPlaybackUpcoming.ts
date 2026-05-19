import type { SupabaseClient } from "@supabase/supabase-js";

import { enrichTracksFromCacheAndSpotify } from "@/lib/live/enrichTrackMetadata";
import type { SpotifyQueuedTrack } from "@/lib/spotify/playerQueue";
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

/**
 * Upcoming tracks from synced playlist_tracks only — zero Spotify Web API calls.
 */
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
    if (nextIds.length > 0) {
      return nextIds;
    }
  }

  return [];
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

/**
 * Next tracks for empty guest queue — DB/cache only (playlist_tracks + cached_items).
 * Intentionally avoids Spotify /me/player and /me/player/queue to protect rate limits.
 */
export async function fetchHostPlaybackUpcoming(
  admin: SupabaseClient,
  session: LiveSessionRow,
  limit: number,
  excludeTrackIds: Set<string> = new Set(),
  _options?: FetchHostPlaybackUpcomingOptions,
): Promise<SpotifyQueuedTrack[]> {
  if (limit <= 0) return [];

  const exclude = new Set(excludeTrackIds);
  const currentTrackId = session.spotify_track_id?.trim() ?? null;
  if (!currentTrackId) {
    logQueuePreview("no session track id — sync host playback first");
    return [];
  }

  const playlistTrackIds = await upcomingFromCachedPlaylists(
    admin,
    session.host_user_id,
    currentTrackId,
    limit,
    exclude,
  );

  logQueuePreview(`cached playlist scan: ${playlistTrackIds.length} track(s)`, {
    currentTrackId,
  });

  if (playlistTrackIds.length === 0) {
    return [];
  }

  const meta = await enrichTracksFromCacheAndSpotify(admin, playlistTrackIds, null);
  const results: SpotifyQueuedTrack[] = [];

  for (const id of playlistTrackIds) {
    const m = meta.get(id);
    if (!m) continue;
    results.push(
      toQueuedTrack(id, {
        track_name:
          m.track_name ??
          (id === currentTrackId ? session.track_name : null),
        artist_name:
          m.artist_name ??
          (id === currentTrackId ? session.artist_name : null),
        image_url:
          m.image_url ?? (id === currentTrackId ? session.image_url : null),
      }),
    );
  }

  return results.slice(0, limit);
}
