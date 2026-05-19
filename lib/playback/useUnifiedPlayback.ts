"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useUserActivity } from "@/hooks/useUserActivity";
import { broadcastPlayback, subscribeToPlayback } from "@/lib/playback/broadcastSync";
import {
  apiPayloadToPlayback,
  emptyPlayback,
  sdkStateToPlayback,
} from "@/lib/playback/mappers";
import { getCurrentProgressMs } from "@/lib/playback/progress";
import { startPollLeaderHeartbeat } from "@/lib/playback/pollLeader";
import type { PlaybackApiPayload, PlaybackState } from "@/lib/playback/types";
import { isSpotifyCircuitOpen } from "@/lib/spotify/rateLimiter";
import {
  getCurrentState,
  registerStateChangeListener,
} from "@/lib/spotify/player";

const PLAYBACK_POLLING_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_PLAYBACK_POLLING === "true";

const IDLE_API_MS = 60_000;
/** Single early check for external-device skip (was 12s + 25s). */
const EARLY_SKIP_MS = [20_000] as const;

function isSdkPrimary(state: PlaybackState | null): boolean {
  return state?.source === "sdk" && Boolean(state.trackId);
}

export type UnifiedPlaybackControls = {
  playback: PlaybackState | null;
  displayProgressMs: number;
  applyPlayback: (next: PlaybackState, options?: { broadcast?: boolean }) => void;
  fetchApiPlayback: (force?: boolean) => Promise<void>;
  refreshAfterTransport: () => Promise<void>;
  clearTimers: () => void;
  scheduleApiFetch: (state: PlaybackState | null) => void;
};

