import type { SupabaseClient } from "@supabase/supabase-js";

import type { LiveRatingRow } from "@/lib/types/live";
import type { MoodTagRow } from "@/lib/types/ratings";

export async function loadLiveRatingsForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<LiveRatingRow[]> {
  const { data, error } = await supabase
    .from("live_ratings")
    .select(
      "id, session_id, user_id, display_name, score, mood_tag_id, genre_ids, comment, submitted_at",
    )
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: true });

  if (error) throw new Error(error.message);

  const moodIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.mood_tag_id as number | null)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

  let moodById = new Map<number, MoodTagRow>();
  if (moodIds.length) {
    const { data: moods } = await supabase
      .from("mood_tags")
      .select("id, level, name, description, color")
      .in("id", moodIds);
    for (const m of moods ?? []) {
      moodById.set(m.id as number, m as MoodTagRow);
    }
  }

  return (data ?? []).map((row) => {
    const moodId = row.mood_tag_id as number | null;
    return {
      id: row.id as string,
      session_id: row.session_id as string,
      user_id: row.user_id as string,
      display_name: row.display_name as string | null,
      score: row.score as number,
      mood_tag_id: moodId,
      genre_ids: Array.isArray(row.genre_ids)
        ? (row.genre_ids as number[])
        : [],
      comment: row.comment as string | null,
      submitted_at: row.submitted_at as string,
      mood: moodId != null ? moodById.get(moodId) ?? null : null,
    };
  });
}
