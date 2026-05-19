import type { SupabaseClient } from "@supabase/supabase-js";

import { fillBuffer } from "@/lib/live/bufferManager";
import {
  fetchPlaylistTrackStatsForSession,
  SESSION_PLAYLIST_TRACK_CAP,
} from "@/lib/spotify/playlistTrackStatsCached";

const MIN_PLAYLIST_TRACKS = 20;

export async function completePlaylistSourceSync(
  admin: SupabaseClient,
  userSupabase: SupabaseClient,
  sessionId: string,
  userId: string,
  playlistId: string,
  accessToken: string,
): Promise<void> {
  try {
    const stats = await fetchPlaylistTrackStatsForSession(
      accessToken,
      playlistId,
      userSupabase,
      userId,
    );

    if (stats.total_tracks < MIN_PLAYLIST_TRACKS) {
      await admin
        .from("live_session_sources")
        .update({
          playlist_sync_status: "error",
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId)
        .eq("user_id", userId);
      return;
    }

    const pool = stats.trackRowIds.slice(-SESSION_PLAYLIST_TRACK_CAP);

    await admin
      .from("live_session_sources")
      .update({
        playlist_size: stats.total_tracks,
        playlist_track_pool: pool,
        playlist_sync_status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("user_id", userId);

    await fillBuffer(admin, userSupabase, sessionId, userId, "playlist");
  } catch {
    try {
      await admin
        .from("live_session_sources")
        .update({
          playlist_sync_status: "error",
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId)
        .eq("user_id", userId);
    } catch {
      /* ignore */
    }
  }
}
