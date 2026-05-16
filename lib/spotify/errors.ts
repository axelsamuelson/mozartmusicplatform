/** Max seconds we honor from Spotify Retry-After (never block UI for hours). */
export const MAX_RETRY_AFTER_SEC = 120;

/** Spotify Web API error with optional Retry-After (seconds). */
export class SpotifyApiError extends Error {
  readonly status: number;
  readonly retryAfterSec: number;

  constructor(status: number, body: string, retryAfterSec?: number) {
    super(`Spotify API ${status}: ${body.slice(0, 400)}`);
    this.name = "SpotifyApiError";
    this.status = status;
    this.retryAfterSec =
      status === 429
        ? capRetryAfterSec(retryAfterSec ?? 30, 30)
        : 0;
  }
}

export function capRetryAfterSec(
  sec: number,
  defaultSec = 30,
): number {
  if (!Number.isFinite(sec) || sec < 0) return defaultSec;
  return Math.min(sec, MAX_RETRY_AFTER_SEC);
}

/**
 * Parse Spotify Retry-After (delay in seconds, or HTTP-date per RFC 7231).
 * Never returns more than MAX_RETRY_AFTER_SEC.
 */
export function parseRetryAfterSec(
  header: string | null,
  defaultSec = 30,
): number {
  if (!header?.trim()) return defaultSec;

  const raw = header.trim();
  console.warn("Retry-After raw:", raw);

  if (/^\d+(\.\d+)?$/.test(raw)) {
    let sec = Math.ceil(Number.parseFloat(raw));
    if (!Number.isFinite(sec) || sec < 0) return defaultSec;

    // Absurd values are often milliseconds sent without unit (e.g. 37627 → ~38s).
    if (sec > MAX_RETRY_AFTER_SEC && sec < 100_000) {
      const fromMs = Math.ceil(sec / 1000);
      if (fromMs > 0 && fromMs <= MAX_RETRY_AFTER_SEC) {
        console.warn(
          "Retry-After treated as milliseconds:",
          raw,
          "→",
          fromMs,
          "s",
        );
        sec = fromMs;
      }
    }

    return capRetryAfterSec(sec, defaultSec);
  }

  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) {
    const sec = Math.ceil((dateMs - Date.now()) / 1000);
    return capRetryAfterSec(sec, defaultSec);
  }

  return defaultSec;
}
