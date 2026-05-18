import type { LiveRatingRow, LiveSessionAggregate } from "@/lib/types/live";
import type { MoodTagRow } from "@/lib/types/ratings";

export function aggregateLiveRatings(
  ratings: LiveRatingRow[],
  moodCatalog: MoodTagRow[],
): LiveSessionAggregate {
  const rated_count = ratings.length;
  const average_score =
    rated_count > 0
      ? Math.round(
          ratings.reduce((a, r) => a + r.score, 0) / rated_count,
        )
      : null;

  const moodMap = new Map<number, number>();
  for (const r of ratings) {
    if (r.mood_tag_id == null) continue;
    moodMap.set(r.mood_tag_id, (moodMap.get(r.mood_tag_id) ?? 0) + 1);
  }

  const mood_counts = moodCatalog
    .filter((m) => moodMap.has(m.id))
    .map((mood) => ({ mood, count: moodMap.get(mood.id)! }))
    .sort((a, b) => b.count - a.count);

  return {
    average_score,
    rated_count,
    participant_count: rated_count,
    mood_counts,
  };
}
