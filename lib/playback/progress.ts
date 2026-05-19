import type { PlaybackState } from "@/lib/playback/types";

export function getCurrentProgressMs(state: PlaybackState): number {
  if (!state.isPlaying) return state.progressMsAtSync;
  const elapsed = Date.now() - state.syncedAt;
  const next = state.progressMsAtSync + elapsed;
  if (state.durationMs > 0) return Math.min(next, state.durationMs);
  return next;
}
