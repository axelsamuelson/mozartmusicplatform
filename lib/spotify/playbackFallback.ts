import type { SpotifyPlaybackApiResponse } from "@/lib/spotify/currentlyPlaying";
import { advancePlaybackProgress } from "@/lib/spotify/playbackDedup";

/** Last successful playback payload per user (survives 429 / circuit-open). */
const lastKnownByUser = new Map<
  string,
  { at: number; body: SpotifyPlaybackApiResponse }
>();

export function getLastKnownPlayback(
  userId: string,
): SpotifyPlaybackApiResponse | null {
  const hit = lastKnownByUser.get(userId);
  if (!hit) return null;
  return advancePlaybackProgress(hit.body, hit.at);
}

export function setLastKnownPlayback(
  userId: string,
  body: SpotifyPlaybackApiResponse,
): void {
  lastKnownByUser.set(userId, { at: Date.now(), body });
}
