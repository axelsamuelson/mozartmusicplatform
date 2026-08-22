import { looksLikeRawSpotifyDump } from "@/lib/spotify/playerCommandError";

const TRANSIENT_STATUS = new Set([408, 425, 429, 502, 503, 504]);

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("fetch failed")
  );
}

export function userFacingFetchError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === "PlaybackCancelledError") {
    return fallback;
  }
  if (isTransientNetworkError(error)) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    if (msg.toLowerCase() === "failed to fetch") return fallback;
    if (looksLikeRawSpotifyDump(msg)) {
      return "No active Spotify speaker. Open the Spotify app, or play a track in this tab.";
    }
    return msg;
  }
  return fallback;
}

/**
 * fetch with retries for cold APIs / waking backends (Supabase restore, Turbopack).
 * Does not retry 4xx except 408/425/429.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    retries?: number;
    delaysMs?: number[];
    /** Abort the request (and retries) after this many ms. */
    timeoutMs?: number;
  },
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const delaysMs = options?.delaysMs ?? [250, 700, 1_400];
  const timeoutMs = options?.timeoutMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeoutCtrl =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? new AbortController()
        : null;
    const timer = timeoutCtrl
      ? setTimeout(() => timeoutCtrl.abort(), timeoutMs)
      : null;
    try {
      const signal =
        timeoutCtrl && init?.signal && typeof AbortSignal.any === "function"
          ? AbortSignal.any([timeoutCtrl.signal, init.signal])
          : (timeoutCtrl?.signal ?? init?.signal);
      const res = await fetch(input, { ...init, signal });
      if (attempt < retries && TRANSIENT_STATUS.has(res.status)) {
        await wait(delaysMs[attempt] ?? delaysMs[delaysMs.length - 1]!);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError") &&
        timeoutCtrl?.signal.aborted
      ) {
        throw new Error("Request timed out. Try again.");
      }
      if (attempt >= retries || !isTransientNetworkError(error)) {
        throw error;
      }
      await wait(delaysMs[attempt] ?? delaysMs[delaysMs.length - 1]!);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
