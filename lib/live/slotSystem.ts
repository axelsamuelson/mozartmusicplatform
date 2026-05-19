/** Slot weighting for WAM Jams round-robin rotation. */

export function calculateSlots(avgScore: number | null): number {
  if (avgScore == null || Number.isNaN(avgScore)) return 3;
  if (avgScore < 40) return 2;
  if (avgScore < 70) return 3;
  if (avgScore < 90) return 4;
  return 5;
}

export type RoundRobinParticipant = {
  userId: string;
  slots: number;
  tracksPlayed: number;
  joinedAt: string;
  sourceType?: "playlist" | "top_rated" | "none";
};

/** One full weighted cycle (e.g. Axel×4, Sara×3, Johan×2 → 9 picks). */
export function buildRoundRobinCycle(
  participants: RoundRobinParticipant[],
): string[] {
  if (participants.length === 0) return [];

  const sorted = [...participants].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
  );

  const remaining = new Map(sorted.map((p) => [p.userId, p.slots]));
  const cycle: string[] = [];
  const totalSlots = sorted.reduce((sum, p) => sum + p.slots, 0);

  while (cycle.length < totalSlots) {
    let advanced = false;
    for (const p of sorted) {
      const left = remaining.get(p.userId) ?? 0;
      if (left > 0) {
        cycle.push(p.userId);
        remaining.set(p.userId, left - 1);
        advanced = true;
      }
    }
    if (!advanced) break;
  }

  return cycle;
}

/**
 * Next userId in slot-weighted rotation.
 * Global position = sum of tracksPlayed across eligible participants.
 */
export function getRoundRobinOrder(participants: RoundRobinParticipant[]): string | null {
  const pool = participants.filter(
    (p) => p.slots > 0 && p.sourceType !== "none",
  );
  if (pool.length === 0) return null;

  const cycle = buildRoundRobinCycle(pool);
  if (cycle.length === 0) return null;

  const totalPlayed = pool.reduce((sum, p) => sum + p.tracksPlayed, 0);
  return cycle[totalPlayed % cycle.length] ?? null;
}
