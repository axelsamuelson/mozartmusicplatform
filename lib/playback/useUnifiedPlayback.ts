"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { debounce } from "@/lib/utils/debounce";

import { useUserActivity } from "@/hooks/useUserActivity";
import { broadcastPlayback, subscribeToPlayback } from "@/lib/playback/broadcastSync";
import {
  apiPayloadToPlayback,
  emptyPlayback,
  playbackFromSdkTrack,
  sdkStateToPlayback,
} from "@/lib/playback/mappers";
import { getCurrentProgressMs } from "@/lib/playback/progress";
import { setLastPlaybackCircuitHeader } from "@/lib/audit/playbackHints";
import { startPollLeaderHeartbeat } from "@/lib/playback/pollLeader";
import type { PlaybackApiPayload, PlaybackState } from "@/lib/playback/types";
import { isSpotifyCircuitOpen } from "@/lib/spotify/rateLimiter";
import {
  getCurrentState,
  peekSdkQueuedTrack,
  registerStateChangeListener,
} from "@/lib/spotify/player";

const PLAYBACK_POLLING_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_PLAYBACK_POLLING === "true";

const IDLE_API_MS = 60_000;
const ACTIVE_POLL_CAP_MS = 3_000;
/** Minimum gap between playback API polls (stops SDK/error feedback loops). */
const MIN_PLAYBACK_FETCH_MS = 2_500;
const MIN_FORCE_PLAYBACK_FETCH_MS = 1_500;
const SDK_EMPTY_TRACK_POLL_MS = 5_000;
const PLAYBACK_HTTP_BACKOFF_MS = 60_000;
/** Early polls to detect external-device track changes. */
const EARLY_SKIP_MS = [2_000, 6_000, 15_000] as const;
/** Fewer, spaced polls — avoid stampeding Spotify after skip on external devices. */
const TRANSPORT_POLL_DELAYS_MS = [600, 2_000] as const;
/** Ignore stale SDK/API echoes of a track we just skipped, for this long. */
const SKIP_STALE_MS = 2_000;
/** Cap React re-renders from progress interpolation (~4 fps). */
const DISPLAY_PROGRESS_MIN_INTERVAL_MS = 250;

function mergePlaybackMeta(
  prev: PlaybackState | null,
  next: PlaybackState,
): PlaybackState {
  if (!prev) return next;
  const sameTrack = Boolean(prev.trackId && prev.trackId === next.trackId);
  const sameContext = Boolean(prev.contextUri && prev.contextUri === next.contextUri);
  return {
    ...next,
    artistId: next.artistId ?? (sameTrack ? prev.artistId : null),
    contextName: next.contextName ?? (sameContext ? prev.contextName : undefined),
    isWamPlaylist: next.isWamPlaylist ?? (sameContext ? prev.isWamPlaylist : undefined),
    wamPlaylistId: next.wamPlaylistId ?? (sameContext ? prev.wamPlaylistId : undefined),
  };
}

function isSdkPrimary(state: PlaybackState | null): boolean {
  return state?.source === "sdk" && Boolean(state.trackId);
}

export type UnifiedPlaybackControls = {
  playback: PlaybackState | null;
  displayProgressMs: number;
  applyPlayback: (next: PlaybackState, options?: { broadcast?: boolean }) => boolean;
  fetchApiPlayback: (force?: boolean) => Promise<void>;
  refreshAfterTransport: () => Promise<void>;
  clearTimers: () => void;
  scheduleApiFetch: (state: PlaybackState | null) => void;
  scheduleTransportPolls: () => void;
  optimisticSkip: (direction: "next" | "previous") => void;
  clearSkipTransition: () => void;
};

