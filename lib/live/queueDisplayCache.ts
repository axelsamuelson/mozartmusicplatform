import type { LiveQueueDisplayItem } from "@/lib/live/liveQueueDisplay";

/** Server-side cache for host playback preview rows (no Spotify on cache hit). */
const TTL_MS = 60_000;

type Entry = {
  at: number;
  items: LiveQueueDisplayItem[];
};

const bySession = new Map<string, Entry>();

function cacheKey(sessionId: string, trackId: string | null, pendingCount: number): string {
  return `${sessionId}:${trackId ?? "none"}:${pendingCount}`;
}

export function getCachedPlaybackQueueDisplay(
  sessionId: string,
  trackId: string | null,
  pendingCount: number,
): LiveQueueDisplayItem[] | null {
  const hit = bySession.get(cacheKey(sessionId, trackId, pendingCount));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    bySession.delete(cacheKey(sessionId, trackId, pendingCount));
    return null;
  }
  return hit.items;
}

export function setCachedPlaybackQueueDisplay(
  sessionId: string,
  trackId: string | null,
  pendingCount: number,
  items: LiveQueueDisplayItem[],
): void {
  bySession.set(cacheKey(sessionId, trackId, pendingCount), {
    at: Date.now(),
    items,
  });
}

export function invalidatePlaybackQueueDisplayCache(sessionId: string): void {
  for (const key of bySession.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      bySession.delete(key);
    }
  }
}
