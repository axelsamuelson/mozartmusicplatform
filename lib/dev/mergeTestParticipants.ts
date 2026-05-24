import type { EnsuredTestUser } from "@/lib/dev/ensureLiveTestUsers";
import type { LivePresenceMember, LiveRatingRow } from "@/lib/types/live";

export function mergeTestParticipants(
  realtime: LivePresenceMember[],
  testUsers: EnsuredTestUser[],
  ratingsForCurrentTrack: LiveRatingRow[],
  opts?: { enabled?: boolean; minCount?: number },
): LivePresenceMember[] {
  const enabled = opts?.enabled ?? true;
  const minCount = opts?.minCount ?? testUsers.length;
  if (!enabled || testUsers.length === 0) return realtime;

  const ratedUserIds = new Set(
    ratingsForCurrentTrack.map((r) => r.user_id),
  );

  const byUserId = new Map<string, LivePresenceMember>();

  for (const t of testUsers) {
    byUserId.set(t.userId, {
      userId: t.userId,
      displayName: t.displayName,
      avatarUrl: null,
      hasRated: ratedUserIds.has(t.userId),
    });
  }

  for (const p of realtime) {
    const existing = byUserId.get(p.userId);
    if (existing) {
      byUserId.set(p.userId, {
        ...existing,
        displayName: p.displayName || existing.displayName,
        avatarUrl: p.avatarUrl ?? existing.avatarUrl,
        hasRated: p.hasRated || existing.hasRated,
      });
    } else {
      byUserId.set(p.userId, p);
    }
  }

  let merged = [...byUserId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  if (merged.length < minCount) {
    let i = 0;
    while (merged.length < minCount && i < testUsers.length) {
      const t = testUsers[i]!;
      if (!byUserId.has(t.userId)) {
        merged.push({
          userId: t.userId,
          displayName: t.displayName,
          avatarUrl: null,
          hasRated: ratedUserIds.has(t.userId),
        });
      }
      i += 1;
    }
    merged = merged.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return merged;
}
