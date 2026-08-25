"use client";

import { useEffect, useRef, useState } from "react";

import type { LiveSessionRow } from "@/lib/types/live";

export type JamOverlaySyncStatus = "synced" | "out_of_sync" | "unknown";

type PlaybackPayload = {
  trackId?: string | null;
  trackName?: string | null;
  artistName?: string | null;
  imageUrl?: string | null;
  isPlaying?: boolean;
  progressMs?: number;
  durationMs?: number;
};

async function pushSessionTrack(
  sessionId: string,
  playback: {
    trackId: string;
    trackName: string | null;
    artistName: string | null;
    imageUrl: string | null;
    isPlaying: boolean;
    progressMs: number;
    durationMs: number;
  },
): Promise<LiveSessionRow | null> {
  const res = await fetch(`/api/live/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spotify_track_id: playback.trackId,
      track_name: playback.trackName,
      artist_name: playback.artistName,
      image_url: playback.imageUrl,
      is_playing: playback.isPlaying,
      progress_ms: playback.progressMs,
      duration_ms: playback.durationMs,
    }),
  }).catch(() => null);

  if (!res?.ok) return null;
  const body = (await res.json().catch(() => ({}))) as {
    session?: LiveSessionRow;
  };
  return body.session ?? null;
}

/**
 * Per-participant Spotify playback check for Jam Overlay sessions.
 * Soft-hosts the room track from whoever is listening (track changes included).
 */
export function useJamOverlaySync(
  sessionId: string | null,
  sessionTrackId: string | null,
  enabled: boolean,
  onSessionUpdate?: (session: LiveSessionRow) => void,
): { syncStatus: JamOverlaySyncStatus; myTrackId: string | null } {
  const [syncStatus, setSyncStatus] = useState<JamOverlaySyncStatus>("unknown");
  const [myTrackId, setMyTrackId] = useState<string | null>(null);
  const onSessionUpdateRef = useRef(onSessionUpdate);
  onSessionUpdateRef.current = onSessionUpdate;
  const lastPushedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) {
      setSyncStatus("unknown");
      setMyTrackId(null);
      lastPushedTrackRef.current = null;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function checkSync() {
      if (cancelled || !sessionId) return;

      try {
        const res = await fetch("/api/spotify/playback?fresh=1", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as PlaybackPayload;
        const trackId =
          typeof data.trackId === "string" && data.trackId ? data.trackId : null;

        if (cancelled) return;
        setMyTrackId(trackId);

        if (trackId) {
          // Soft-host: anyone listening pushes their current Jam track into the room.
          // This covers first seed AND track changes (previous logic blocked the latter).
          const shouldPush =
            trackId !== sessionTrackId || lastPushedTrackRef.current !== trackId;

          if (shouldPush) {
            const updated = await pushSessionTrack(sessionId, {
              trackId,
              trackName:
                typeof data.trackName === "string" ? data.trackName : null,
              artistName:
                typeof data.artistName === "string" ? data.artistName : null,
              imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
              isPlaying: data.isPlaying !== false,
              progressMs:
                typeof data.progressMs === "number" ? data.progressMs : 0,
              durationMs:
                typeof data.durationMs === "number" ? data.durationMs : 0,
            });
            if (cancelled) return;
            lastPushedTrackRef.current = trackId;
            if (updated) {
              onSessionUpdateRef.current?.(updated);
            }
          }

          if (cancelled) return;
          // Match room track, or we just pushed ours — treat as in sync with the Jam.
          setSyncStatus(
            !sessionTrackId ||
              trackId === sessionTrackId ||
              lastPushedTrackRef.current === trackId
              ? "synced"
              : "out_of_sync",
          );
        } else if (sessionTrackId) {
          setSyncStatus("out_of_sync");
        } else {
          setSyncStatus("unknown");
        }
      } catch {
        if (!cancelled) setSyncStatus("unknown");
      }

      if (!cancelled) {
        timer = setTimeout(() => {
          void checkSync();
        }, 5_000);
      }
    }

    void checkSync();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, sessionTrackId, enabled]);

  return { syncStatus, myTrackId };
}
