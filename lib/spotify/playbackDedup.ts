import type { SpotifyPlaybackApiResponse } from "@/lib/spotify/currentlyPlaying";

/** Coalesce rapid GET /api/spotify/playback (Player poll + multiple tabs). */
const DEDUP_MS = 2_000;

type Entry = {
  at: number;
  body: SpotifyPlaybackApiResponse;
};

const byUser = new Map<string, Entry>();

/** Advance cached progress so dedup/fallback hits don't look frozen then jump. */
export function advancePlaybackProgress(
  body: SpotifyPlaybackApiResponse,
  sampledAt: number,
  now = Date.now(),
): SpotifyPlaybackApiResponse {
  if (!body.isPlaying) return body;
  if (!("progressMs" in body) || typeof body.progressMs !== "number") {
    return body;
  }
  const elapsed = Math.max(0, now - sampledAt);
  if (elapsed === 0) return body;
  let progressMs = body.progressMs + elapsed;
  if (
    "durationMs" in body &&
    typeof body.durationMs === "number" &&
    body.durationMs > 0
  ) {
    progressMs = Math.min(progressMs, body.durationMs);
  }
  return { ...body, progressMs };
}

export function getDedupedPlayback(
  userId: string,
): SpotifyPlaybackApiResponse | null {
  const hit = byUser.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.at > DEDUP_MS) return null;
  return advancePlaybackProgress(hit.body, hit.at);
}

export function setDedupedPlayback(
  userId: string,
  body: SpotifyPlaybackApiResponse,
): void {
  byUser.set(userId, { at: Date.now(), body });
}
