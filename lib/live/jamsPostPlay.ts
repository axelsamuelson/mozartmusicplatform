import type { SupabaseClient } from "@supabase/supabase-js";

import type { LiveQueueRow, LiveSessionRow } from "@/lib/types/live";

const BLACKLIST_AVG_THRESHOLD = 25;
const BAD_PLAYLIST_TRACK_THRESHOLD = 40;
const BAD_PLAYLIST_MIN_TRACKS = 3;

/** After a track finishes (≥60s played), apply blacklist / bad-match rules. */
export async function runPostPlayChecks(
  admin: SupabaseClient,
  session: LiveSessionRow,
  queueItem: LiveQueueRow,
  trackStartedAt: string | null,
): Promise<{ flaggedUserId?: string; message?: string }> {
  if (!trackStartedAt) return {};

  const started = new Date(trackStartedAt).getTime();
  if (Date.now() - started < 60_000) return {};

  const { data: ratings } = await admin
    .from("live_session_ratings")
    .select("score, user_id")
    .eq("session_id", session.id)
    .eq("spotify_track_id", queueItem.spotify_track_id)
    .eq("is_retroactive", false)
    .neq("user_id", queueItem.user_id);

  const scores = (ratings ?? []).map((r) => r.score as number);
  if (scores.length === 0) {
    const legacy = await admin
      .from("live_ratings")
      .select("score, user_id")
      .eq("session_id", session.id)
      .eq("spotify_track_id", queueItem.spotify_track_id)
      .neq("user_id", queueItem.user_id);
    scores.push(...((legacy.data ?? []).map((r) => r.score as number)));
  }

  if (scores.length === 0) return {};

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg < BLACKLIST_AVG_THRESHOLD) {
    await admin.from("live_track_blacklist").upsert(
      {
        session_id: session.id,
        spotify_track_id: queueItem.spotify_track_id,
        reason: `Session average ${avg.toFixed(0)} below ${BLACKLIST_AVG_THRESHOLD}`,
      },
      { onConflict: "session_id,spotify_track_id" },
    );
  }

  const { data: ownerTracks } = await admin
    .from("live_queue")
    .select("spotify_track_id")
    .eq("session_id", session.id)
    .eq("user_id", queueItem.user_id)
    .not("played_at", "is", null);

  const trackIds = (ownerTracks ?? []).map((t) => t.spotify_track_id as string);
  if (trackIds.length < BAD_PLAYLIST_MIN_TRACKS) return {};

  let lowCount = 0;
  for (const tid of trackIds) {
    const { data: tr } = await admin
      .from("live_session_ratings")
      .select("score, user_id")
      .eq("session_id", session.id)
      .eq("spotify_track_id", tid)
      .eq("is_retroactive", false)
      .neq("user_id", queueItem.user_id);

    const ts = (tr ?? []).map((r) => r.score as number);
    if (ts.length === 0) continue;
    const tavg = ts.reduce((a, b) => a + b, 0) / ts.length;
    if (tavg < BAD_PLAYLIST_TRACK_THRESHOLD) lowCount++;
  }

  if (lowCount >= BAD_PLAYLIST_MIN_TRACKS) {
    await admin
      .from("live_session_sources")
      .update({ flagged_as_bad_match: true, updated_at: new Date().toISOString() })
      .eq("session_id", session.id)
      .eq("user_id", queueItem.user_id);

    return {
      flaggedUserId: queueItem.user_id,
      message:
        "Your playlist might not match this group's taste — consider switching",
    };
  }

  return {};
}
