"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  clearActiveLiveSession,
  getActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import { shouldEnableLiveSessionHostSync } from "@/lib/live/activeSessionMeta";
import { createClient } from "@/lib/supabase/client";

/** Host live sync — pushes Spotify state into live_sessions for participants. */
const SYNC_INTERVAL_BASE_MS = 8_000;
const SYNC_INTERVAL_MAX_MS = 20_000;
const IMMEDIATE_SYNC_COOLDOWN_MS = 1_500;

export type LiveSessionHostSyncOptions = {
  enabled: boolean;
  /** Fired when PATCH /sync reports a new spotify_track_id (host → Player UI). */
  onTrackChanged?: () => void;
};

export type LiveSessionHostSyncResult = {
  /** Immediate PATCH /sync (e.g. when local playback detects a track change). */
  triggerImmediateSync: () => void;
};

/** Host only: push Spotify playback into live_sessions for participants. */
export function useLiveSessionHostSync(
  options: LiveSessionHostSyncOptions,
): LiveSessionHostSyncResult {
  const { enabled, onTrackChanged } = options;
  const lastTrackIdRef = useRef<string | null>(null);
  const lastSyncedTrackIdRef = useRef<string | null>(null);
  const unchangedStreakRef = useRef(0);
  const intervalMsRef = useRef(SYNC_INTERVAL_BASE_MS);
  const onTrackChangedRef = useRef(onTrackChanged);
  onTrackChangedRef.current = onTrackChanged;
  const triggerImmediateSyncRef = useRef<() => void>(() => {});
  const lastImmediateSyncAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function scheduleNext(delayMs = intervalMsRef.current) {
      if (cancelled) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void syncPlayback(false).then((trackJustChanged) => {
          scheduleNext(
            trackJustChanged ? SYNC_INTERVAL_BASE_MS : intervalMsRef.current,
          );
        });
      }, delayMs);
    }

    async function syncPlayback(force = false): Promise<boolean> {
      const ref = getActiveLiveSession();
      if (!ref || cancelled) return false;

      if (ref.isActive === false) {
        clearActiveLiveSession();
        return false;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return false;
      if (!shouldEnableLiveSessionHostSync(ref, user.id)) {
        return false;
      }

      try {
        const res = await fetch(`/api/live/${ref.sessionId}/sync`, {
          method: "PATCH",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return false;
        const body = (await res.json()) as {
          session?: { spotify_track_id?: string | null };
          unchanged?: boolean;
          syncSkipped?: boolean;
          reason?: string;
        };

        const trackId = body.session?.spotify_track_id ?? null;

        if (trackId && trackId !== lastSyncedTrackIdRef.current) {
          lastSyncedTrackIdRef.current = trackId;
          unchangedStreakRef.current = 0;
          intervalMsRef.current = SYNC_INTERVAL_BASE_MS;

          const prev = lastTrackIdRef.current;
          if (trackId !== prev) {
            lastTrackIdRef.current = trackId;
            if (trackId && trackId !== prev) {
              onTrackChangedRef.current?.();
            }
          } else if (force) {
            lastTrackIdRef.current = trackId;
          }

          return true;
        }

        if (body.unchanged || body.syncSkipped) {
          unchangedStreakRef.current += 1;
          intervalMsRef.current = Math.min(
            SYNC_INTERVAL_BASE_MS + unchangedStreakRef.current * 2_000,
            SYNC_INTERVAL_MAX_MS,
          );
        } else {
          unchangedStreakRef.current = 0;
          intervalMsRef.current = SYNC_INTERVAL_BASE_MS;
          if (force) {
            lastTrackIdRef.current = trackId;
          }
        }
      } catch {
        /* ignore transient network errors */
      }
      return false;
    }

    triggerImmediateSyncRef.current = () => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastImmediateSyncAtRef.current < IMMEDIATE_SYNC_COOLDOWN_MS) {
        return;
      }
      lastImmediateSyncAtRef.current = now;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      void syncPlayback(true).then((trackJustChanged) => {
        scheduleNext(
          trackJustChanged ? SYNC_INTERVAL_BASE_MS : SYNC_INTERVAL_BASE_MS,
        );
      });
    };

    void syncPlayback(true).then((trackJustChanged) => {
      scheduleNext(
        trackJustChanged ? SYNC_INTERVAL_BASE_MS : intervalMsRef.current,
      );
    });

    const onSessionStarted = () => {
      unchangedStreakRef.current = 0;
      intervalMsRef.current = SYNC_INTERVAL_BASE_MS;
      lastSyncedTrackIdRef.current = null;
      triggerImmediateSyncRef.current();
    };
    window.addEventListener("wam-live-session-changed", onSessionStarted);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      triggerImmediateSyncRef.current = () => {};
      window.removeEventListener("wam-live-session-changed", onSessionStarted);
    };
  }, [enabled]);

  const triggerImmediateSync = useCallback(() => {
    triggerImmediateSyncRef.current();
  }, []);

  return { triggerImmediateSync };
}
