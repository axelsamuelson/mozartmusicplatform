"use client";

import Image from "next/image";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ListMusic,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { LiveSessionButton } from "@/components/LiveSessionButton";
import { RecentlyPlayed } from "@/components/RecentlyPlayed";
import {
  clearActiveLiveSession,
  getActiveLiveSession,
} from "@/lib/live/activeSessionStorage";
import {
  ensureActiveLiveSessionMetadata,
  shouldEnableLiveSessionHostSync,
  shouldSkipPlaybackApiPoll,
} from "@/lib/live/activeSessionMeta";
import { useLiveQueueAutoAdvance } from "@/lib/live/useLiveQueueAutoAdvance";
import { useLiveSessionHostSync } from "@/lib/live/useLiveSessionHostSync";
import { NowPlayingRatingDialog } from "@/components/NowPlayingRatingDialog";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import {
  registerAuditClientProvider,
  unregisterAuditClientProvider,
} from "@/lib/audit/auditBridge";
import { prefetchTagsCatalog } from "@/lib/ratings/tagsCache";
import { fetchWithRetry, userFacingFetchError } from "@/lib/http/fetchRetry";
import {
  getPlaybackAccessToken,
  startPlaybackTokenKeepalive,
  stopPlaybackTokenKeepalive,
} from "@/lib/spotify/clientPlaybackToken";
import { toast } from "sonner";
import { isPlaybackCancelled } from "@/lib/spotify/playerCommandError";
import { buildClientAuditSnapshot } from "@/lib/audit/useAuditCollector";
import { signInWithSpotifyClient } from "@/lib/auth/signInWithSpotifyClient";
import { createClient } from "@/lib/supabase/client";
import { emptyPlayback, sdkStateToPlayback } from "@/lib/playback/mappers";
import { playlistIdFromContextUri } from "@/lib/spotify/currentlyPlaying";
import {
  spotifyPlaylistRankHref,
  wamPlaylistRankHref,
} from "@/lib/playlist/urls";
import { useUnifiedPlayback } from "@/lib/playback/useUnifiedPlayback";
import type { PlaybackState } from "@/lib/playback/types";
import { isSpotifyCircuitOpen } from "@/lib/spotify/rateLimiter";
import {
  connectPlayback,
  disconnectPlayback,
  getCurrentState,
  getPlaybackVolume,
  isPlaybackDeviceReady,
  next,
  pause,
  previous,
  registerPlaybackTokenProvider,
  resume,
  seek,
  setVolume,
  spotifyItemHref,
  unregisterPlaybackTokenProvider,
} from "@/lib/spotify/player";
import { cn } from "@/lib/utils";
import type { RatingDetail } from "@/lib/types/ratings";

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function PlaylistContextLine({
  name,
  href,
  isWam,
  className,
}: {
  name: string;
  href: string;
  isWam: boolean;
  className?: string;
}) {
  const Icon = isWam ? Music2 : ListMusic;
  const linkClass = cn(
    "group/playlist inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs transition-colors",
    isWam ? "text-wam hover:text-wam" : "text-wam/70 hover:text-wam",
    className,
  );
  return (
    <Link href={href} className={linkClass}>
      <Icon
        className={cn("size-3.5 shrink-0", isWam ? "text-wam" : "text-wam/80")}
        aria-hidden
      />
      <span className="truncate underline-offset-2 group-hover/playlist:underline">
        {name}
      </span>
    </Link>
  );
}

function playlistContextFromPlayback(playback: PlaybackState | null) {
  if (!playback || playback.contextType !== "playlist" || !playback.contextUri) {
    return null;
  }
  const spotifyId = playlistIdFromContextUri(playback.contextUri);
  const name = playback.contextName?.trim();
  if (!name || !spotifyId) return null;
  const isWam = Boolean(playback.isWamPlaylist);
  const href =
    isWam && playback.wamPlaylistId
      ? wamPlaylistRankHref(playback.wamPlaylistId)
      : spotifyPlaylistRankHref(spotifyId);
  return { name, href, isWam };
}

const PLAYER_DEBUG = process.env.NODE_ENV === "development";

