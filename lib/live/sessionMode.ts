import type { LiveSessionRow } from "@/lib/types/live";

/** Mutually exclusive live modes (jams wins if both flags are set). */
export type LiveSessionMode = "legacy" | "jukebox" | "jams";

type SessionModeInput = Pick<
  LiveSessionRow,
  "jams_enabled" | "jukebox_enabled" | "wam_controls_playback"
>;

export function getLiveSessionMode(
  session: Pick<LiveSessionRow, "jams_enabled" | "jukebox_enabled">,
): LiveSessionMode {
  if (session.jams_enabled && session.jukebox_enabled) {
    console.warn(
      "[live] Session has both jams_enabled and jukebox_enabled; using jams mode",
    );
  }
  if (session.jams_enabled) return "jams";
  if (session.jukebox_enabled) return "jukebox";
  return "legacy";
}

/** Scoreboard + live_scores (jukebox priority queue or Jams rotation). */
export function sessionHasScores(
  session: Pick<LiveSessionRow, "jams_enabled" | "jukebox_enabled">,
): boolean {
  return getLiveSessionMode(session) !== "legacy";
}

/** Shared queue table (jukebox ordering or Jams manual jumps). */
export function sessionHasQueue(
  session: Pick<LiveSessionRow, "jams_enabled" | "jukebox_enabled">,
): boolean {
  return sessionHasScores(session);
}

/** Jukebox priority reordering — not used in Jams (buffer + round-robin). */
export function usesJukeboxQueueOrdering(
  session: Pick<LiveSessionRow, "jams_enabled" | "jukebox_enabled">,
): boolean {
  return getLiveSessionMode(session) === "jukebox";
}

export function usesJamsAdvance(
  session: Pick<LiveSessionRow, "jams_enabled">,
): boolean {
  return Boolean(session.jams_enabled);
}

/**
 * Host Spotify → session mirror via PATCH /sync.
 * Off for jukebox (host uses Next) and Jams when WAM drives playback.
 */
export function shouldSkipHostPlaybackSync(session: SessionModeInput): boolean {
  const mode = getLiveSessionMode(session);
  if (mode === "jukebox") return true;
  if (mode === "jams" && session.wam_controls_playback) return true;
  return false;
}
