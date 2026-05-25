"use client";

import { useEffect, useRef } from "react";

import { getActiveLiveSession } from "@/lib/live/activeSessionStorage";
import { interpolatedProgressMs } from "@/lib/live/mapPlaybackToSession";
import { getCurrentProgressMs } from "@/lib/playback/progress";
import type { PlaybackState } from "@/lib/playback/types";
import type { LiveSessionRow } from "@/lib/types/live";

const END_THRESHOLD_MS = 2_000;
const END_GRACE_MS = 5_000;

export type UseLiveQueueAutoAdvanceOptions = {
  enabled: boolean;
  advancing?: boolean;
  onAdvance: () => void | Promise<void>;
  session?: LiveSessionRow | null;
  pendingQueueCount?: number;
  playback?: PlaybackState | null;
};

function shouldRunQueueAdvance(
  pendingQueueCount: number,
  session: Pick<LiveSessionRow, "current_queue_id"> | null | undefined,
): boolean {
  return pendingQueueCount > 0 || Boolean(session?.current_queue_id);
}

function trackKeyFromSession(session: LiveSessionRow): string {
  return `${session.spotify_track_id ?? ""}:${session.current_queue_id ?? ""}`;
}

function nearEnd(
  progress: number,
  duration: number,
  isPlaying: boolean,
): boolean {
  if (duration <= 0) return false;
  if (isPlaying) return progress >= duration - END_THRESHOLD_MS;
  return progress >= duration - END_GRACE_MS;
}

/** Host: advance song queue when the current track finishes. */
export function useLiveQueueAutoAdvance(
  options: UseLiveQueueAutoAdvanceOptions,
): void {
  const { enabled, advancing, onAdvance, session, pendingQueueCount = 0, playback } =
    options;

  const onAdvanceRef = useRef(onAdvance);
  const firedKeyRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  const playbackRef = useRef(playback);
  const pendingRef = useRef(pendingQueueCount);

  onAdvanceRef.current = onAdvance;
  sessionRef.current = session;
  playbackRef.current = playback;
  pendingRef.current = pendingQueueCount;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (advancing) return;

      const sess = sessionRef.current;
      if (sess?.spotify_track_id) {
        const duration = sess.duration_ms ?? 0;
        const key = trackKeyFromSession(sess);
        if (firedKeyRef.current !== key) {
          firedKeyRef.current = key;
        }
        if (
          shouldRunQueueAdvance(pendingRef.current, sess) &&
          nearEnd(
            interpolatedProgressMs(sess),
            duration,
            Boolean(sess.is_playing),
          ) &&
          firedKeyRef.current === key
        ) {
          firedKeyRef.current = `${key}:done`;
          void onAdvanceRef.current();
        }
        return;
      }

      const pb = playbackRef.current;
      if (!pb?.trackId || !pb.durationMs) return;

      const key = pb.trackId;
      if (firedKeyRef.current !== key) {
        firedKeyRef.current = key;
      }

      if (
        !nearEnd(getCurrentProgressMs(pb), pb.durationMs, Boolean(pb.isPlaying)) ||
        firedKeyRef.current !== key
      ) {
        return;
      }

      firedKeyRef.current = `${key}:done`;
      void maybeAdvanceFromPlayer(onAdvanceRef.current);
    };

    tick();
    const id = window.setInterval(tick, 2_000);
    return () => window.clearInterval(id);
  }, [enabled, advancing, session?.spotify_track_id, session?.current_queue_id, session?.duration_ms, session?.is_playing, session?.playback_updated_at, playback?.trackId, playback?.durationMs, playback?.isPlaying, playback?.syncedAt]);
}

async function maybeAdvanceFromPlayer(
  onAdvance: () => void | Promise<void>,
): Promise<void> {
  const active = getActiveLiveSession();
  if (!active?.sessionId) return;
  if (active.jamsEnabled) return;

  try {
    const res = await fetch(`/api/live/${active.sessionId}/queue`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const body = (await res.json()) as {
      queue?: unknown[];
      session?: LiveSessionRow;
    };
    const pending = Array.isArray(body.queue) ? body.queue.length : 0;
    if (!shouldRunQueueAdvance(pending, body.session)) return;
    await onAdvance();
  } catch {
    /* ignore */
  }
}
