import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionSummaryPayload = {
  crowdPleaser: { userId: string; displayName: string; avg: number } | null;
  worstDj: { userId: string; displayName: string; avg: number } | null;
  hotTake: { userId: string; displayName: string; deviation: number } | null;
  mindReader: { userId: string; displayName: string; deviation: number } | null;
  speedRater: { userId: string; displayName: string; avgMs: number } | null;
  bestTrack: {
    spotifyTrackId: string;
    trackName: string;
    artistName: string | null;
    avg: number;
  } | null;
  mostControversial: {
    spotifyTrackId: string;
    trackName: string;
    stddev: number;
  } | null;
  tracksPlayed: number;
  ratingsCount: number;
  durationMs: number;
};

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Build summary titles from live_session_ratings (+ legacy live_ratings). */
export async function generateSessionSummary(
  admin: SupabaseClient,
  sessionId: string,
  startedAt: string,
  endedAt: string,
): Promise<SessionSummaryPayload> {
  const [{ data: ratings }, { data: queueRows }] = await Promise.all([
    admin
      .from("live_session_ratings")
      .select("user_id, spotify_track_id, score, rating_time_ms, is_retroactive")
      .eq("session_id", sessionId)
      .eq("is_retroactive", false),
    admin
      .from("live_queue")
      .select("user_id, spotify_track_id, track_name, artist_name")
      .eq("session_id", sessionId),
  ]);

  const ownerByTrack = new Map(
    (queueRows ?? []).map((q) => [
      q.spotify_track_id as string,
      {
        userId: q.user_id as string,
        trackName: q.track_name as string,
        artistName: q.artist_name as string | null,
      },
    ]),
  );

  const rows = ratings ?? [];
  const sessionAvg =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.score as number), 0) / rows.length
      : 0;

  const byOwner = new Map<string, { scores: number[]; name: string }>();
  const byTrack = new Map<string, { scores: number[]; name: string; artist: string | null }>();
  const byRaterSpeed = new Map<string, number[]>();

  for (const r of rows) {
    const tid = r.spotify_track_id as string;
    const meta = ownerByTrack.get(tid);
    const ownerId = meta?.userId;
    if (!ownerId || ownerId === r.user_id) continue;

    const score = r.score as number;
    if (!byOwner.has(ownerId)) {
      byOwner.set(ownerId, { scores: [], name: ownerId });
    }
    byOwner.get(ownerId)!.scores.push(score);

    if (!byTrack.has(tid)) {
      byTrack.set(tid, {
        scores: [],
        name: meta?.trackName ?? tid,
        artist: meta?.artistName ?? null,
      });
    }
    byTrack.get(tid)!.scores.push(score);

    const rater = r.user_id as string;
    if (r.rating_time_ms != null) {
      if (!byRaterSpeed.has(rater)) byRaterSpeed.set(rater, []);
      byRaterSpeed.get(rater)!.push(r.rating_time_ms as number);
    }
  }

  let crowdPleaser: SessionSummaryPayload["crowdPleaser"] = null;
  let worstDj: SessionSummaryPayload["worstDj"] = null;
  let hotTake: SessionSummaryPayload["hotTake"] = null;
  let mindReader: SessionSummaryPayload["mindReader"] = null;

  for (const [userId, { scores }] of byOwner) {
    if (scores.length < 1) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (!crowdPleaser || avg > crowdPleaser.avg) {
      crowdPleaser = { userId, displayName: userId, avg };
    }
    if (scores.length >= 3 && (!worstDj || avg < worstDj.avg)) {
      worstDj = { userId, displayName: userId, avg };
    }
    const deviation =
      scores.reduce((s, v) => s + Math.abs(v - sessionAvg), 0) / scores.length;
    if (!hotTake || deviation > hotTake.deviation) {
      hotTake = { userId, displayName: userId, deviation };
    }
    if (!mindReader || deviation < mindReader.deviation) {
      mindReader = { userId, displayName: userId, deviation };
    }
  }

  let speedRater: SessionSummaryPayload["speedRater"] = null;
  for (const [userId, times] of byRaterSpeed) {
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    if (!speedRater || avgMs < speedRater.avgMs) {
      speedRater = { userId, displayName: userId, avgMs };
    }
  }

  let bestTrack: SessionSummaryPayload["bestTrack"] = null;
  let mostControversial: SessionSummaryPayload["mostControversial"] = null;

  for (const [tid, { scores, name, artist }] of byTrack) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = stddev(scores);
    if (!bestTrack || avg > bestTrack.avg) {
      bestTrack = {
        spotifyTrackId: tid,
        trackName: name,
        artistName: artist,
        avg,
      };
    }
    if (!mostControversial || sd > mostControversial.stddev) {
      mostControversial = { spotifyTrackId: tid, trackName: name, stddev: sd };
    }
  }

  const { count: played } = await admin
    .from("live_queue")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .not("played_at", "is", null);

  return {
    crowdPleaser,
    worstDj,
    hotTake,
    mindReader,
    speedRater,
    bestTrack,
    mostControversial,
    tracksPlayed: played ?? 0,
    ratingsCount: rows.length,
    durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
  };
}
