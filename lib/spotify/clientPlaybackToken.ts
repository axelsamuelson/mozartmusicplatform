import { fetchWithRetry } from "@/lib/http/fetchRetry";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_EXPIRES_IN_SEC = 3600;
const REFRESH_AHEAD_MS = 5 * 60 * 1000;
const STALE_GRACE_MS = 5 * 60 * 1000;
const KEEPALIVE_MS = 10 * 60 * 1000;

type CachedToken = {
  token: string;
  expiresAt: number;
};

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let lastAuthFailure = false;

export function invalidatePlaybackAccessToken(): void {
  cached = null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cachedIfUsable(allowStale: boolean): string | null {
  if (!cached) return null;
  const now = Date.now();
  if (cached.expiresAt - REFRESH_AHEAD_MS > now) return cached.token;
  if (cached.expiresAt > now) return cached.token;
  if (allowStale && cached.expiresAt + STALE_GRACE_MS > now) return cached.token;
  return null;
}

async function fetchAccessTokenFromApi(): Promise<{
  token: string;
  expiresIn: number;
} | null> {
  lastAuthFailure = false;
  let res = await fetchWithRetry(
    "/api/spotify/token",
    { cache: "no-store" },
    { retries: 3, delaysMs: [200, 600, 1_200, 2_000] },
  );

  if (res.status === 401) {
    const supabase = createClient();
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      res = await fetchWithRetry(
        "/api/spotify/token",
        { cache: "no-store" },
        { retries: 2, delaysMs: [250, 700] },
      );
    }
  }

  if (res.ok) {
    const body = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (typeof body.access_token === "string" && body.access_token.length > 0) {
      const expiresIn =
        typeof body.expires_in === "number" && body.expires_in > 0
          ? body.expires_in
          : DEFAULT_EXPIRES_IN_SEC;
      return { token: body.access_token, expiresIn };
    }
    return null;
  }

  if (res.status === 401) {
    lastAuthFailure = true;
  }
  return null;
}

async function refreshPlaybackAccessToken(): Promise<string> {
  if (inflight) return inflight;

  inflight = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fresh = await fetchAccessTokenFromApi();
        if (fresh) {
          cached = {
            token: fresh.token,
            expiresAt: Date.now() + fresh.expiresIn * 1000,
          };
          lastAuthFailure = false;
          return fresh.token;
        }
      } catch (e) {
        lastError = e;
      }
      const fallback = cachedIfUsable(true);
      if (fallback) return fallback;
      if (lastAuthFailure) break;
      await wait(300 * 2 ** attempt);
    }

    const fallback = cachedIfUsable(true);
    if (fallback) return fallback;

    if (lastAuthFailure) {
      throw new Error(
        "Spotify session expired. Sign out and sign in with Spotify again.",
      );
    }
    if (lastError instanceof Error && lastError.message.trim()) {
      throw new Error(lastError.message);
    }
    throw new Error("Could not refresh Spotify. Check your connection and try again.");
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Cached token, refreshing in the background before Spotify expiry. */
export async function getPlaybackAccessToken(): Promise<string> {
  const ready = cachedIfUsable(false);
  if (ready && cached && cached.expiresAt - REFRESH_AHEAD_MS > Date.now()) {
    return ready;
  }
  if (ready) {
    void refreshPlaybackAccessToken().catch(() => {});
    return ready;
  }
  return refreshPlaybackAccessToken();
}

export function startPlaybackTokenKeepalive(): void {
  if (keepaliveTimer != null) return;
  void getPlaybackAccessToken().catch(() => {});
  keepaliveTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    void getPlaybackAccessToken().catch(() => {});
  }, KEEPALIVE_MS);
}

export function stopPlaybackTokenKeepalive(): void {
  if (keepaliveTimer == null) return;
  clearInterval(keepaliveTimer);
  keepaliveTimer = null;
}
