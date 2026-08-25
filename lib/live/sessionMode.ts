import { isLiveAdvancedModesEnabled } from "@/lib/live/liveAdvancedModes";
import type { LiveSessionHostingMode, LiveSessionRow } from "@/lib/types/live";

/** Effective mode after env gates (jams wins if both flags are set in DB). */
export type LiveSessionMode =
  | "legacy"
  | "queue"
  | "jukebox"
  | "jams"
  | "spotify_jam_overlay";

type SessionModeFlags = Pick<
  LiveSessionRow,
  "mode" | "jams_enabled" | "jukebox_enabled" | "wam_controls_playback"
>;

function hostingMode(
  session: Pick<LiveSessionRow, "mode">,
): LiveSessionHostingMode {
  return session.mode === "spotify_jam_overlay"
    ? "spotify_jam_overlay"
    : "wam_hosted";
}

/** Raw DB flags — ignores env gates. */
export function getLiveSessionMode(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled" | "jukebox_enabled">,
): LiveSessionMode {
  if (hostingMode(session) === "spotify_jam_overlay") {
    return "spotify_jam_overlay";
  }
  if (session.jams_enabled && session.jukebox_enabled) {
    console.warn(
      "[live] Session has both jams_enabled and jukebox_enabled; using jams mode",
    );
  }
  if (session.jams_enabled) return "jams";
  if (session.jukebox_enabled) return "jukebox";
  return "legacy";
}

/** Respects Step 0/1 gates — legacy when flags are off. */
export function getEffectiveLiveSessionMode(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled" | "jukebox_enabled">,
): LiveSessionMode {
  if (hostingMode(session) === "spotify_jam_overlay") {
    return "spotify_jam_overlay";
  }
  if (session.jams_enabled && isLiveAdvancedModesEnabled()) return "jams";
  if (session.jukebox_enabled && isLiveAdvancedModesEnabled()) return "jukebox";
  if (session.jukebox_enabled && !isLiveAdvancedModesEnabled()) return "queue";
  return "legacy";
}

/** Scoreboard + live_scores (full jukebox or Jams). */
export function sessionHasScores(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled" | "jukebox_enabled">,
): boolean {
  const mode = getEffectiveLiveSessionMode(session);
  return mode === "jukebox" || mode === "jams";
}

/** Shared live_queue (FIFO queue, jukebox, or Jams). */
export function sessionHasQueue(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled" | "jukebox_enabled">,
): boolean {
  const mode = getEffectiveLiveSessionMode(session);
  return mode === "queue" || mode === "jukebox" || mode === "jams";
}

/** Jukebox priority reordering — not round-robin or Jams. */
export function usesJukeboxQueueOrdering(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled" | "jukebox_enabled">,
): boolean {
  return getEffectiveLiveSessionMode(session) === "jukebox";
}

/** Default song queue: rotate one track per participant (user1 → user2 → user3 → …). */
export function usesRoundRobinQueueOrdering(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled" | "jukebox_enabled">,
): boolean {
  return getEffectiveLiveSessionMode(session) === "queue";
}

export function usesJamsAdvance(
  session: Pick<LiveSessionRow, "mode" | "jams_enabled">,
): boolean {
  if (hostingMode(session) === "spotify_jam_overlay") return false;
  if (!isLiveAdvancedModesEnabled()) return false;
  return Boolean(session.jams_enabled);
}

/**
 * Host Spotify → session mirror via PATCH /sync.
 * Off for Jam overlay, full jukebox, and Jams when WAM drives playback.
 * FIFO song queue keeps host sync (like legacy).
 */
export function shouldSkipHostPlaybackSync(session: SessionModeFlags): boolean {
  const mode = getEffectiveLiveSessionMode(session);
  if (mode === "spotify_jam_overlay") return true;
  if (mode === "jukebox") return true;
  if (mode === "jams" && session.wam_controls_playback) return true;
  return false;
}
