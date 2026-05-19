"use client";

import { useEffect, useRef } from "react";

import {
  clearActiveLiveSession,
  getActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import { shouldEnableLiveSessionHostSync } from "@/lib/live/activeSessionMeta";
import { createClient } from "@/lib/supabase/client";

/** Host live sync — conservative interval to protect Spotify rate limits. */
const SYNC_INTERVAL_BASE_MS = 35_000;
const SYNC_INTERVAL_MAX_MS = 90_000;

export type LiveSessionHostSyncOptions = {
  enabled: boolean;
  /** Fired when PATCH /sync reports a new spotify_track_id (host → Player UI). */
  onTrackChanged?: () => void;
};

/** Host only: push Spotify playback into live_sessions for participants. */
export function useLiveSessionHostSync(options: LiveSessionHostSyncOptions): void {
  const { enabled, onTrackChanged } = options;
  const lastTrackIdRef = useRef<string | null>(null);
  const unchangedStreakRef = useRef(0);
  const intervalMsRef = useRef(SYNC_INTERVAL_BASE_MS);
  const onTrackChangedRef = useRef(onTrackChanged);
  onTrackChangedRef.current = onTrackChanged;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function scheduleNext() {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        void syncPlayback(false).finally(scheduleNext);
      }, intervalMsRef.current);
    }

    async function syncPlayback(force = false) {
      const ref = getActiveLiveSession();
      if (!ref || cancelled) return;

      if (ref.isActive === false) {
        clearActiveLiveSession();
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      if (!shouldEnableLiveSessionHostSync(ref, user.id)) {
        return;
      }

      try {
        const res = await fetch(`/api/live/${ref.sessionId}/sync`, {
          method: "PATCH",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          session?: { spotify_track_id?: string | null };
          unchanged?: boolean;
          syncSkipped?: boolean;
          reason?: string;
        };

        if (body.unchanged || body.syncSkipped) {
          unchangedStreakRef.current += 1;
          intervalMsRef.current = Math.min(
            SYNC_INTERVAL_BASE_MS + unchangedStreakRef.current * 10_000,
            SYNC_INTERVAL_MAX_MS,
          );
        } else {
          unchangedStreakRef.current = 0;
          intervalMsRef.current = SYNC_INTERVAL_BASE_MS;
        }

        const trackId = body.session?.spotify_track_id ?? null;
        const prev = lastTrackIdRef.current;
        if (trackId !== prev) {
          lastTrackIdRef.current = trackId;
          if (trackId && trackId !== prev) {
            onTrackChangedRef.current?.();
          }
        } else if (force) {
          lastTrackIdRef.current = trackId;
        }
      } catch {
        /* ignore transient network errors */
      }
    }

    void syncPlayback(true).finally(scheduleNext);

    const onSessionStarted = () => {
      unchangedStreakRef.current = 0;
      intervalMsRef.current = SYNC_INTERVAL_BASE_MS;
      void syncPlayback(true);
    };
    window.addEventListener("wam-live-session-changed", onSessionStarted);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("wam-live-session-changed", onSessionStarted);
    };
  }, [enabled]);
}
