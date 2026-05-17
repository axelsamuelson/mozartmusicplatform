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

export function isSpotify429Error(error: unknown): boolean {
  if (error instanceof SpotifyHttpError) return error.status === 429;
  if (error instanceof SpotifyApiError) return error.status === 429;
  if (error instanceof Error && /Spotify API 429/.test(error.message)) {
    return true;
  }
  return false;
}
