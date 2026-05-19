import { SpotifyHttpError } from "@/lib/spotify/api";
import { SpotifyApiError } from "@/lib/spotify/errors";

/** In-memory Spotify circuit breaker (per server instance). */

export type CircuitState = "closed" | "open" | "half_open";

const WINDOW_MS = 60_000;
const OPEN_MS = 5 * 60_000;
const THRESHOLD = 3;

let state: CircuitState = "closed";
let openedAt = 0;
const recent429Timestamps: number[] = [];
let halfOpenProbeInFlight = false;

function prune429Window(now: number): void {
  while (
    recent429Timestamps.length > 0 &&
    recent429Timestamps[0]! < now - WINDOW_MS
  ) {
    recent429Timestamps.shift();
  }
}

export function getSpotifyCircuitState(): CircuitState {
  const now = Date.now();
  if (state === "open" && now - openedAt >= OPEN_MS) {
    state = "half_open";
    halfOpenProbeInFlight = false;
  }
  return state;
}

export function isSpotifyCircuitOpen(): boolean {
  return getSpotifyCircuitState() === "open";
}

export function isSpotifyCircuitHalfOpen(): boolean {
  return getSpotifyCircuitState() === "half_open";
}

/** True when new Spotify API calls should be skipped (open, or half-open with probe in flight). */
export function shouldBlockSpotifyRequests(): boolean {
  const s = getSpotifyCircuitState();
  if (s === "open") return true;
  if (s === "half_open" && halfOpenProbeInFlight) return true;
  return false;
}

/** Call immediately before allowing a probe request in half-open state. */
export function beginSpotifyHalfOpenProbe(): boolean {
  if (getSpotifyCircuitState() !== "half_open") return true;
  if (halfOpenProbeInFlight) return false;
  halfOpenProbeInFlight = true;
  return true;
}

export function recordSpotify429(): void {
  const now = Date.now();
  prune429Window(now);
  recent429Timestamps.push(now);

  if (getSpotifyCircuitState() === "half_open") {
    state = "open";
    openedAt = now;
    halfOpenProbeInFlight = false;
    console.error("Spotify circuit breaker OPEN");
    return;
  }

  if (recent429Timestamps.length >= THRESHOLD) {
    state = "open";
    openedAt = now;
    halfOpenProbeInFlight = false;
    console.error("Spotify circuit breaker OPEN");
  }
}

export function recordSpotifySuccess(): void {
  if (getSpotifyCircuitState() === "half_open") {
    state = "closed";
    recent429Timestamps.length = 0;
    halfOpenProbeInFlight = false;
  }
}

export const SPOTIFY_CIRCUIT_UNAVAILABLE_MSG =
  "Spotify temporarily unavailable — try again in a few minutes";

export const SPOTIFY_CIRCUIT_OPEN_ERROR = "Circuit open — Spotify unavailable";

/** Throws when the circuit breaker blocks outbound Spotify API calls. */
export function assertSpotifyCircuitAvailable(): void {
  if (isSpotifyCircuitOpen()) {
    throw new Error(SPOTIFY_CIRCUIT_UNAVAILABLE_MSG);
  }
}

export function isSpotify429Error(error: unknown): boolean {
  if (error instanceof SpotifyHttpError) return error.status === 429;
  if (error instanceof SpotifyApiError) {
    if (error.status === 429) return true;
    if (error.status === 503) return /circuit/i.test(error.message);
  }
  if (error instanceof Error && /Spotify API 429|circuit/i.test(error.message)) {
    return true;
  }
  return false;
}

/** Minimum gap between Spotify Web API calls per user (all endpoints). */
const USER_REQUEST_GAP_MS = 1_200;
const lastUserRequestAt = new Map<string, number>();
const inflightByUser = new Map<string, Promise<unknown>>();

/**
 * Serialize + space out Spotify calls per user. Coalesces concurrent callers
 * (e.g. Player poll + live sync) into one in-flight request.
 */
export async function withSpotifyUserThrottle<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inflightByUser.get(userId);
  if (existing) {
    return existing as Promise<T>;
  }

  const run = (async () => {
    const last = lastUserRequestAt.get(userId) ?? 0;
    const wait = USER_REQUEST_GAP_MS - (Date.now() - last);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastUserRequestAt.set(userId, Date.now());
    try {
      return await fn();
    } finally {
      inflightByUser.delete(userId);
    }
  })();

  inflightByUser.set(userId, run);
  return run;
}
