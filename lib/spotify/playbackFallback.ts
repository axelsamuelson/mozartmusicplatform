import type { SpotifyPlaybackApiResponse } from "@/lib/spotify/currentlyPlaying";

/** Last successful playback payload per user (survives 429 / circuit-open). */
const lastKnownByUser = new Map<string, SpotifyPlaybackApiResponse>();

export function getLastKnownPlayback(
  userId: string,
): SpotifyPlaybackApiResponse | null {
  return lastKnownByUser.get(userId) ?? null;
}

export function setLastKnownPlayback(
  userId: string,
  body: SpotifyPlaybackApiResponse,
): void {
  lastKnownByUser.set(userId, body);
}
