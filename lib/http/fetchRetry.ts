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
  options?: { retries?: number; delaysMs?: number[] },
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const delaysMs = options?.delaysMs ?? [250, 700, 1_400];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (attempt < retries && TRANSIENT_STATUS.has(res.status)) {
        await wait(delaysMs[attempt] ?? delaysMs[delaysMs.length - 1]!);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientNetworkError(error)) {
        throw error;
      }
      await wait(delaysMs[attempt] ?? delaysMs[delaysMs.length - 1]!);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
