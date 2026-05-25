import { getPlaybackTabId } from "@/lib/playback/pollLeader";
import type { PlaybackState } from "@/lib/playback/types";

const CHANNEL_NAME = "wam-playback-sync";

let channel: BroadcastChannel | null = null;

export function getPlaybackChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!channel && "BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function broadcastPlayback(state: PlaybackState): void {
  const ch = getPlaybackChannel();
  if (!ch) return;
  ch.postMessage({
    type: "playback",
    state,
    at: Date.now(),
    tabId: getPlaybackTabId(),
  });
}

export function subscribeToPlayback(
  cb: (state: PlaybackState) => void,
): () => void {
  const ch = getPlaybackChannel();
  if (!ch) return () => {};

  const handler = (e: MessageEvent) => {
    if (e.data?.type !== "playback" || !e.data.state) return;
    if (e.data.tabId === getPlaybackTabId()) return;
    cb(e.data.state as PlaybackState);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
