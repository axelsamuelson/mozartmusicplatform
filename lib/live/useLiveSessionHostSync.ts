"use client";

import { useEffect, useRef } from "react";

import { getActiveLiveSession } from "@/lib/live/activeSessionStorage";

const SYNC_INTERVAL_MS = 4_000;

/** Host only: push Spotify playback into live_sessions for participants. */
export function useLiveSessionHostSync(enabled: boolean): void {
  const lastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function syncPlayback(force = false) {
      const ref = getActiveLiveSession();
      if (!ref || cancelled) return;

      try {
        const res = await fetch(`/api/live/${ref.sessionId}/sync`, {
          method: "PATCH",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          session?: { spotify_track_id?: string | null };
        };
        const trackId = body.session?.spotify_track_id ?? null;
        if (force || trackId !== lastTrackIdRef.current) {
          lastTrackIdRef.current = trackId;
        }
      } catch {
        /* ignore transient network errors */
      }
    }

    void syncPlayback(true);
    const interval = window.setInterval(() => void syncPlayback(false), SYNC_INTERVAL_MS);
    const onSessionStarted = () => void syncPlayback(true);
    window.addEventListener("wam-live-session-changed", onSessionStarted);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("wam-live-session-changed", onSessionStarted);
    };
  }, [enabled]);
}
