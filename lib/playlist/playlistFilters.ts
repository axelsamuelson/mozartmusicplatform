import { parsePlaylistSortOrder } from "@/lib/playlist/sortOrder";
import type { PlaylistSortOrder, WamPlaylistRow } from "@/lib/types/playlists";

export type PlaylistFiltersState = {
  filter_genres: string[];
  filter_moments: string[];
  filter_min_score: number;
  filter_vibes: string[];
  filter_tempo_min: number | null;
  filter_tempo_max: number | null;
  filter_intensity_min: number | null;
  filter_intensity_max: number | null;
  filter_release_year_min: number | null;
  filter_release_year_max: number | null;
};

export function emptyPlaylistFilters(): PlaylistFiltersState {
  return {
    filter_genres: [],
    filter_moments: [],
    filter_min_score: 0,
    filter_vibes: [],
    filter_tempo_min: null,
    filter_tempo_max: null,
    filter_intensity_min: null,
    filter_intensity_max: null,
    filter_release_year_min: null,
    filter_release_year_max: null,
  };
}

export function filtersFromPlaylistRow(row: WamPlaylistRow): PlaylistFiltersState {
  return {
    filter_genres: row.filter_genres ?? [],
    filter_moments: row.filter_moments ?? [],
    filter_min_score: row.filter_min_score,
    filter_vibes: row.filter_vibes ?? [],
    filter_tempo_min: row.filter_tempo_min ?? null,
    filter_tempo_max: row.filter_tempo_max ?? null,
    filter_intensity_min: row.filter_intensity_min ?? null,
    filter_intensity_max: row.filter_intensity_max ?? null,
    filter_release_year_min: row.filter_release_year_min ?? null,
    filter_release_year_max: row.filter_release_year_max ?? null,
  };
}

function clampScale1to10(n: unknown): number | null {
  if (n == null) return null;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function clampYear(n: unknown): number | null {
  if (n == null) return null;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const y = Math.round(n);
  if (y < 1900 || y > 2100) return null;
  return y;
}

export function parsePlaylistFiltersInput(body: {
  filter_genres?: unknown;
  filter_moments?: unknown;
  filter_min_score?: unknown;
  filter_vibes?: unknown;
  filter_tempo_min?: unknown;
  filter_tempo_max?: unknown;
  filter_intensity_min?: unknown;
  filter_intensity_max?: unknown;
  filter_release_year_min?: unknown;
  filter_release_year_max?: unknown;
}): PlaylistFiltersState {
  const filter_vibes = Array.isArray(body.filter_vibes)
    ? body.filter_vibes.filter((x): x is string => typeof x === "string")
    : [];

  return {
    filter_genres: Array.isArray(body.filter_genres)
      ? body.filter_genres.filter((x): x is string => typeof x === "string")
      : [],
    filter_moments: Array.isArray(body.filter_moments)
      ? body.filter_moments.filter((x): x is string => typeof x === "string")
      : [],
    filter_min_score:
      typeof body.filter_min_score === "number" &&
      Number.isFinite(body.filter_min_score)
        ? Math.max(0, Math.min(100, Math.round(body.filter_min_score)))
        : 0,
    filter_vibes,
    filter_tempo_min:
      filter_vibes.length === 0 ? clampScale1to10(body.filter_tempo_min) : null,
    filter_tempo_max:
      filter_vibes.length === 0 ? clampScale1to10(body.filter_tempo_max) : null,
    filter_intensity_min:
      filter_vibes.length === 0
        ? clampScale1to10(body.filter_intensity_min)
        : null,
    filter_intensity_max:
      filter_vibes.length === 0
        ? clampScale1to10(body.filter_intensity_max)
        : null,
    filter_release_year_min: clampYear(body.filter_release_year_min),
    filter_release_year_max: clampYear(body.filter_release_year_max),
  };
}

export function playlistFiltersToDbColumns(
  filters: PlaylistFiltersState,
): Record<string, unknown> {
  return {
    filter_genres: filters.filter_genres.length ? filters.filter_genres : null,
    filter_moments: filters.filter_moments.length ? filters.filter_moments : null,
    filter_min_score: filters.filter_min_score,
    filter_vibes: filters.filter_vibes.length ? filters.filter_vibes : null,
    filter_tempo_min: filters.filter_tempo_min,
    filter_tempo_max: filters.filter_tempo_max,
    filter_intensity_min: filters.filter_intensity_min,
    filter_intensity_max: filters.filter_intensity_max,
    filter_release_year_min: filters.filter_release_year_min,
    filter_release_year_max: filters.filter_release_year_max,
  };
}

export function parsePlaylistPatchBody(body: {
  sort_order?: unknown;
  filter_genres?: unknown;
  filter_moments?: unknown;
  filter_min_score?: unknown;
  filter_vibes?: unknown;
  filter_tempo_min?: unknown;
  filter_tempo_max?: unknown;
  filter_intensity_min?: unknown;
  filter_intensity_max?: unknown;
  filter_release_year_min?: unknown;
  filter_release_year_max?: unknown;
}): {
  sort_order?: PlaylistSortOrder;
  filters?: PlaylistFiltersState;
} {
  const out: {
    sort_order?: PlaylistSortOrder;
    filters?: PlaylistFiltersState;
  } = {};

  if (body.sort_order !== undefined) {
    const sort = parsePlaylistSortOrder(body.sort_order);
    if (!sort) throw new Error("Invalid sort_order");
    out.sort_order = sort;
  }

  const hasFilterField =
    body.filter_genres !== undefined ||
    body.filter_moments !== undefined ||
    body.filter_min_score !== undefined ||
    body.filter_vibes !== undefined ||
    body.filter_tempo_min !== undefined ||
    body.filter_tempo_max !== undefined ||
    body.filter_intensity_min !== undefined ||
    body.filter_intensity_max !== undefined ||
    body.filter_release_year_min !== undefined ||
    body.filter_release_year_max !== undefined;

  if (hasFilterField) {
    out.filters = parsePlaylistFiltersInput(body);
  }

  return out;
}

export function filtersStateKey(f: PlaylistFiltersState): string {
  return JSON.stringify(f);
}
