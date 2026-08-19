import type { SupabaseClient } from "@supabase/supabase-js";

export type ScoreHistoryEntry = {
  score: number;
  recorded_at: string;
};

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    (typeof error.message === "string" &&
      error.message.includes("rating_score_history"))
  );
}

/** Chronological score snapshots for one of the current user’s ratings. */
export async function loadScoreHistory(
  supabase: SupabaseClient,
  userId: string,
  spotifyId: string,
): Promise<ScoreHistoryEntry[]> {
  const { data, error } = await supabase
    .from("rating_score_history")
    .select("score, recorded_at")
    .eq("user_id", userId)
    .eq("spotify_id", spotifyId)
    .order("recorded_at", { ascending: true });

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn("[scoreHistory]", error.message);
    }
    return [];
  }

  const rows: ScoreHistoryEntry[] = [];
  for (const row of data ?? []) {
    const score = Number(row.score);
    const recorded_at =
      typeof row.recorded_at === "string" ? row.recorded_at : null;
    if (!Number.isInteger(score) || !recorded_at) continue;
    rows.push({ score, recorded_at });
  }
  return rows;
}
