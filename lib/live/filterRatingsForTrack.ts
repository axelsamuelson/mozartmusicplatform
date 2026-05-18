import type { LiveRatingRow, LiveSessionRow } from "@/lib/types/live";

/** Ratings for the track that is currently playing in the session. */
export function ratingsForCurrentTrack(
  ratings: LiveRatingRow[],
  session: LiveSessionRow,
): LiveRatingRow[] {
  const trackId = session.spotify_track_id;
  if (!trackId) return [];
  return ratings.filter((r) => r.spotify_track_id === trackId);
}
