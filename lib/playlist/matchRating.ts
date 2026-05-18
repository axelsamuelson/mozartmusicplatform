import type { RatingDetail } from "@/lib/types/ratings";

export interface WamPlaylistFilters {
  filter_genres: string[] | null;
  filter_mood_levels: number[] | null;
  filter_moments: string[] | null;
  filter_min_score: number;
}

export function ratingMatchesPlaylistFilters(
  r: RatingDetail,
  f: WamPlaylistFilters,
): boolean {
  if (!r.item || r.item.type !== "track") return false;
  if (r.score < f.filter_min_score) return false;

  const genreNames = r.genres.map((g) => g.name);
  if (f.filter_genres?.length) {
    if (!genreNames.some((n) => f.filter_genres!.includes(n))) return false;
  }

  if (f.filter_mood_levels?.length) {
    if (!r.mood || !f.filter_mood_levels.includes(r.mood.level)) return false;
  }

  const momentNames = r.moments.map((m) => m.name);
  if (f.filter_moments?.length) {
    if (!momentNames.some((n) => f.filter_moments!.includes(n))) return false;
  }

  return true;
}

/** Re-sync when the rating newly matches, or used to match (e.g. score lowered). */
export function playlistNeedsResyncForRating(
  rating: RatingDetail,
  filters: WamPlaylistFilters,
  previousScore?: number,
): boolean {
  if (ratingMatchesPlaylistFilters(rating, filters)) return true;
  if (previousScore === undefined) return false;
  return ratingMatchesPlaylistFilters({ ...rating, score: previousScore }, filters);
}

export function trackUrisFromRatings(ratings: RatingDetail[]): string[] {
  return ratings
    .filter((r) => r.item?.type === "track")
    .map((r) => `spotify:track:${r.spotify_id}`);
}
