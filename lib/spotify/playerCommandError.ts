/** Structured Spotify Web API player-command errors — never leak raw JSON to the UI. */

export type SpotifyPlayerCommand =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "seek"
  | "transfer";

export type SpotifyPlayerReason =
  | "NO_ACTIVE_DEVICE"
  | "PREMIUM_REQUIRED"
  | "RESTRICTION_VIOLATED"
  | "UNKNOWN";

export class SpotifyPlayerError extends Error {
  readonly status: number;
  readonly reason: SpotifyPlayerReason;
  readonly command: SpotifyPlayerCommand;

  constructor(
    command: SpotifyPlayerCommand,
    status: number,
    reason: SpotifyPlayerReason,
    message: string,
  ) {
    super(message);
    this.name = "SpotifyPlayerError";
    this.command = command;
    this.status = status;
    this.reason = reason;
  }

  get isNoActiveDevice(): boolean {
    return this.reason === "NO_ACTIVE_DEVICE" || this.status === 404;
  }
}

export class PlaybackCancelledError extends Error {
  constructor() {
    super("Playback cancelled");
    this.name = "PlaybackCancelledError";
  }
}

export function isPlaybackCancelled(error: unknown): boolean {
  return error instanceof PlaybackCancelledError;
}

export function isNoActiveDeviceError(error: unknown): boolean {
  return error instanceof SpotifyPlayerError && error.isNoActiveDevice;
}

type SpotifyErrorJson = {
  error?: {
    status?: number;
    message?: string;
    reason?: string;
  };
};

export function parseSpotifyPlayerErrorPayload(body: string): {
  message: string;
  reason: string | null;
  status: number | null;
} {
  const trimmed = body.trim();
  if (!trimmed) return { message: "", reason: null, status: null };
  try {
    const json = JSON.parse(trimmed) as SpotifyErrorJson;
    const err = json.error;
    if (err && typeof err === "object") {
      return {
        message: typeof err.message === "string" ? err.message : "",
        reason: typeof err.reason === "string" ? err.reason : null,
        status: typeof err.status === "number" ? err.status : null,
      };
    }
  } catch {
    /* not JSON */
  }
  return { message: trimmed.slice(0, 180), reason: null, status: null };
}

function classifyReason(
  status: number,
  reason: string | null,
  message: string,
): SpotifyPlayerReason {
  const r = (reason ?? "").toUpperCase();
  const m = message.toLowerCase();
  if (
    r === "NO_ACTIVE_DEVICE" ||
    m.includes("no active device") ||
    (status === 404 && m.includes("player command failed"))
  ) {
    return "NO_ACTIVE_DEVICE";
  }
  if (r === "PREMIUM_REQUIRED" || m.includes("premium")) return "PREMIUM_REQUIRED";
  if (r === "RESTRICTION_VIOLATED" || m.includes("restriction")) {
    return "RESTRICTION_VIOLATED";
  }
  if (status === 404) return "NO_ACTIVE_DEVICE";
  return "UNKNOWN";
}

export function friendlyPlayerCommandMessage(
  command: SpotifyPlayerCommand,
  status: number,
  reason: SpotifyPlayerReason,
): string {
  if (status === 401) {
    return "Spotify session expired. Sign in again to control playback.";
  }
  if (status === 429) {
    return "Spotify is busy. Wait a moment and try again.";
  }
  if (reason === "PREMIUM_REQUIRED") {
    return "Spotify Premium is required to control playback from Musicator.";
  }
  if (reason === "RESTRICTION_VIOLATED") {
    return "Spotify blocked this action on the current speaker.";
  }
  if (reason === "NO_ACTIVE_DEVICE") {
    if (command === "next" || command === "previous") {
      return "Spotify isn’t playing on any speaker. Open the Spotify app, or play a track in this tab, then skip.";
    }
    if (command === "pause") {
      return "Nothing is playing on Spotify right now.";
    }
    if (command === "play") {
      return "No active Spotify speaker. Open the Spotify app on your phone or computer, or play in this browser.";
    }
    return "No active Spotify speaker. Open Spotify on your phone or computer, then try again.";
  }
  return "Could not control Spotify playback. Try again.";
}

export function spotifyPlayerErrorFromResponse(
  command: SpotifyPlayerCommand,
  status: number,
  body: string,
): SpotifyPlayerError {
  const parsed = parseSpotifyPlayerErrorPayload(body);
  const reason = classifyReason(
    parsed.status ?? status,
    parsed.reason,
    parsed.message,
  );
  return new SpotifyPlayerError(
    command,
    parsed.status ?? status,
    reason,
    friendlyPlayerCommandMessage(command, parsed.status ?? status, reason),
  );
}

/** True when a thrown Error still contains raw Spotify JSON (legacy paths). */
export function looksLikeRawSpotifyDump(message: string): boolean {
  const t = message.trim();
  return (
    t.startsWith("{") ||
    t.includes('"error"') ||
    t.includes("NO_ACTIVE_DEVICE") ||
    t.includes("Player command failed")
  );
}
