import {
  ratingMatchesPlaylistFilters,
  type WamPlaylistFilters,
} from "@/lib/playlist/matchRating";
import { filtersFromPlaylistRow } from "@/lib/playlist/playlistFilters";
import { sortPlaylistRatings } from "@/lib/playlist/sortOrder";
import { loadAllUserRatingsSlim } from "@/lib/ratings/normalize";
import type { RatingDetail } from "@/lib/types/ratings";
import type { PlaylistSortOrder, WamPlaylistRow } from "@/lib/types/playlists";
import type { SupabaseClient } from "@supabase/supabase-js";

export function wamPlaylistFiltersFromRow(row: WamPlaylistRow): WamPlaylistFilters {
  const f = filtersFromPlaylistRow(row);
  return {
    filter_genres: f.filter_genres.length ? f.filter_genres : null,
    filter_mood_levels: row.filter_mood_levels,
    filter_moments: f.filter_moments.length ? f.filter_moments : null,
    filter_min_score: f.filter_min_score,
    filter_vibes: f.filter_vibes.length ? f.filter_vibes : null,
    filter_tempo_min: f.filter_tempo_min,
    filter_tempo_max: f.filter_tempo_max,
    filter_intensity_min: f.filter_intensity_min,
    filter_intensity_max: f.filter_intensity_max,
    filter_release_year_min: f.filter_release_year_min,
    filter_release_year_max: f.filter_release_year_max,
  };
}

export async function loadMatchedPlaylistTracks(
  supabase: SupabaseClient,
  userId: string,
  row: WamPlaylistRow,
  sortOrder?: PlaylistSortOrder,
  preloadedRatings?: RatingDetail[],
): Promise<RatingDetail[]> {
  const filters = wamPlaylistFiltersFromRow(row);
  const ratings =
    preloadedRatings ?? (await loadAllUserRatingsSlim(supabase, userId, "track"));
  const matched = ratings.filter((r) => ratingMatchesPlaylistFilters(r, filters));
  return sortPlaylistRatings(matched, sortOrder ?? row.sort_order);
}
