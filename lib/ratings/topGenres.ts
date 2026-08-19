import type { SupabaseClient } from "@supabase/supabase-js";

export const TOP_GENRE_LIMIT = 3;

const RATINGS_PAGE = 1000;

export function sortGenreTagsByPopularity<T extends { id: number; name: string }>(
  tags: T[],
  topIds: number[],
): { top: T[]; rest: T[] } {
  const rank = new Map(
    topIds.slice(0, TOP_GENRE_LIMIT).map((id, i) => [id, i] as const),
  );
  const top: T[] = [];
  const rest: T[] = [];
  for (const tag of tags) {
    if (rank.has(tag.id)) top.push(tag);
    else rest.push(tag);
  }
  top.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  rest.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { top, rest };
}

/** Most-used genre tag ids for this user, highest count first. */
export async function loadTopGenreIds(
  supabase: SupabaseClient,
  userId: string,
  limit = TOP_GENRE_LIMIT,
): Promise<number[]> {
  const tally = new Map<number, number>();

  for (let from = 0; ; from += RATINGS_PAGE) {
    const { data, error } = await supabase
      .from("rating_genres")
      .select("genre_tag_id, ratings!inner(user_id)")
      .eq("ratings.user_id", userId)
      .range(from, from + RATINGS_PAGE - 1);

    if (error) {
      console.warn("[topGenres]", error.message);
      break;
    }

    const rows = data ?? [];
    for (const row of rows) {
      const id = Number(row.genre_tag_id);
      if (!Number.isInteger(id) || id <= 0) continue;
      tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    if (rows.length < RATINGS_PAGE) break;
  }

  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([id]) => id);
}
