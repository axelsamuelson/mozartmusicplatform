import type { SpotifyPlaybackApiResponse } from "@/lib/spotify/currentlyPlaying";

const DEDUP_MS = 3_000;

type Entry = {
  at: number;
  body: SpotifyPlaybackApiResponse;
};

const byUser = new Map<string, Entry>();

export function getDedupedPlayback(
  userId: string,
): SpotifyPlaybackApiResponse | null {
  const hit = byUser.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.at > DEDUP_MS) return null;
  return hit.body;
}

export function setDedupedPlayback(
  userId: string,
  body: SpotifyPlaybackApiResponse,
): void {
  byUser.set(userId, { at: Date.now(), body });
}
