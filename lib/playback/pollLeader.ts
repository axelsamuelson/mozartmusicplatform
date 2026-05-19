const POLL_LOCK_KEY = "wam-playback-poll-lock";
const LOCK_TTL_MS = 5_000;

function randomTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const tabId =
  typeof window !== "undefined" ? randomTabId() : "server";

export function getPlaybackTabId(): string {
  return tabId;
}

export function tryBecomePollLeader(): boolean {
  if (typeof window === "undefined") return true;

  const now = Date.now();
  try {
    const existing = localStorage.getItem(POLL_LOCK_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as { tabId?: string; at?: number };
      if (
        typeof parsed.at === "number" &&
        now - parsed.at < LOCK_TTL_MS &&
        parsed.tabId !== tabId
      ) {
        return false;
      }
    }
    localStorage.setItem(
      POLL_LOCK_KEY,
      JSON.stringify({ tabId, at: now }),
    );
    return true;
  } catch {
    return true;
  }
}

export function startPollLeaderHeartbeat(
  onLeaderChange: (isLeader: boolean) => void,
): () => void {
  if (typeof window === "undefined") {
    onLeaderChange(true);
    return () => {};
  }

  let isLeader = tryBecomePollLeader();
  onLeaderChange(isLeader);

  const id = window.setInterval(() => {
    const next = tryBecomePollLeader();
    if (next !== isLeader) {
      isLeader = next;
      onLeaderChange(isLeader);
    } else if (isLeader) {
      tryBecomePollLeader();
    }
  }, 3_000);

  return () => window.clearInterval(id);
}
