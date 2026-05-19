import type { LiveQueueRow } from "@/lib/types/live";

/** Users ordered by who queued first in the session. */
function roundRobinUserOrder(pending: LiveQueueRow[]): string[] {
  const byUser = new Map<string, LiveQueueRow[]>();
  for (const item of pending) {
    const list = byUser.get(item.user_id) ?? [];
    list.push(item);
    byUser.set(item.user_id, list);
  }
  for (const list of byUser.values()) {
    list.sort(
      (a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime(),
    );
  }
  return [...byUser.keys()].sort((a, b) => {
    const aFirst = byUser.get(a)![0]!;
    const bFirst = byUser.get(b)![0]!;
    return new Date(aFirst.queued_at).getTime() - new Date(bFirst.queued_at).getTime();
  });
}

/**
 * Default WAM Sessions order: user1 track1 → user2 track1 → user3 track1 → user1 track2 …
 */
export function pickNextRoundRobinQueueItem(
  pending: LiveQueueRow[],
  playedCounts: Map<string, number>,
): LiveQueueRow | null {
  if (pending.length === 0) return null;

  const byUser = new Map<string, LiveQueueRow[]>();
  for (const item of pending) {
    const list = byUser.get(item.user_id) ?? [];
    list.push(item);
    byUser.set(item.user_id, list);
  }
  for (const list of byUser.values()) {
    list.sort(
      (a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime(),
    );
  }

  const userOrder = roundRobinUserOrder(pending);
  let pickUserId: string | null = null;
  let minPlayed = Infinity;

  for (const userId of userOrder) {
    const played = playedCounts.get(userId) ?? 0;
    if (played < minPlayed) {
      minPlayed = played;
      pickUserId = userId;
    }
  }

  if (!pickUserId) return null;
  return byUser.get(pickUserId)?.[0] ?? null;
}

export function orderPendingRoundRobin(
  pending: LiveQueueRow[],
  playedCounts: Map<string, number>,
): LiveQueueRow[] {
  const remaining = [...pending];
  const ordered: LiveQueueRow[] = [];
  const counts = new Map(playedCounts);

  while (remaining.length > 0) {
    const next = pickNextRoundRobinQueueItem(remaining, counts);
    if (!next) break;
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    counts.set(next.user_id, (counts.get(next.user_id) ?? 0) + 1);
  }

  return ordered;
}

export function assignRoundRobinQueuePositions(
  pending: LiveQueueRow[],
  playedItems: Pick<LiveQueueRow, "user_id" | "played_at">[],
): { id: string; position: number }[] {
  const playedCounts = new Map<string, number>();
  for (const item of playedItems) {
    if (!item.played_at) continue;
    playedCounts.set(item.user_id, (playedCounts.get(item.user_id) ?? 0) + 1);
  }
  const ordered = orderPendingRoundRobin(pending, playedCounts);
  return ordered.map((item, index) => ({
    id: item.id,
    position: index + 1,
  }));
}
