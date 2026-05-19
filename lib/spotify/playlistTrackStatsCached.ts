import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isPlaylistTracksCacheFresh,
  loadUserPlaylistTracksMap,
  upsertPlaylistTracks,
} from "@/lib/spotify/playlistTracksDb";
import {
  fetchPlaylistTrackStats,
  type PlaylistTrackStatsResult,
} from "@/lib/spotify/userLibraryPlaylists";

/** Hard cap for Jams playlist pool (most recently added items in pagination order). */
export const SESSION_PLAYLIST_TRACK_CAP = 500;

const LARGE_PLAYLIST_THRESHOLD = 100;

export function isLargePlaylistForAsyncSync(estimatedTracks: number): boolean {
  return estimatedTracks > LARGE_PLAYLIST_THRESHOLD;
}

function capTrackIds(trackIds: string[], cap = SESSION_PLAYLIST_TRACK_CAP): string[] {
  if (trackIds.length <= cap) return trackIds;
  return trackIds.slice(-cap);
}

/**
 * Playlist stats for live sessions: Supabase cache first, then Spotify (capped).
 */
export async function fetchPlaylistTrackStatsForSession(
  accessToken: string,
  playlistId: string,
  supabase: SupabaseClient,
  userId: string,
  options?: { skipSpotify?: boolean },
): Promise<PlaylistTrackStatsResult & { fromCache: boolean }> {
  const map = await loadUserPlaylistTracksMap(supabase, userId);
  const cached = map.get(playlistId);

  if (
    cached &&
    isPlaylistTracksCacheFresh(cached.last_synced_at) &&
    cached.track_ids.length > 0
  ) {
    const trackRowIds = capTrackIds(cached.track_ids);
    return {
      total_tracks: cached.total_tracks,
      trackRowIds,
      fromCache: true,
    };
  }

  if (options?.skipSpotify) {
    return { total_tracks: 0, trackRowIds: [], fromCache: false };
  }

  const raw = await fetchPlaylistTrackStats(accessToken, playlistId);
  const trackRowIds = capTrackIds(raw.trackRowIds);

  await upsertPlaylistTracks(supabase, userId, playlistId, raw.total_tracks, trackRowIds).catch(
    () => undefined,
  );

  return {
    total_tracks: raw.total_tracks,
    trackRowIds,
    fromCache: false,
  };
}
