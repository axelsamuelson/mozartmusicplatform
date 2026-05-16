import type { WamPlaylistRow } from "@/lib/types/playlists";

export function summarizePlaylistFilters(row: WamPlaylistRow): string {
  const parts: string[] = [];
  if (row.filter_genres?.length) {
    parts.push(
      row.filter_genres.length <= 2
        ? row.filter_genres.join(", ")
        : `${row.filter_genres.length} genres`,
    );
  }
  if (row.filter_mood_levels?.length) {
    parts.push(`Mood levels ${[...row.filter_mood_levels].sort((a, b) => a - b).join(", ")}`);
  }
  if (row.filter_moments?.length) {
    parts.push(
      row.filter_moments.length <= 2
        ? row.filter_moments.join(", ")
        : `${row.filter_moments.length} moments`,
    );
  }
  parts.push(`Min score ${row.filter_min_score}`);
  return parts.join(" · ");
}
