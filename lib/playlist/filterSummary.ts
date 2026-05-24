import { playlistSortOrderLabel } from "@/lib/playlist/sortOrder";
import { vibePresetById } from "@/lib/playlist/tempoIntensityPresets";
import type { WamPlaylistRow } from "@/lib/types/playlists";

function formatRange(
  label: string,
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min === max) return `${label} ${min}`;
  if (min != null && max != null) return `${label} ${min}–${max}`;
  if (min != null) return `${label} ≥${min}`;
  if (max != null) return `${label} ≤${max}`;
  return null;
}

export function summarizePlaylistFilters(row: WamPlaylistRow): string {
  const parts: string[] = [];
  if (row.filter_genres?.length) {
    parts.push(
      row.filter_genres.length <= 2
        ? row.filter_genres.join(", ")
        : `${row.filter_genres.length} genres`,
    );
  }
  if (row.filter_vibes?.length) {
    const labels = row.filter_vibes
      .map((id) => vibePresetById(id)?.label ?? id)
      .slice(0, 3);
    parts.push(
      row.filter_vibes.length <= 2
        ? labels.join(", ")
        : `${row.filter_vibes.length} vibes`,
    );
  } else {
    const tempo = formatRange(
      "Tempo",
      row.filter_tempo_min,
      row.filter_tempo_max,
    );
    const intensity = formatRange(
      "Intensity",
      row.filter_intensity_min,
      row.filter_intensity_max,
    );
    if (tempo) parts.push(tempo);
    if (intensity) parts.push(intensity);
  }
  if (row.filter_mood_levels?.length && !row.filter_vibes?.length) {
    const hasCustom =
      row.filter_tempo_min != null ||
      row.filter_tempo_max != null ||
      row.filter_intensity_min != null ||
      row.filter_intensity_max != null;
    if (!hasCustom) {
      parts.push(
        `Mood ${[...row.filter_mood_levels].sort((a, b) => a - b).join(", ")}`,
      );
    }
  }
  if (
    row.filter_release_year_min != null ||
    row.filter_release_year_max != null
  ) {
    const yMin = row.filter_release_year_min;
    const yMax = row.filter_release_year_max;
    if (yMin != null && yMax != null) {
      parts.push(yMin === yMax ? `${yMin}` : `${yMin}–${yMax}`);
    } else if (yMin != null) {
      parts.push(`from ${yMin}`);
    } else if (yMax != null) {
      parts.push(`until ${yMax}`);
    }
  }
  if (row.filter_moments?.length) {
    parts.push(
      row.filter_moments.length <= 2
        ? row.filter_moments.join(", ")
        : `${row.filter_moments.length} moments`,
    );
  }
  parts.push(`Min score ${row.filter_min_score}`);
  parts.push(playlistSortOrderLabel(row.sort_order));
  return parts.join(" · ");
}
