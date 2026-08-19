import type { RatingDetail } from "@/lib/types/ratings";
import type { RankedPlaylistTrack, TrackRank } from "@/lib/types/trackPlaylists";

function isScoredTrack(r: RatingDetail): boolean {
  return r.item?.type === "track" && typeof r.score === "number" && Number.isFinite(r.score);
}

/** Competition rank by score (ties share a place). Higher score = better rank. */
export function rankTrackByScore(
  ratings: RatingDetail[],
  trackId: string,
): TrackRank | null {
  const tracks = ratings.filter(isScoredTrack);
  const target = tracks.find((r) => r.spotify_id === trackId);
  if (!target) return null;
  const better = tracks.filter((r) => r.score > target.score).length;
  return { position: better + 1, total: tracks.length };
}

export function rankTrackInIdSet(
  ratings: RatingDetail[],
  trackIds: ReadonlySet<string> | readonly string[],
  trackId: string,
): TrackRank | null {
  const idSet = trackIds instanceof Set ? trackIds : new Set(trackIds);
  return rankTrackByScore(
    ratings.filter((r) => idSet.has(r.spotify_id)),
    trackId,
  );
}

/** Score-desc list with competition ranks (ties share a place). */
export function rankedTracksByScore(ratings: RatingDetail[]): RankedPlaylistTrack[] {
  const tracks = ratings.filter(isScoredTrack);
  const total = tracks.length;
  const sorted = [...tracks].sort(
    (a, b) =>
      b.score - a.score ||
      (a.item?.name ?? "").localeCompare(b.item?.name ?? "", undefined, {
        sensitivity: "base",
      }),
  );
  let position = 1;
  return sorted.map((r, i) => {
    if (i > 0 && r.score < sorted[i - 1]!.score) position = i + 1;
    return {
      spotify_id: r.spotify_id,
      name: r.item?.name ?? r.spotify_id,
      artist_name: r.item?.artist_name ?? null,
      image_url: r.item?.image_url ?? null,
      score: r.score,
      rank: { position, total },
      tempo: r.tempo,
      intensity: r.intensity,
    };
  });
}
