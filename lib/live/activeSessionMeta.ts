import type { ActiveLiveSessionRef, LiveSessionRow } from "@/lib/types/live";

import {
  getActiveLiveSession,
  setActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import { shouldSkipHostPlaybackSync } from "@/lib/live/sessionMode";

export function activeLiveSessionRefFromRow(
  session: LiveSessionRow,
  opts?: { simulated?: boolean },
): ActiveLiveSessionRef {
  const simulated =
    opts?.simulated ?? session.device_name === "[simulated]";
  return {
    sessionId: session.id,
    code: session.code,
    hostUserId: session.host_user_id,
    mode: session.mode === "spotify_jam_overlay" ? "spotify_jam_overlay" : "wam_hosted",
    wamControlsPlayback: session.wam_controls_playback ?? false,
    jamsEnabled: session.jams_enabled ?? false,
    jukeboxEnabled: session.jukebox_enabled ?? false,
    isActive: session.is_active ?? false,
    simulated: simulated || undefined,
  };
}

/** Persist session flags used by Player / host sync (avoids extra API on every poll). */
export function syncActiveLiveSessionFromRow(session: LiveSessionRow): void {
  const existing = getActiveLiveSession();
  if (!existing || existing.sessionId !== session.id) return;

  setActiveLiveSession(activeLiveSessionRefFromRow(session));
}

/**
 * Backfill metadata for legacy localStorage refs (missing wamControlsPlayback).
 * Safe to call from Player on mount.
 */
export async function ensureActiveLiveSessionMetadata(): Promise<void> {
  if (typeof window === "undefined") return;

  const stored = getActiveLiveSession();
  if (!stored || stored.wamControlsPlayback !== undefined) return;

  try {
    const res = await fetch(`/api/live/${stored.sessionId}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { session?: LiveSessionRow };
    if (!body.session) return;

    setActiveLiveSession({
      ...activeLiveSessionRefFromRow(body.session),
      code: stored.code,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Skip GET /api/spotify/playback when session state comes from host sync / Realtime
 * instead of per-user Spotify polling.
 */
export function shouldSkipPlaybackApiPoll(
  active: ActiveLiveSessionRef | null,
  currentUserId: string | null,
): boolean {
  if (!active) return false;

  if (currentUserId && active.hostUserId === currentUserId) {
    if (active.wamControlsPlayback) return true;
    if (active.jukeboxEnabled || active.jamsEnabled) return true;
  }

  if (
    currentUserId &&
    active.hostUserId !== currentUserId &&
    active.sessionId
  ) {
    return true;
  }

  return false;
}

/** Host-only PATCH /sync — one Spotify source instead of Player + sync overlap. */
export function shouldEnableLiveSessionHostSync(
  active: ActiveLiveSessionRef | null,
  currentUserId: string | null,
): boolean {
  if (!active || !currentUserId) return false;
  if (active.simulated) return false;
  if (active.hostUserId !== currentUserId) return false;
  return !shouldSkipHostPlaybackSync({
    mode: active.mode,
    jams_enabled: Boolean(active.jamsEnabled),
    jukebox_enabled: Boolean(active.jukeboxEnabled),
    wam_controls_playback: Boolean(active.wamControlsPlayback),
  });
}
