/**
 * Step 0: Jams / Jukebox / WAM playback are gated behind this flag.
 * Default off in production — set NEXT_PUBLIC_LIVE_ADVANCED_MODES=true in .env.local to develop them.
 */
export function isLiveAdvancedModesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_ADVANCED_MODES === "true";
}