function playerLog(...args: unknown[]): void {
  if (PLAYER_DEBUG) console.log("[Player]", ...args);
}

export function Player() {
  const [hasUser, setHasUser] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [skipApiPoll, setSkipApiPoll] = useState(false);
  const [hostSyncEnabled, setHostSyncEnabled] = useState(false);
  const [queueAutoAdvanceEnabled, setQueueAutoAdvanceEnabled] = useState(false);
  const queueAdvancingRef = useRef(false);
  const [hasToken, setHasToken] = useState(false);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [volumePct, setVolumePct] = useState(70);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [currentTrackRating, setCurrentTrackRating] = useState<RatingDetail | null>(null);
  const playlistContextCacheRef = useRef<{ uri: string | null; name: string | null }>({
    uri: null,
    name: null,
  });
  const ratingTrackIdRef = useRef<string | null>(null);
  const hostSyncTriggerRef = useRef<() => void>(() => {});
  const refreshAfterTransportRef = useRef<() => Promise<void>>(async () => {});
  const lastRefreshAfterTransportAtRef = useRef(0);
  const playerMountRef = useRef(0);
  const auditCollectorRef = useRef({
    hasUser: false,
    hasToken: false,
    playbackReady: false,
    connectError: null as string | null,
    skipApiPoll: false,
    hostSyncEnabled: false,
    queueAutoAdvanceEnabled: false,
    playback: null as PlaybackState | null,
  });

  const {
    playback,
    displayProgressMs,
    applyPlayback,
    fetchApiPlayback,
    refreshAfterTransport,
    scheduleTransportPolls,
    optimisticSkip,
    clearSkipTransition,
  } = useUnifiedPlayback({
    hasToken,
    playbackReady,
    skipApiPoll,
    enabled: hasUser && hasToken,
    onTrackChanged: () => hostSyncTriggerRef.current(),
  });

  const refreshAfterTransportThrottled = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshAfterTransportAtRef.current < 1_200) return;
    lastRefreshAfterTransportAtRef.current = now;
    await refreshAfterTransport();
  }, [refreshAfterTransport]);

  refreshAfterTransportRef.current = refreshAfterTransportThrottled;

  const { triggerImmediateSync } = useLiveSessionHostSync({
    enabled: hasUser && hasToken && hostSyncEnabled,
    onTrackChanged: () => {
      void refreshAfterTransportThrottled();
    },
  });

  useEffect(() => {
    hostSyncTriggerRef.current = hostSyncEnabled ? triggerImmediateSync : () => {};
  }, [hostSyncEnabled, triggerImmediateSync]);

  const refreshLiveSessionPolling = useCallback(() => {
    const active = getActiveLiveSession();
    if (active?.isActive === false) {
      clearActiveLiveSession();
      setSkipApiPoll(false);
      setHostSyncEnabled(false);
      return;
    }
    setSkipApiPoll(shouldSkipPlaybackApiPoll(active, currentUserId));
    setHostSyncEnabled(shouldEnableLiveSessionHostSync(active, currentUserId));
    setQueueAutoAdvanceEnabled(
      Boolean(
        active &&
          currentUserId &&
          active.hostUserId === currentUserId &&
          active.jukeboxEnabled &&
          !active.jamsEnabled,
      ),
    );
  }, [currentUserId]);

  const advanceQueueFromPlayer = useCallback(async () => {
    const active = getActiveLiveSession();
    if (!active?.sessionId || active.jamsEnabled) return;
    if (queueAdvancingRef.current) return;
    queueAdvancingRef.current = true;
    try {
      const res = await fetch(`/api/live/${active.sessionId}/queue/next`, {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        void refreshAfterTransport();
      }
    } finally {
      queueAdvancingRef.current = false;
    }
  }, [refreshAfterTransport]);

  const onLiveSessionPage =
    typeof window !== "undefined" && /^\/live\/[^/]+/.test(window.location.pathname);

  useLiveQueueAutoAdvance({
    enabled:
      hasUser &&
      hasToken &&
      queueAutoAdvanceEnabled &&
      !onLiveSessionPage,
    playback,
    onAdvance: advanceQueueFromPlayer,
  });

  useEffect(() => {
    void ensureActiveLiveSessionMetadata().then(() => refreshLiveSessionPolling());
    const onSessionChange = () => {
      void ensureActiveLiveSessionMetadata().then(() => {
        refreshLiveSessionPolling();
        const active = getActiveLiveSession();
        if (active && shouldSkipPlaybackApiPoll(active, currentUserId)) {
          void refreshAfterTransport();
          void fetchApiPlayback(true);
        }
      });
    };
    window.addEventListener("wam-live-session-changed", onSessionChange);
    return () => window.removeEventListener("wam-live-session-changed", onSessionChange);
  }, [
    currentUserId,
    fetchApiPlayback,
    refreshAfterTransportThrottled,
    refreshLiveSessionPolling,
  ]);

  useEffect(() => {
    if (!hasUser) return;
    prefetchTagsCatalog();
    void fetch("/api/ratings?limit=1", { cache: "no-store" }).catch(() => {});
  }, [hasUser]);

  const lastSyncedUserIdRef = useRef<string | null>(null);
  const syncSessionRef = useRef<(authSession: Session | null) => Promise<void>>(
    async () => {},
  );

  useEffect(() => {
    const mountId = ++playerMountRef.current;
    const supabase = createClient();
    startPlaybackTokenKeepalive();

    async function fetchPlaybackToken(): Promise<string | null> {
      try {
        return await getPlaybackAccessToken();
      } catch {
        return null;
      }
    }

    registerPlaybackTokenProvider(fetchPlaybackToken);

    async function checkSpotifyToken(): Promise<boolean> {
      try {
        await getPlaybackAccessToken();
        return true;
      } catch {
        return false;
      }
    }

    async function syncSession(authSession: Session | null) {
      const user = authSession?.user ?? null;
      let tokenOk = false;
      if (user) {
        try {
          tokenOk = await checkSpotifyToken();
        } catch {
          tokenOk = false;
        }
      }

      setHasUser(Boolean(user));
      setCurrentUserId(user?.id ?? null);
      setHasToken(tokenOk);
      refreshLiveSessionPolling();

      if (!user || !tokenOk) {
        disconnectPlayback();
        setPlaybackReady(false);
        setConnectError(null);
        applyPlayback(emptyPlayback(), { broadcast: false });
        return;
      }

      try {
        setConnectError(null);
        if (isPlaybackDeviceReady()) {
          setPlaybackReady(true);
          try {
            const v = await getPlaybackVolume();
            setVolumePct(Math.round(v * 100));
          } catch {
            /* keep default */
          }
          const s = await getCurrentState();
          if (s) {
            const mapped = sdkStateToPlayback(s);
            if (mapped) {
              applyPlayback(mapped);
            } else if (!shouldSkipPlaybackApiPoll(getActiveLiveSession(), user.id)) {
              await fetchApiPlayback();
            }
          } else if (!shouldSkipPlaybackApiPoll(getActiveLiveSession(), user.id)) {
            await fetchApiPlayback();
          }
          return;
        }
        await connectPlayback();
        setPlaybackReady(true);
        try {
          const v = await getPlaybackVolume();
          setVolumePct(Math.round(v * 100));
        } catch {
          /* keep default */
        }
        const s = await getCurrentState();
        if (s) {
          const mapped = sdkStateToPlayback(s);
          if (mapped) {
            applyPlayback(mapped);
          } else if (!shouldSkipPlaybackApiPoll(getActiveLiveSession(), user.id)) {
            await fetchApiPlayback();
          }
        } else if (!shouldSkipPlaybackApiPoll(getActiveLiveSession(), user.id)) {
          await fetchApiPlayback();
        }
      } catch (e) {
        if (e instanceof Error && e.message === "Playback disconnected") return;
        setPlaybackReady(false);
        setConnectError(
          e instanceof Error ? e.message : "Playback unavailable",
        );
        if (!isSpotifyCircuitOpen()) {
          void fetchApiPlayback();
        }
      }
    }

    syncSessionRef.current = syncSession;

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void syncSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null;

      if (event === "TOKEN_REFRESHED") {
        if (process.env.NODE_ENV === "development") {
          console.log("[Player] TOKEN_REFRESHED sync");
        }
        lastSyncedUserIdRef.current = userId;
        void syncSession(session);
        return;
      }

      if (userId === lastSyncedUserIdRef.current) return;
      lastSyncedUserIdRef.current = userId;
      void syncSession(session);
    });

    return () => {
      subscription.unsubscribe();
      unregisterPlaybackTokenProvider();
      stopPlaybackTokenKeepalive();
      const unmountId = mountId;
      window.setTimeout(() => {
        if (playerMountRef.current === unmountId) {
          disconnectPlayback();
        }
      }, 150);
    };
  }, [applyPlayback, fetchApiPlayback, refreshLiveSessionPolling]);

  auditCollectorRef.current = {
    hasUser,
    hasToken,
    playbackReady,
    connectError,
    skipApiPoll,
    hostSyncEnabled,
    queueAutoAdvanceEnabled,
    playback,
  };

  useEffect(() => {
    registerAuditClientProvider(() =>
      buildClientAuditSnapshot(auditCollectorRef.current),
    );
    return () => unregisterAuditClientProvider();
  }, []);

  const fromSdk = playback?.source === "sdk";
  const hasAnyTrack = Boolean(playback?.trackId);
  const nowTrackId = playback?.trackId ?? null;
  const nowPlayingIsRateableTrack = playback?.itemKind !== "episode";

  const playlistContext = useMemo(
    () => playlistContextFromPlayback(playback),
    [playback],
  );

  useEffect(() => {
    if (!playback || playback.contextType !== "playlist" || !playback.contextUri) {
      playlistContextCacheRef.current = { uri: null, name: null };
      return;
    }
    const name = playback.contextName;
    if (typeof name === "string" && name.trim().length > 0) {
      playlistContextCacheRef.current = {
        uri: playback.contextUri,
        name: name.trim(),
      };
    }
  }, [playback]);

  useEffect(() => {
    if (!hasUser || !nowTrackId) {
      ratingTrackIdRef.current = null;
      setCurrentTrackRating(null);
      return;
    }
    ratingTrackIdRef.current = nowTrackId;
    setCurrentTrackRating(null);
    const ac = new AbortController();
    void fetchWithRetry(`/api/ratings?spotify_id=${encodeURIComponent(nowTrackId)}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          rating?: RatingDetail | null;
        };
        if (ac.signal.aborted || ratingTrackIdRef.current !== nowTrackId) return;
        if (!res.ok) {
          setCurrentTrackRating(null);
          return;
        }
        setCurrentTrackRating(body.rating ?? null);
      })
      .catch(() => {
        if (!ac.signal.aborted && ratingTrackIdRef.current === nowTrackId) {
          setCurrentTrackRating(null);
        }
      });
    return () => ac.abort();
  }, [hasUser, nowTrackId]);

  useEffect(() => {
    setRateDialogOpen(false);
  }, [nowTrackId]);

  useEffect(() => {
    if (!hasUser || !nowTrackId || !nowPlayingIsRateableTrack) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "r" && e.key !== "R") return;
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setRateDialogOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasUser, nowTrackId, nowPlayingIsRateableTrack]);

  const volumeFromSdk = playbackReady && fromSdk;

  useEffect(() => {
    if (!hasUser) {
      document.documentElement.style.setProperty("--wam-player-pad", "0px");
      return () => {
        document.documentElement.style.removeProperty("--wam-player-pad");
      };
    }

    function applyPad() {
      const compact = window.matchMedia("(max-width: 767px)").matches;
      if (!hasToken || connectError) {
        document.documentElement.style.setProperty(
          "--wam-player-pad",
          compact ? "3.5rem" : "2.75rem",
        );
        return;
      }
      document.documentElement.style.setProperty(
        "--wam-player-pad",
        compact ? "110px" : "5rem",
      );
    }

    applyPad();
    const mq = window.matchMedia("(max-width: 767px)");
    mq.addEventListener("change", applyPad);
    return () => {
      mq.removeEventListener("change", applyPad);
      document.documentElement.style.removeProperty("--wam-player-pad");
    };
  }, [hasUser, hasToken, connectError]);

  useEffect(() => {
    playerLog("playback:", playback);
  }, [playback]);

  const runTransport = useCallback(
    (action: () => Promise<void>) => {
      void action()
        .then(() => refreshAfterTransport())
        .catch((e: unknown) => {
          clearSkipTransition();
          void refreshAfterTransport();
          if (isPlaybackCancelled(e)) return;
          toast.error(
            userFacingFetchError(e, "Could not control playback. Try again."),
          );
        });
    },
    [clearSkipTransition, refreshAfterTransport],
  );

  const paused = !playback?.isPlaying;

  const onTogglePlayPause = useCallback(() => {
    if (playback) {
      applyPlayback({
        ...playback,
        isPlaying: paused,
        syncedAt: Date.now(),
      });
    }
    runTransport(() => (paused ? resume() : pause()));
  }, [applyPlayback, paused, playback, runTransport]);

  const onNextTrack = useCallback(() => {
    optimisticSkip("next");
    scheduleTransportPolls();
    runTransport(() => next());
  }, [optimisticSkip, runTransport, scheduleTransportPolls]);

  const onPreviousTrack = useCallback(() => {
    optimisticSkip("previous");
    scheduleTransportPolls();
    runTransport(() => previous());
  }, [optimisticSkip, runTransport, scheduleTransportPolls]);

  const handleReconnectSpotify = useCallback(async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      const { data } = await supabase.auth.getSession();
      await syncSessionRef.current(data.session);
      return;
    }
    await signInWithSpotifyClient();
  }, []);

  if (!hasUser) return null;

  const artUrl = playback?.imageUrl ?? null;
  const trackTitle = playback?.trackName ?? "Nothing playing";
  const artistLine = playback?.artistName ?? "—";
  const trackHref =
    hasAnyTrack && nowPlayingIsRateableTrack && nowTrackId
      ? spotifyItemHref("track", nowTrackId)
      : null;
  const artistHref =
    hasAnyTrack && playback?.artistId
      ? spotifyItemHref("artist", playback.artistId)
      : null;
  const deviceLine = fromSdk
    ? "Playing in this browser"
    : playback?.deviceName
      ? playback.isPlaying
        ? `Playing on ${playback.deviceName}`
        : `Paused · ${playback.deviceName}`
      : playbackReady && playback?.trackId
        ? "Paused · this browser"
        : null;

  const duration = playback?.durationMs ?? 0;
  const position = displayProgressMs;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const canShowRate = Boolean(
    nowTrackId && hasAnyTrack && nowPlayingIsRateableTrack,
  );

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const ms = Math.floor(ratio * duration);
    if (playback) {
      applyPlayback({
        ...playback,
        progressMsAtSync: ms,
        syncedAt: Date.now(),
      });
    }
    runTransport(() => seek(ms));
  };

  const onVolume = (vals: number[]) => {
    const v = vals[0] ?? 70;
    setVolumePct(v);
    if (volumeFromSdk) {
      void setVolume(v / 100).catch(() => {
        /* SDK not connected */
      });
    }
  };

  if (!hasToken) {
    return (
      <div
        className={cn(
          "fixed right-0 bottom-0 left-0 z-40 border-t border-white/10 bg-black/95 text-white backdrop-blur-xl",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-3">
          <span className="text-xs text-white/40">Spotify connection lost</span>
          <button
            type="button"
            onClick={() => void handleReconnectSpotify()}
            className="text-xs text-wam underline underline-offset-2 hover:text-wam/80"
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed right-0 bottom-0 left-0 z-40 border-t border-white/10 bg-black/95 text-white backdrop-blur-xl",
      )}
    >
      {/* Mobile: compact 3-row layout */}
      <div className="mx-auto flex w-full max-w-6xl flex-col md:hidden">
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/10">
            {artUrl ? (
              <Image
                key={nowTrackId ?? "none"}
                src={artUrl}
                alt=""
                width={40}
                height={40}
                className="size-10 object-cover"
              />
            ) : (
              <div className="flex size-10 items-center justify-center text-white/30">
                <Play className="size-4" />
              </div>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5">
            {trackHref ? (
              <Link
                href={trackHref}
                className="truncate text-sm font-medium text-white hover:underline"
              >
                {trackTitle}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-white">
                {hasAnyTrack ? trackTitle : "Nothing playing"}
              </p>
            )}
            {artistHref ? (
              <Link
                href={artistHref}
                className="truncate text-xs text-white/50 hover:text-white hover:underline"
              >
                {artistLine}
              </Link>
            ) : (
              <p className="truncate text-xs text-white/50">
                {hasAnyTrack ? artistLine : "—"}
              </p>
            )}
            {playlistContext ? (
              <PlaylistContextLine
                name={playlistContext.name}
                href={playlistContext.href}
                isWam={playlistContext.isWam}
                className="mt-0.5"
              />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveSessionButton canStart={Boolean(canShowRate)} />
            {canShowRate ? (
              <button
                type="button"
                onClick={() => setRateDialogOpen(true)}
                aria-label={
                  currentTrackRating
                    ? `Rated ${currentTrackRating.score}, edit rating`
                    : "Rate this track (R)"
                }
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold tabular-nums transition-colors",
                  currentTrackRating
                    ? scoreBadgeClass(currentTrackRating.score)
                    : "border border-white/20 text-white/60 hover:border-wam hover:text-wam",
                )}
              >
                {currentTrackRating ? currentTrackRating.score : "Rate"}
              </button>
            ) : null}
          </div>
        </div>
        {connectError ? (
          <p className="truncate px-4 pt-1 text-xs text-amber-300/90">{connectError}</p>
        ) : null}
        <div className="px-4 pt-2">
          <div
            role="slider"
            tabIndex={0}
            aria-valuenow={Math.round(progress)}
            className="h-0.5 w-full cursor-pointer rounded-full bg-white/10"
            onClick={onSeekBarClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
              }
            }}
          >
            <div
              className="h-full rounded-full bg-wam"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/30">
            <span>{formatMs(position)}</span>
            <span>{formatMs(duration)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-2">
          <button
            type="button"
            aria-label="Previous"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            onClick={onPreviousTrack}
          >
            <SkipBack className="size-5" />
          </button>
          <button
            type="button"
            aria-label={paused ? "Play" : "Pause"}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-wam text-black shadow-md transition-transform hover:scale-[1.03] hover:bg-wam/90"
            onClick={onTogglePlayPause}
          >
            {paused ? (
              <Play className="size-[18px] fill-current" />
            ) : (
              <Pause className="size-[18px] fill-current" />
            )}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Next"
              className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              onClick={onNextTrack}
            >
              <SkipForward className="size-5" />
            </button>
            <RecentlyPlayed />
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden w-full max-w-6xl flex-col gap-3 px-3 py-3 md:flex md:h-20 md:flex-row md:items-stretch md:gap-0 md:px-4 md:py-0">
        <div className="order-1 flex min-h-0 min-w-0 shrink-0 flex-1 basis-0 items-start gap-2 md:order-none md:items-center md:gap-3 md:pr-3">
          <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/10 md:size-12 md:rounded-lg">
            {artUrl ? (
              <Image
                key={nowTrackId ?? "none"}
                src={artUrl}
                alt=""
                width={48}
                height={48}
                className="size-9 object-cover md:size-12"
              />
            ) : (
              <div className="flex size-9 items-center justify-center text-white/30 md:size-12">
                <Play className="size-4 md:size-5" />
              </div>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 pt-0.5 md:pt-0">
            {trackHref ? (
              <Link
                href={trackHref}
                className="line-clamp-2 text-[13px] font-medium leading-snug text-white hover:underline md:truncate md:text-sm"
              >
                {trackTitle}
              </Link>
            ) : (
              <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white md:truncate md:text-sm">
                {hasAnyTrack ? trackTitle : "Nothing playing"}
              </p>
            )}
            {artistHref ? (
              <Link
                href={artistHref}
                className="truncate text-[11px] text-white/50 hover:text-white hover:underline md:text-xs"
              >
                {artistLine}
              </Link>
            ) : (
              <p className="truncate text-[11px] text-white/50 md:text-xs">
                {hasAnyTrack ? artistLine : "—"}
              </p>
            )}
            {playlistContext ? (
              <PlaylistContextLine
                name={playlistContext.name}
                href={playlistContext.href}
                isWam={playlistContext.isWam}
                className="mt-0.5 hidden md:inline-flex"
              />
            ) : null}
            {deviceLine && hasAnyTrack ? (
              <p className="hidden truncate text-xs text-white/30 md:block">{deviceLine}</p>
            ) : null}
            {connectError ? (
              <p className="truncate text-[11px] text-amber-300/90 md:text-xs">{connectError}</p>
            ) : null}
          </div>
        </div>

        <div className="order-2 flex min-h-0 w-full shrink-0 flex-col justify-center gap-3 md:order-none md:flex-1 md:basis-0 md:gap-2 md:px-4">
          <div className="hidden items-center justify-center gap-3 md:flex">
            <button
              type="button"
              aria-label="Previous"
              className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              onClick={onPreviousTrack}
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              aria-label={paused ? "Play" : "Pause"}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wam text-black shadow-md transition-transform hover:scale-[1.03] hover:bg-wam/90"
              onClick={onTogglePlayPause}
            >
              {paused ? (
                <Play className="size-4 fill-current" />
              ) : (
                <Pause className="size-4 fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label="Next"
              className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              onClick={onNextTrack}
            >
              <SkipForward className="size-4" />
            </button>
            <RecentlyPlayed />
          </div>
          <div className="flex w-full flex-col gap-1.5">
            <div className="flex w-full items-center gap-2">
              <span className="hidden shrink-0 text-xs tabular-nums text-white/40 md:inline">
                {formatMs(position)}
              </span>
              <div
                role="slider"
                tabIndex={0}
                aria-valuenow={Math.round(progress)}
                className="h-1 min-w-0 flex-1 cursor-pointer rounded-full bg-white/10 md:h-0.5"
                onClick={onSeekBarClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                  }
                }}
              >
                <div
                  className="h-full rounded-full bg-wam"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="hidden shrink-0 text-xs tabular-nums text-white/40 md:inline">
                {formatMs(duration)}
              </span>
            </div>
          </div>
        </div>

        <div className="order-3 hidden min-h-0 flex-1 basis-0 items-center justify-end gap-4 md:order-none md:flex md:pl-3">
          <LiveSessionButton canStart={Boolean(canShowRate)} />
          {canShowRate ? (
            <button
              type="button"
              onClick={() => setRateDialogOpen(true)}
              aria-label={
                currentTrackRating
                  ? `Rated ${currentTrackRating.score}, edit rating`
                  : "Rate this track (R)"
              }
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums transition-colors",
                currentTrackRating
                  ? scoreBadgeClass(currentTrackRating.score)
                  : "border border-white/20 text-white/60 hover:border-wam hover:text-wam",
              )}
            >
              {currentTrackRating ? currentTrackRating.score : "Rate"}
            </button>
          ) : null}

          <div className="flex max-w-[10rem] flex-1 items-center gap-2">
            <Volume2 className="size-3.5 shrink-0 text-white/40" aria-hidden />
            <Slider
              min={0}
              max={100}
              step={1}
              value={[volumePct]}
              onValueChange={onVolume}
              disabled={!volumeFromSdk}
              title={
                !volumeFromSdk
                  ? "Volume only when the in-browser player is connected"
                  : undefined
              }
              className="flex-1 py-1 [&_[role=slider]]:border-white/30"
            />
          </div>
        </div>
      </div>

      {nowTrackId && nowPlayingIsRateableTrack ? (
        <NowPlayingRatingDialog
          open={rateDialogOpen}
          onOpenChange={setRateDialogOpen}
          spotifyId={nowTrackId}
          displayTitle={hasAnyTrack ? trackTitle : ""}
          displayArtist={hasAnyTrack ? artistLine : ""}
          displayImageUrl={artUrl}
          onRatingUpdated={(r) => setCurrentTrackRating(r)}
        />
      ) : null}
    </div>
  );
}
