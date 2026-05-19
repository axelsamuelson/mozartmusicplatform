import { isLiveAdvancedModesEnabled } from "@/lib/live/liveAdvancedModes";

/**
 * Step 1: simple FIFO song queue (host Next, guests add tracks).
 * Set NEXT_PUBLIC_LIVE_QUEUE_ENABLED=true in .env.local to try it without Jams/Jukebox.
 */
export function isLiveQueueEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_QUEUE_ENABLED === "true";
}

export function isLiveSessionFeaturesEnabled(): boolean {
  return isLiveQueueEnabled() || isLiveAdvancedModesEnabled();
}