export function useUnifiedPlayback(options: {
  hasToken: boolean;
  playbackReady: boolean;
  skipApiPoll: boolean;
  enabled: boolean;
  /** Fired when playback track id changes (host live sync, etc.). */
  onTrackChanged?: () => void;
}): UnifiedPlaybackControls {
  const { hasToken, playbackReady, skipApiPoll, enabled, onTrackChanged } = options;
  const isUserActive = useUserActivity();
  const onTrackChangedRef = useRef(onTrackChanged);
  onTrackChangedRef.current = onTrackChanged;
  const notifyTrackChanged = useMemo(
    () =>
      debounce(() => {
        onTrackChangedRef.current?.();
      }, 800),
    [],
  );

  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [displayProgressMs, setDisplayProgressMs] = useState(0);
  const playbackRef = useRef<PlaybackState | null>(null);
  const prevTrackIdRef = useRef<string | null>(null);
  const isLeaderRef = useRef(true);
  const tabVisibleRef = useRef(true);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const earlySkipTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transportPollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const trackStartedAtRef = useRef(0);
  const skipIgnoreIdsRef = useRef<Set<string>>(new Set());
  const skipIgnoreUntilRef = useRef(0);
  const forceFetchGenRef = useRef(0);
  const forceFetchAbortRef = useRef<AbortController | null>(null);
  const lastApiFetchAtRef = useRef(0);
  const playbackPollBackoffUntilRef = useRef(0);
  const lastSdkEmptyPollAtRef = useRef(0);

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

  const clearTransportPollTimers = useCallback(() => {
    for (const id of transportPollTimersRef.current) clearTimeout(id);
    transportPollTimersRef.current = [];
  }, []);

  const clearTimers = useCallback(() => {
    clearFetchTimer();
    clearEarlySkipTimers();
    clearTransportPollTimers();
  }, [clearEarlySkipTimers, clearFetchTimer, clearTransportPollTimers]);

  const clearSkipTransition = useCallback(() => {
    skipIgnoreIdsRef.current.clear();
    skipIgnoreUntilRef.current = 0;
  }, []);

  const applyPlayback = useCallback(
    (next: PlaybackState, opts?: { broadcast?: boolean }): boolean => {
      const ignoreUntil = skipIgnoreUntilRef.current;
      const ignoreIds = skipIgnoreIdsRef.current;
      if (
        ignoreUntil > Date.now() &&
        next.trackId &&
        ignoreIds.has(next.trackId)
      ) {
        return false;
      }
      if (next.trackId && ignoreIds.size > 0 && !ignoreIds.has(next.trackId)) {
        clearSkipTransition();
      }

      const prev = playbackRef.current;
      if (prev?.trackId !== next.trackId) {
        trackStartedAtRef.current = Date.now();
      }
      if (next.trackId !== prevTrackIdRef.current) {
        prevTrackIdRef.current = next.trackId;
        notifyTrackChanged();
      }
      playbackRef.current = mergePlaybackMeta(prev, next);
      const merged = playbackRef.current;
      setPlayback(merged);
      setDisplayProgressMs(getCurrentProgressMs(merged));
      if (opts?.broadcast !== false) {
        broadcastPlayback(merged);
      }
      return true;
    },
    [clearSkipTransition, notifyTrackChanged],
  );

  const optimisticSkip = useCallback(
    (direction: "next" | "previous") => {
      const current = playbackRef.current;
      if (current?.trackId) {
        skipIgnoreIdsRef.current.add(current.trackId);
      }
      skipIgnoreUntilRef.current = Date.now() + SKIP_STALE_MS;

      // Only paint the immediate next/previous when we know it (SDK queue).
      // Don't peek ahead — rapid clicks would invent tracks Spotify hasn't reached.
      const queued = peekSdkQueuedTrack(direction, 0);
      if (queued && current) {
        applyPlayback(playbackFromSdkTrack(queued, { ...current, isPlaying: true }));
      }
    },
    [applyPlayback],
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
      const triggerIn = Math.min(
        Math.max(remainingMs - 500, 1_000),
        ACTIVE_POLL_CAP_MS,
      );
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

  const fetchApiPlaybackRef = useRef<(force?: boolean) => Promise<void>>(
    async () => {},
  );

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
    const now = Date.now();
    if (now < playbackPollBackoffUntilRef.current) {
      return;
    }
    const minGap = force ? MIN_FORCE_PLAYBACK_FETCH_MS : MIN_PLAYBACK_FETCH_MS;
    if (now - lastApiFetchAtRef.current < minGap) {
      return;
    }
    lastApiFetchAtRef.current = now;
    if (!isLeaderRef.current && playbackRef.current) {
      return;
    }
    if (!force && isSdkPrimary(playbackRef.current)) {
      return;
    }

    let ac: AbortController | null = null;
    let gen = 0;
    if (force) {
      forceFetchAbortRef.current?.abort();
      ac = new AbortController();
      forceFetchAbortRef.current = ac;
      gen = ++forceFetchGenRef.current;
    }

    try {
      const url = force
        ? "/api/spotify/playback?fresh=1"
        : "/api/spotify/playback";
      const res = await fetch(url, {
        cache: "no-store",
        signal: ac?.signal,
      });
      if (force && gen !== forceFetchGenRef.current) return;

      if (res.status === 403 || res.status === 429) {
        playbackPollBackoffUntilRef.current = Date.now() + PLAYBACK_HTTP_BACKOFF_MS;
        return;
      }
      if (res.status >= 500) {
        playbackPollBackoffUntilRef.current = Date.now() + 15_000;
        return;
      }

      const circuit = res.headers.get("X-WAM-Circuit");
      setLastPlaybackCircuitHeader(circuit);
      if (circuit === "open") {
        return;
      }
      const json = (await res.json()) as PlaybackApiPayload;
      if (!res.ok || typeof json.error === "string") return;
      if (force && gen !== forceFetchGenRef.current) return;

      const clientReceivedAt = Date.now();
      const next = apiPayloadToPlayback(json, clientReceivedAt);

      if (isSdkPrimary(playbackRef.current) && next.source === "api") {
        const sdkId = playbackRef.current?.trackId;
        // Don't let a transient empty API poll wipe an active SDK session.
        if (!next.trackId) {
          return;
        }
        if (sdkId && next.trackId && sdkId === next.trackId) {
          return;
        }
      }

      applyPlayback(next);
      if (next.source === "api") {
        scheduleApiFetch(next);
        scheduleEarlySkipChecks(next);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
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

  const scheduleTransportPolls = useCallback(() => {
    clearTransportPollTimers();
    // Browser SDK already pushes player_state_changed — extra API polls fight cache.
    if (isSdkPrimary(playbackRef.current)) return;
    // refreshAfterTransport does the immediate fresh fetch; these are lag catch-ups only.
    for (const delay of TRANSPORT_POLL_DELAYS_MS) {
      const id = setTimeout(() => {
        const current = playbackRef.current;
        const ignoring = skipIgnoreUntilRef.current > Date.now();
        if (
          !ignoring &&
          current?.trackId &&
          !skipIgnoreIdsRef.current.has(current.trackId)
        ) {
          return;
        }
        void fetchApiPlaybackRef.current(true);
      }, delay);
      transportPollTimersRef.current.push(id);
    }
  }, [clearTransportPollTimers]);

  const applySdkState = useCallback(
    (state: Parameters<typeof sdkStateToPlayback>[0]): boolean => {
      const mapped = sdkStateToPlayback(state);
      if (mapped) {
        clearTimers();
        return applyPlayback(mapped);
      }
      if (!isSdkPrimary(playbackRef.current)) {
        void fetchApiPlayback();
      }
      return false;
    },
    [applyPlayback, clearTimers, fetchApiPlayback],
  );

  const refreshAfterTransport = useCallback(async () => {
    if (isSdkPrimary(playbackRef.current)) {
      try {
        const s = await getCurrentState();
        if (s && applySdkState(s)) {
          return;
        }
      } catch {
        /* fall through to API */
      }
    }
    await fetchApiPlayback(true);
  }, [applySdkState, fetchApiPlayback]);

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
      // Route through applyPlayback so skip-stale guards still apply.
      applyPlayback(remote, { broadcast: false });
      if (remote.source === "api" && isLeaderRef.current) {
        scheduleApiFetch(remote);
      }
    });
  }, [applyPlayback, enabled, scheduleApiFetch]);

  // SDK events
  useEffect(() => {
    if (!playbackReady) return;
    return registerStateChangeListener((state) => {
      if (!state?.track_window?.current_track) {
        const now = Date.now();
        if (now - lastSdkEmptyPollAtRef.current < SDK_EMPTY_TRACK_POLL_MS) {
          return;
        }
        lastSdkEmptyPollAtRef.current = now;
        void fetchApiPlayback(true);
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
  }, [clearTimers, enabled, fetchApiPlayback, hasToken, skipApiPoll]);

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

  // Progress interpolation — throttled setState to avoid re-rendering Player at 60fps
  useEffect(() => {
    const current = playbackRef.current;
    if (!current?.trackId) {
      setDisplayProgressMs(0);
      return;
    }

    setDisplayProgressMs(getCurrentProgressMs(current));
    if (!current.isPlaying) return;

    let raf = 0;
    let lastUiUpdate = 0;
    const tick = () => {
      const state = playbackRef.current;
      if (!state?.isPlaying) return;
      const now = Date.now();
      if (now - lastUiUpdate >= DISPLAY_PROGRESS_MIN_INTERVAL_MS) {
        lastUiUpdate = now;
        setDisplayProgressMs(getCurrentProgressMs(state));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    playback?.trackId,
    playback?.isPlaying,
    playback?.progressMsAtSync,
    playback?.syncedAt,
    playback?.durationMs,
  ]);

  return {
    playback,
    displayProgressMs,
    applyPlayback,
    fetchApiPlayback,
    refreshAfterTransport,
    clearTimers,
    scheduleApiFetch,
    scheduleTransportPolls,
    optimisticSkip,
    clearSkipTransition,
  };
}
