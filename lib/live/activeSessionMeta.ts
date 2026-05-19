import type { ActiveLiveSessionRef, LiveSessionRow } from "@/lib/types/live";

import {
  getActiveLiveSession,
  setActiveLiveSession,
} from "@/lib/live/activeSessionStorage";

export function activeLiveSessionRefFromRow(session: LiveSessionRow): ActiveLiveSessionRef {
  return {
    sessionId: session.id,
    code: session.code,
    hostUserId: session.host_user_id,
    wamControlsPlayback: Boolean(session.wam_controls_playback),
    jamsEnabled: Boolean(session.jams_enabled),
    jukeboxEnabled: Boolean(session.jukebox_enabled),
    isActive: Boolean(session.is_active),
  };
}

/** Persist session flags used by Player / host sync (avoids extra API on every poll). */
export function syncActiveLiveSessionFromRow(session: LiveSessionRow): void {
  const existing = getActiveLiveSession();
  if (!existing || existing.sessionId !== session.id) return;

  setActiveLiveSession(activeLiveSessionRefFromRow(session));
}

export function shouldHostSkipPlaybackApiPoll(
  active: ActiveLiveSessionRef | null,
  currentUserId: string | null,
): boolean {
  if (!active?.wamControlsPlayback || !currentUserId) return false;
  return active.hostUserId === currentUserId;
}
