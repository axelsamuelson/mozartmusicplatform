import type { RecentTrack } from "@/lib/playback/recentTrack";

/**
 * Merge score lookup into recent tracks.
 * When `authoritativeIds` is set, missing ids become `score: null`
 * (so deletes clear badges). Otherwise unknown ids keep prior scores.
 */
export function applyRecentTrackScores(
  tracks: RecentTrack[],
  scores: Record<string, number>,
  authoritativeIds?: Iterable<string>,
): RecentTrack[] {
  if (!tracks.length) return tracks;
  const authoritative = authoritativeIds
    ? new Set(authoritativeIds)
    : null;

  return tracks.map((t) => {
    const fromMap = scores[t.spotifyId];
    const hasMap = typeof fromMap === "number" && Number.isFinite(fromMap);

    if (authoritative?.has(t.spotifyId)) {
      const score = hasMap ? fromMap : null;
      return score === t.score ? t : { ...t, score };
    }

    if (hasMap) {
      return fromMap === t.score ? t : { ...t, score: fromMap };
    }
    return t;
  });
}
