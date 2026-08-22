import { ensureLiveTestUsers } from "@/lib/dev/ensureLiveTestUsers";
import { MIN_LIVE_TEST_USERS } from "@/lib/dev/liveTestPersonas";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_SCORES = [72, 58, 91, 44];

export async function seedLiveTestRatings(
  sessionId: string,
  trackId: string,
  scores: number[] = DEFAULT_SCORES,
): Promise<{ insertedCount: number; skippedCount: number }> {
  const testUsers = await ensureLiveTestUsers();
  if (testUsers.length < MIN_LIVE_TEST_USERS) {
    throw new Error(`Expected ${MIN_LIVE_TEST_USERS} test users`);
  }

  const admin = createAdminClient();
  let insertedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < testUsers.length; i++) {
    const t = testUsers[i]!;
    const score = scores[i] ?? DEFAULT_SCORES[i % DEFAULT_SCORES.length]!;

    const { data: existing } = await admin
      .from("live_ratings")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", t.userId)
      .eq("spotify_track_id", trackId)
      .maybeSingle();

    if (existing?.id) {
      skippedCount += 1;
      continue;
    }

    const { error: insErr } = await admin.from("live_ratings").insert({
      session_id: sessionId,
      user_id: t.userId,
      spotify_track_id: trackId,
      display_name: t.displayName,
      score,
      tempo: (i % 10) + 1,
      intensity: ((i + 2) % 10) + 1,
      genre_ids: [],
      comment: null,
    });

    if (insErr) {
      throw new Error(`${t.displayName}: ${insErr.message}`);
    }
    insertedCount += 1;
  }

  return { insertedCount, skippedCount };
}
