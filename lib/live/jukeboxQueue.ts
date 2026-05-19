import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assignQueuePositions,
  pickNextQueueItem,
  playedCountByUser,
} from "@/lib/live/jukeboxPriority";
import {
  assignRoundRobinQueuePositions,
  pickNextRoundRobinQueueItem,
} from "@/lib/live/roundRobinQueue";
import {
  usesJukeboxQueueOrdering,
  usesRoundRobinQueueOrdering,
} from "@/lib/live/sessionMode";
import type { LiveQueueRow, LiveScoreRow, LiveSessionRow } from "@/lib/types/live";

export async function loadPendingQueue(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<LiveQueueRow[]> {
  const { data, error } = await supabase
    .from("live_queue")
    .select("*")
    .eq("session_id", sessionId)
    .is("played_at", null)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LiveQueueRow[];
}

export async function loadPlayedQueue(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Pick<LiveQueueRow, "user_id" | "played_at">[]> {
  const { data, error } = await supabase
    .from("live_queue")
    .select("user_id, played_at")
    .eq("session_id", sessionId)
    .not("played_at", "is", null);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadSessionScores(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<LiveScoreRow[]> {
  const { data, error } = await supabase
    .from("live_scores")
    .select("*")
    .eq("session_id", sessionId);

  if (error) throw new Error(error.message);
  return (data ?? []) as LiveScoreRow[];
}

export async function recomputeQueuePositions(
  admin: SupabaseClient,
  session: Pick<
    LiveSessionRow,
    "id" | "jukebox_ranking_mode" | "jams_enabled" | "jukebox_enabled"
  >,
): Promise<void> {
  const sessionId = session.id;
  const pending = await loadPendingQueue(admin, sessionId);
  const [played, scores] = await Promise.all([
    loadPlayedQueue(admin, sessionId),
    loadSessionScores(admin, sessionId),
  ]);

  const updates = usesJukeboxQueueOrdering(session)
    ? assignQueuePositions(pending, scores, played, session.jukebox_ranking_mode)
    : usesRoundRobinQueueOrdering(session)
      ? assignRoundRobinQueuePositions(pending, played)
      : [];

  await Promise.all(
    updates.map(({ id, position }) =>
      admin.from("live_queue").update({ position }).eq("id", id),
    ),
  );
}

export function sessionPatchFromQueueItem(item: LiveQueueRow): Partial<LiveSessionRow> {
  return {
    spotify_track_id: item.spotify_track_id,
    track_name: item.track_name,
    artist_name: item.artist_name,
    image_url: item.image_url,
    current_queue_id: item.id,
    current_track_user_id: item.user_id,
    is_playing: true,
    progress_ms: 0,
    playback_updated_at: new Date().toISOString(),
  };
}

export async function pickAndApplyNextTrack(
  admin: SupabaseClient,
  session: LiveSessionRow,
): Promise<{
  nextTrack: LiveQueueRow | null;
  session: LiveSessionRow;
}> {
  const sessionId = session.id;
  const [pending, played, scores, allPlayedRows] = await Promise.all([
    loadPendingQueue(admin, sessionId),
    loadPlayedQueue(admin, sessionId),
    loadSessionScores(admin, sessionId),
    admin
      .from("live_queue")
      .select("user_id, played_at")
      .eq("session_id", sessionId),
  ]);

  const playedCounts = playedCountByUser(allPlayedRows.data ?? []);
  const next = usesJukeboxQueueOrdering(session)
    ? pickNextQueueItem(pending, scores, playedCounts, session.jukebox_ranking_mode)
    : usesRoundRobinQueueOrdering(session)
      ? pickNextRoundRobinQueueItem(pending, playedCounts)
      : null;

  if (!next) {
    const { data: cleared } = await admin
      .from("live_sessions")
      .update({
        spotify_track_id: null,
        track_name: null,
        artist_name: null,
        image_url: null,
        current_queue_id: null,
        current_track_user_id: null,
        is_playing: false,
        progress_ms: 0,
        playback_updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select("*")
      .single();

    await recomputeQueuePositions(admin, session);
    return {
      nextTrack: null,
      session: (cleared ?? session) as LiveSessionRow,
    };
  }

  const { data: updatedSession, error: sessionErr } = await admin
    .from("live_sessions")
    .update(sessionPatchFromQueueItem(next))
    .eq("id", sessionId)
    .select("*")
    .single();

  if (sessionErr || !updatedSession) {
    throw new Error(sessionErr?.message ?? "Failed to update session track");
  }

  const freshSession = updatedSession as LiveSessionRow;
  await recomputeQueuePositions(admin, freshSession);
  return {
    nextTrack: next,
    session: freshSession,
  };
}
