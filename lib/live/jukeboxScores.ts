import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeJukeboxRankingMode } from "@/lib/live/jukeboxRanking";
import { getLiveSessionMode } from "@/lib/live/sessionMode";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LiveQueueRow, LiveScoreRow, LiveSessionRow } from "@/lib/types/live";

import { pointsForTrackAverage } from "./jukeboxPriority";

const RATER_BONUS = 2;

function rollingTrackAverage(
  previousAvg: number | null,
  previousCount: number,
  trackAvg: number,
): number {
  if (previousCount <= 0 || previousAvg == null) return trackAvg;
  return (previousAvg * previousCount + trackAvg) / (previousCount + 1);
}

async function loadScoreRow(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<LiveScoreRow | null> {
  const { data } = await admin
    .from("live_scores")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? (data as LiveScoreRow) : null;
}

async function upsertScoreRow(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
  displayName: string,
  patch: Partial<Pick<LiveScoreRow, "points" | "tracks_played" | "avg_score">>,
): Promise<void> {
  const existing = await loadScoreRow(admin, sessionId, userId);
  const { error } = await admin.from("live_scores").upsert(
    {
      session_id: sessionId,
      user_id: userId,
      display_name: displayName,
      points: patch.points ?? existing?.points ?? 0,
      tracks_played: patch.tracks_played ?? existing?.tracks_played ?? 0,
      avg_score:
        patch.avg_score !== undefined ? patch.avg_score : existing?.avg_score ?? null,
    },
    { onConflict: "session_id,user_id" },
  );
  if (error) throw new Error(error.message);
}

export type FinalizeTrackScoresResult = {
  applied: boolean;
  trackAverage: number | null;
  ownerBonus: number;
};

/** Apply jukebox scoring for a finished track (idempotent via scores_applied). */
export async function finalizeTrackScores(
  admin: SupabaseClient,
  session: LiveSessionRow,
  queueItem: LiveQueueRow,
): Promise<FinalizeTrackScoresResult> {
  if (queueItem.scores_applied) {
    return { applied: false, trackAverage: null, ownerBonus: 0 };
  }

  const mode = normalizeJukeboxRankingMode(session.jukebox_ranking_mode);

  const { data: ratings, error } = await admin
    .from("live_ratings")
    .select("user_id, score, display_name")
    .eq("session_id", session.id)
    .eq("spotify_track_id", queueItem.spotify_track_id)
    .neq("user_id", queueItem.user_id);

  if (error) throw new Error(error.message);

  const raterRows = ratings ?? [];
  const trackAverage =
    raterRows.length > 0
      ? raterRows.reduce((sum, r) => sum + (r.score as number), 0) / raterRows.length
      : null;

  const ownerBonus =
    mode === "points" && trackAverage != null ? pointsForTrackAverage(trackAverage) : 0;
  const ownerExisting = await loadScoreRow(admin, session.id, queueItem.user_id);
  const ownerDisplay =
    queueItem.display_name ?? ownerExisting?.display_name ?? "User";
  const prevPlayed = ownerExisting?.tracks_played ?? 0;

  const nextAvgScore =
    trackAverage != null
      ? rollingTrackAverage(ownerExisting?.avg_score ?? null, prevPlayed, trackAverage)
      : ownerExisting?.avg_score ?? null;

  await upsertScoreRow(admin, session.id, queueItem.user_id, ownerDisplay, {
    points: (ownerExisting?.points ?? 0) + ownerBonus,
    tracks_played: prevPlayed + 1,
    avg_score: nextAvgScore,
  });

  if (mode === "points") {
    for (const r of raterRows) {
      const raterId = r.user_id as string;
      const raterExisting = await loadScoreRow(admin, session.id, raterId);
      const raterDisplay =
        (r.display_name as string | null) ?? raterExisting?.display_name ?? "User";
      await upsertScoreRow(admin, session.id, raterId, raterDisplay, {
        points: (raterExisting?.points ?? 0) + RATER_BONUS,
      });
    }
  }

  const { error: markErr } = await admin
    .from("live_queue")
    .update({ scores_applied: true })
    .eq("id", queueItem.id);
  if (markErr) throw new Error(markErr.message);

  return { applied: true, trackAverage, ownerBonus };
}

export async function finalizeTrackScoresSafe(
  session: LiveSessionRow,
  queueItem: LiveQueueRow,
): Promise<FinalizeTrackScoresResult> {
  try {
    const admin = createAdminClient();
    return await finalizeTrackScores(admin, session, queueItem);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[jukebox] finalize scores failed:", e);
    }
    return { applied: false, trackAverage: null, ownerBonus: 0 };
  }
}

export async function getSessionParticipantIds(
  supabase: SupabaseClient,
  session: LiveSessionRow,
): Promise<Set<string>> {
  const ids = new Set<string>([session.host_user_id]);

  const [ratings, queue, scores] = await Promise.all([
    supabase.from("live_ratings").select("user_id").eq("session_id", session.id),
    supabase.from("live_queue").select("user_id").eq("session_id", session.id),
    supabase.from("live_scores").select("user_id").eq("session_id", session.id),
  ]);

  for (const row of ratings.data ?? []) ids.add(row.user_id as string);
  for (const row of queue.data ?? []) ids.add(row.user_id as string);
  for (const row of scores.data ?? []) ids.add(row.user_id as string);

  return ids;
}

/** When every session participant (except track owner) has rated, finalize scores. */
export async function maybeAutoFinalizeTrackScores(
  supabase: SupabaseClient,
  session: LiveSessionRow,
): Promise<FinalizeTrackScoresResult | null> {
  if (
    getLiveSessionMode(session) !== "jukebox" ||
    !session.current_queue_id ||
    !session.current_track_user_id
  ) {
    return null;
  }

  const trackId = session.spotify_track_id;
  const ownerId = session.current_track_user_id;
  if (!trackId || !ownerId) return null;

  const { data: queueItem } = await supabase
    .from("live_queue")
    .select("*")
    .eq("id", session.current_queue_id)
    .maybeSingle();

  if (!queueItem || (queueItem as LiveQueueRow).scores_applied) return null;

  const participants = await getSessionParticipantIds(supabase, session);
  participants.delete(ownerId);

  if (participants.size === 0) return null;

  const { data: ratings } = await supabase
    .from("live_ratings")
    .select("user_id")
    .eq("session_id", session.id)
    .eq("spotify_track_id", trackId)
    .neq("user_id", ownerId);

  const rated = new Set((ratings ?? []).map((r) => r.user_id as string));
  for (const id of participants) {
    if (!rated.has(id)) return null;
  }

  return finalizeTrackScoresSafe(session, queueItem as LiveQueueRow);
}