export function useUnifiedPlayback(options: {
  hasToken: boolean;
  playbackReady: boolean;
  skipApiPoll: boolean;
  enabled: boolean;
}): UnifiedPlaybackControls {
  const { hasToken, playbackReady, skipApiPoll, enabled } = options;
  const isUserActive = useUserActivity();

  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [displayProgressMs, setDisplayProgressMs] = useState(0);
  const playbackRef = useRef<PlaybackState | null>(null);
  const isLeaderRef = useRef(true);
  const tabVisibleRef = useRef(true);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const earlySkipTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const trackStartedAtRef = useRef(0);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const clearFetchTimer = useCallback(() => {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = null;
    }
  }, []);

  const clearEarlySkipTimers = useCallback(() => {
    for (const id of earlySkipTimersRef.current) clearTimeout(id);
    earlySkipTimersRef.current = [];
  }, []);

  const clearTimers = useCallback(() => {
    clearFetchTimer();
    clearEarlySkipTimers();
  }, [clearEarlySkipTimers, clearFetchTimer]);

  const applyPlayback = useCallback(
    (next: PlaybackState, opts?: { broadcast?: boolean }) => {
      const prev = playbackRef.current;
      if (prev?.trackId !== next.trackId) {
        trackStartedAtRef.current = Date.now();
      }
      playbackRef.current = next;
      setPlayback(next);
      setDisplayProgressMs(getCurrentProgressMs(next));
      if (opts?.broadcast !== false) {
        broadcastPlayback(next);
      }
    },
    [],
  );

  const scheduleApiFetch = useCallback(
    (state: PlaybackState | null) => {
      clearFetchTimer();
      if (
        !enabled ||
        !hasToken ||
        PLAYBACK_POLLING_DISABLED ||
        skipApiPoll ||
        !isLeaderRef.current ||
        !tabVisibleRef.current ||
        isSdkPrimary(state)
      ) {
        return;
      }

      if (!state || !state.isPlaying || !state.durationMs) {
        fetchTimerRef.current = setTimeout(() => {
          void fetchApiPlaybackRef.current();
        }, IDLE_API_MS);
        return;
      }

      const currentProgress = getCurrentProgressMs(state);
      const remainingMs = state.durationMs - currentProgress;
      const triggerIn = Math.min(Math.max(remainingMs - 500, 1_000), 60_000);
      fetchTimerRef.current = setTimeout(() => {
        void fetchApiPlaybackRef.current();
      }, triggerIn);
    },
    [clearFetchTimer, enabled, hasToken, skipApiPoll],
  );

  const scheduleEarlySkipChecks = useCallback(
    (state: PlaybackState | null) => {
      clearEarlySkipTimers();
      if (
        !isUserActive ||
        !state ||
        state.source !== "api" ||
        !state.isPlaying ||
        !state.trackId ||
        !isLeaderRef.current ||
        !tabVisibleRef.current
      ) {
        return;
      }

      const elapsedSinceTrack = Date.now() - trackStartedAtRef.current;
      for (const at of EARLY_SKIP_MS) {
        const delay = Math.max(at - elapsedSinceTrack, 0);
        const id = setTimeout(() => {
          const current = playbackRef.current;
          if (
            current?.source === "api" &&
            current.trackId === state.trackId &&
            current.isPlaying
          ) {
            void fetchApiPlaybackRef.current();
          }
        }, delay);
        earlySkipTimersRef.current.push(id);
      }
    },
    [clearEarlySkipTimers, isUserActive],
  );

  const fetchApiPlaybackRef = useRef<() => Promise<void>>(async () => {});

  const fetchApiPlayback = useCallback(async (force = false) => {
    if (
      !enabled ||
      !hasToken ||
      PLAYBACK_POLLING_DISABLED ||
      (!force && skipApiPoll) ||
      isSpotifyCircuitOpen()
    ) {
      return;
    }
    if (!isLeaderRef.current && playbackRef.current) {
      return;
    }
    if (isSdkPrimary(playbackRef.current)) {
      return;
    }

    try {
      const res = await fetch("/api/spotify/playback", { cache: "no-store" });
      const circuit = res.headers.get("X-WAM-Circuit");
      if (circuit === "open") {
        return;
      }
      const json = (await res.json()) as PlaybackApiPayload;
      if (!res.ok || typeof json.error === "string") return;

      const clientReceivedAt = Date.now();
      const next = apiPayloadToPlayback(json, clientReceivedAt);

      if (isSdkPrimary(playbackRef.current) && next.source === "api") {
        const sdkId = playbackRef.current?.trackId;
        if (sdkId && next.trackId && sdkId === next.trackId) {
          scheduleApiFetch(playbackRef.current);
          return;
        }
      }

      applyPlayback(next);
      if (next.source === "api") {
        scheduleApiFetch(next);
        scheduleEarlySkipChecks(next);
      }
    } catch {
      /* ignore */
    }
  }, [
    applyPlayback,
    enabled,
    hasToken,
    scheduleApiFetch,
    scheduleEarlySkipChecks,
    skipApiPoll,
  ]);

  fetchApiPlaybackRef.current = fetchApiPlayback;

  const applySdkState = useCallback(
    (state: Parameters<typeof sdkStateToPlayback>[0]) => {
      const mapped = sdkStateToPlayback(state);
      if (mapped) {
        clearTimers();
        applyPlayback(mapped);
        return;
      }
      if (!isSdkPrimary(playbackRef.current)) {
        void fetchApiPlayback();
      }
    },
    [applyPlayback, clearTimers, fetchApiPlayback],
  );

  const refreshAfterTransport = useCallback(async () => {
    if (isSdkPrimary(playbackRef.current) || playbackReady) {
      try {
        const s = await getCurrentState();
        if (s) {
          applySdkState(s);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    await fetchApiPlayback();
  }, [applySdkState, fetchApiPlayback, playbackReady]);

  // Leader election
  useEffect(() => {
    if (!enabled || !hasToken) return;
    return startPollLeaderHeartbeat((isLeader) => {
      isLeaderRef.current = isLeader;
      if (isLeader && tabVisibleRef.current && !isSdkPrimary(playbackRef.current)) {
        void fetchApiPlayback();
      }
    });
  }, [enabled, fetchApiPlayback, hasToken]);

  // Cross-tab sync
  useEffect(() => {
    if (!enabled) return;
    return subscribeToPlayback((remote) => {
      if (!remote.syncedAt) return;
      const local = playbackRef.current;
      if (local && local.syncedAt >= remote.syncedAt) return;
      playbackRef.current = remote;
      setPlayback(remote);
      setDisplayProgressMs(getCurrentProgressMs(remote));
      if (remote.source === "api" && isLeaderRef.current) {
        scheduleApiFetch(remote);
      }
    });
  }, [enabled, scheduleApiFetch]);

  // SDK events
  useEffect(() => {
    if (!playbackReady) return;
    return registerStateChangeListener((state) => {
      if (!state?.track_window?.current_track) {
        if (!isSdkPrimary(playbackRef.current)) {
          void fetchApiPlayback();
        }
        return;
      }
      applySdkState(state);
    });
  }, [applySdkState, fetchApiPlayback, playbackReady]);

  // Initial API + schedule when external device
  useEffect(() => {
    if (!enabled || !hasToken || PLAYBACK_POLLING_DISABLED || skipApiPoll) return;
    if (isSdkPrimary(playbackRef.current)) return;
    void fetchApiPlayback();
    return () => clearTimers();
  }, [
    clearTimers,
    enabled,
    fetchApiPlayback,
    hasToken,
    playbackReady,
    skipApiPoll,
  ]);

  // Visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      tabVisibleRef.current = visible;
      if (visible) {
        if (!isSdkPrimary(playbackRef.current)) {
          void fetchApiPlayback();
        }
        scheduleApiFetch(playbackRef.current);
        scheduleEarlySkipChecks(playbackRef.current);
      } else {
        clearTimers();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [
    clearTimers,
    fetchApiPlayback,
    scheduleApiFetch,
    scheduleEarlySkipChecks,
  ]);

  // Progress RAF (250ms)
  useEffect(() => {
    if (!playback) {
      setDisplayProgressMs(0);
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 250) {
        last = now;
        const current = playbackRef.current;
        if (current) {
          setDisplayProgressMs(getCurrentProgressMs(current));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playback]);

  return {
    playback,
    displayProgressMs,
    applyPlayback,
    fetchApiPlayback,
    refreshAfterTransport,
    clearTimers,
    scheduleApiFetch,
  };
}
