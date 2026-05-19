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

function hasUsableTrackNames(items: LiveQueueDisplayItem[]): boolean {
  return items.some(
    (row) =>
      row.track_name.trim().length > 0 &&
      row.track_name !== "Unknown track",
  );
}

export function getCachedPlaybackQueueDisplay(
  sessionId: string,
  trackId: string | null,
  pendingCount: number,
): LiveQueueDisplayItem[] | null {
  const key = cacheKey(sessionId, trackId, pendingCount);
  const hit = bySession.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    bySession.delete(key);
    return null;
  }
  if (!hasUsableTrackNames(hit.items)) {
    bySession.delete(key);
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
