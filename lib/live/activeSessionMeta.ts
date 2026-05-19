import type { ActiveLiveSessionRef, LiveSessionRow } from "@/lib/types/live";

import {
  getActiveLiveSession,
  setActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import { shouldSkipHostPlaybackSync } from "@/lib/live/sessionMode";

export function activeLiveSessionRefFromRow(session: LiveSessionRow): ActiveLiveSessionRef {
  return {
    sessionId: session.id,
    code: session.code,
    hostUserId: session.host_user_id,
    wamControlsPlayback: session.wam_controls_playback ?? false,
    jamsEnabled: session.jams_enabled ?? false,
    jukeboxEnabled: session.jukebox_enabled ?? false,
    isActive: session.is_active ?? false,
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
 * Skip GET /api/spotify/playback when the host already mirrors via PATCH /sync
 * (song queue, jams, or WAM-controlled playback).
 */
export function shouldHostSkipPlaybackApiPoll(
  active: ActiveLiveSessionRef | null,
  currentUserId: string | null,
): boolean {
  if (!active || !currentUserId) return false;
  if (active.hostUserId !== currentUserId) return false;
  if (active.wamControlsPlayback) return true;
  if (active.jukeboxEnabled || active.jamsEnabled) return true;
  return false;
}

/** Host-only PATCH /sync — one Spotify source instead of Player + sync overlap. */
export function shouldEnableLiveSessionHostSync(
  active: ActiveLiveSessionRef | null,
  currentUserId: string | null,
): boolean {
  if (!active || !currentUserId) return false;
  if (active.hostUserId !== currentUserId) return false;
  return !shouldSkipHostPlaybackSync({
    jams_enabled: Boolean(active.jamsEnabled),
    jukebox_enabled: Boolean(active.jukeboxEnabled),
    wam_controls_playback: Boolean(active.wamControlsPlayback),
  });
}
