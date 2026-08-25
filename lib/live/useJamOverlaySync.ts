"use client";

import { useEffect, useState } from "react";

export type JamOverlaySyncStatus = "synced" | "out_of_sync" | "unknown";

type PlaybackPayload = {
  trackId?: string | null;
  trackName?: string | null;
  artistName?: string | null;
  imageUrl?: string | null;
};

async function maybeUpdateSessionTrack(
  sessionId: string,
  playback: {
    trackId: string;
    trackName: string | null;
    artistName: string | null;
    imageUrl: string | null;
  },
): Promise<void> {
  await fetch(`/api/live/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spotify_track_id: playback.trackId,
      track_name: playback.trackName,
      artist_name: playback.artistName,
      image_url: playback.imageUrl,
    }),
  }).catch(() => undefined);
}

/**
 * Per-participant Spotify playback check for Jam Overlay sessions.
 * Soft-hosts the room track when local playback matches / session has no track yet.
 */
export function useJamOverlaySync(
  sessionId: string | null,
  sessionTrackId: string | null,
  enabled: boolean,
): { syncStatus: JamOverlaySyncStatus; myTrackId: string | null } {
  const [syncStatus, setSyncStatus] = useState<JamOverlaySyncStatus>("unknown");
  const [myTrackId, setMyTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) {
      setSyncStatus("unknown");
      setMyTrackId(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function checkSync() {
      if (cancelled || !sessionId) return;

      try {
        const res = await fetch("/api/spotify/playback", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as PlaybackPayload;
        const trackId =
          typeof data.trackId === "string" && data.trackId ? data.trackId : null;

        if (cancelled) return;
        setMyTrackId(trackId);

        // Soft-host: seed or refresh session track when local player has audio
        // and the room is empty or already on the same track.
        if (
          trackId &&
          (!sessionTrackId || trackId === sessionTrackId)
        ) {
          if (trackId !== sessionTrackId) {
            await maybeUpdateSessionTrack(sessionId, {
              trackId,
              trackName:
                typeof data.trackName === "string" ? data.trackName : null,
              artistName:
                typeof data.artistName === "string" ? data.artistName : null,
              imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
            });
          }
        }

        if (cancelled) return;

        if (!sessionTrackId || !trackId) {
          setSyncStatus("unknown");
        } else if (trackId === sessionTrackId) {
          setSyncStatus("synced");
        } else {
          setSyncStatus("out_of_sync");
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
