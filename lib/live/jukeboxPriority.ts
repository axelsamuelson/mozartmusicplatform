import { normalizeJukeboxRankingMode } from "@/lib/live/jukeboxRanking";
import type { JukeboxRankingMode, LiveQueueRow, LiveScoreRow } from "@/lib/types/live";

export const MAX_QUEUE_TRACKS_PER_USER = 3;

export function pointsForTrackAverage(avg: number): number {
  if (avg >= 80) return 30;
  if (avg >= 60) return 20;
  if (avg >= 40) return 10;
  return 0;
}

export function playedCountByUser(
  items: Pick<LiveQueueRow, "user_id" | "played_at">[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.played_at) continue;
    counts.set(item.user_id, (counts.get(item.user_id) ?? 0) + 1);
  }
  return counts;
}

/** Lower value = higher queue priority (plays sooner). */
function rankingTieValue(
  userId: string,
  mode: JukeboxRankingMode,
  scores: LiveScoreRow[],
): number {
  const row = scores.find((s) => s.user_id === userId);
  if (mode === "average") {
    return row?.avg_score ?? -1;
  }
  return row?.points ?? 0;
}

/** Negative if `a` should play before `b`. */
export function compareQueuePriority(
  a: LiveQueueRow,
  b: LiveQueueRow,
  scores: LiveScoreRow[],
  playedCounts: Map<string, number>,
  rankingMode?: string | null,
): number {
  const mode = normalizeJukeboxRankingMode(rankingMode);
  const aPlayed = playedCounts.get(a.user_id) ?? 0;
  const bPlayed = playedCounts.get(b.user_id) ?? 0;
  if (aPlayed !== bPlayed) return aPlayed - bPlayed;

  const aRank = rankingTieValue(a.user_id, mode, scores);
  const bRank = rankingTieValue(b.user_id, mode, scores);
  if (aRank !== bRank) return aRank - bRank;

  return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
}

export function pickNextQueueItem(
  pending: LiveQueueRow[],
  scores: LiveScoreRow[],
  playedCounts: Map<string, number>,
  rankingMode?: string | null,
): LiveQueueRow | null {
  if (pending.length === 0) return null;

  let best = pending[0]!;
  for (let i = 1; i < pending.length; i++) {
    const candidate = pending[i]!;
    if (
      compareQueuePriority(candidate, best, scores, playedCounts, rankingMode) < 0
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Full play order for pending items (simulated picks without incrementing played counts). */
export function orderPendingQueue(
  pending: LiveQueueRow[],
  scores: LiveScoreRow[],
  playedCounts: Map<string, number>,
  rankingMode?: string | null,
): LiveQueueRow[] {
  const remaining = [...pending];
  const ordered: LiveQueueRow[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (
        compareQueuePriority(
          remaining[i]!,
          remaining[bestIndex]!,
          scores,
          playedCounts,
          rankingMode,
        ) < 0
      ) {
        bestIndex = i;
      }
    }
    ordered.push(remaining[bestIndex]!);
    remaining.splice(bestIndex, 1);
  }

  return ordered;
}

export function assignQueuePositions(
  pending: LiveQueueRow[],
  scores: LiveScoreRow[],
  playedItems: Pick<LiveQueueRow, "user_id" | "played_at">[],
  rankingMode?: string | null,
): { id: string; position: number }[] {
  const playedCounts = playedCountByUser(playedItems);
  const ordered = orderPendingQueue(pending, scores, playedCounts, rankingMode);
  return ordered.map((item, index) => ({
    id: item.id,
    position: index + 1,
  }));
}
