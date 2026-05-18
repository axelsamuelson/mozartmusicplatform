"use client";

import Image from "next/image";
import Link from "next/link";
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
import { NowPlayingRatingDialog } from "@/components/NowPlayingRatingDialog";
import { scoreBadgeClass } from "@/components/ScoreSlider";
import { createClient } from "@/lib/supabase/client";
import {
  playlistIdFromContextUri,
  type SpotifyCurrentPlayback,
  type SpotifyPlaybackApiResponse,
} from "@/lib/spotify/currentlyPlaying";
import {
  connectPlayback,
  disconnectPlayback,
  getCurrentState,
  getPlaybackVolume,
  next,
  pause,
  previous,
  registerPlaybackTokenProvider,
  resume,
  seek,
  setVolume,
  unregisterPlaybackTokenProvider,
} from "@/lib/spotify/player";
import type { SpotifyWebPlaybackState } from "@/lib/spotify/player";
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
  const content = (
    <>
      <Icon
        className={cn("size-3.5 shrink-0", isWam ? "text-wam" : "text-wam/80")}
        aria-hidden
      />
      <span className="truncate underline-offset-2 group-hover/playlist:underline">
        {name}
      </span>
    </>
  );

  if (isWam && href.startsWith("/")) {
    return (
      <Link href={href} className={linkClass}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {content}
    </a>
  );
}

function isApiPlaybackWithTrack(
  r: SpotifyPlaybackApiResponse,
): r is SpotifyCurrentPlayback {
  return (
    "trackId" in r &&
    typeof r.trackId === "string" &&
    r.trackId.length > 0
  );
}

const PLAYBACK_POLLING_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_PLAYBACK_POLLING === "true";

const PLAYER_DEBUG = process.env.NODE_ENV === "development";

function playerLog(...args: unknown[]): void {
  if (PLAYER_DEBUG) console.log("[Player]", ...args);
}

function apiPlaybackPollMs(playback: SpotifyPlaybackApiResponse): number {
  if (!isApiPlaybackWithTrack(playback)) return 60_000;
  if (playback.isPlaying) return 15_000;
  return 30_000;
}

export function Player() {
  const [hasUser, setHasUser] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [sdkState, setSdkState] = useState<SpotifyWebPlaybackState | null>(null);
  const [apiPlayback, setApiPlayback] = useState<SpotifyPlaybackApiResponse>({
    isPlaying: false,
  });
  const [volumePct, setVolumePct] = useState(70);
  const progressAnchorRef = useRef({ base: 0, at: Date.now() });
  const [smoothApiProgressMs, setSmoothApiProgressMs] = useState(0);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [currentTrackRating, setCurrentTrackRating] = useState<RatingDetail | null>(null);
  const playlistContextCacheRef = useRef<{ uri: string | null; name: string | null }>({
    uri: null,
    name: null,
  });
  const apiPlaybackRef = useRef(apiPlayback);
  apiPlaybackRef.current = apiPlayback;
  const refreshSdkState = useCallback(async () => {
    try {
      const s = await getCurrentState();
      setSdkState(s);
    } catch {
      setSdkState(null);
    }
  }, []);

  const fetchApiPlayback = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/playback", { cache: "no-store" });
      const circuitHeader = res.headers.get("X-WAM-Circuit");
      const json = (await res.json()) as SpotifyPlaybackApiResponse & {
        error?: string;
      };
      playerLog("API response:", {
        ok: res.ok,
        status: res.status,
        error: json.error,
        circuit: circuitHeader,
        body: json,
      });
      if (!res.ok || typeof json.error === "string") {
        playerLog("API poll skipped state update:", res.status, json.error);
        return;
      }
      setApiPlayback(json as SpotifyPlaybackApiResponse);
    } catch (e) {
      playerLog("API poll failed:", e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSdkState(), fetchApiPlayback()]);
  }, [fetchApiPlayback, refreshSdkState]);

  useEffect(() => {
    const supabase = createClient();

    registerPlaybackTokenProvider(async () => {
      const res = await fetch("/api/spotify/token", { cache: "no-store" });
      if (!res.ok) return null;
      const body = (await res.json()) as { access_token?: string };
      return typeof body.access_token === "string" ? body.access_token : null;
    });

    async function checkSpotifyToken(): Promise<boolean> {
      const res = await fetch("/api/spotify/token", { cache: "no-store" });
      if (res.ok) return true;
      if (res.status !== 401) return false;
      const { error } = await supabase.auth.refreshSession();
      if (error) return false;
      const retry = await fetch("/api/spotify/token", { cache: "no-store" });
      return retry.ok;
    }

    async function syncSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let tokenOk = false;
      if (user) {
        try {
          tokenOk = await checkSpotifyToken();
        } catch {
          tokenOk = false;
        }
      }

      setHasUser(Boolean(user));
      setHasToken(tokenOk);

      if (!user || !tokenOk) {
        disconnectPlayback();
        setPlaybackReady(false);
        setConnectError(null);
        setSdkState(null);
        setApiPlayback({ isPlaying: false });
        return;
      }

      try {
        setConnectError(null);
        await connectPlayback();
        setPlaybackReady(true);
        try {
          const v = await getPlaybackVolume();
          setVolumePct(Math.round(v * 100));
        } catch {
          /* keep default */
        }
        await refreshAll();
      } catch (e) {
        if (e instanceof Error && e.message === "Playback disconnected") {
          return;
        }
        setPlaybackReady(false);
        setConnectError(
          e instanceof Error ? e.message : "Playback unavailable",
        );
        void fetchApiPlayback();
      }
    }

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncSession();
    });

    return () => {
      subscription.unsubscribe();
      unregisterPlaybackTokenProvider();
      disconnectPlayback();
    };
  }, [fetchApiPlayback, refreshAll]);

  const sdkPlaying = Boolean(
    playbackReady &&
      sdkState &&
      sdkState.track_window?.current_track &&
      !sdkState.paused,
  );

  const pollIntervalRef = useRef(0);

  useEffect(() => {
    if (!hasToken || PLAYBACK_POLLING_DISABLED || sdkPlaying) {
      playerLog("Polling inactive:", {
        hasToken,
        pollingDisabled: PLAYBACK_POLLING_DISABLED,
        sdkPlaying,
      });
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      const ms = apiPlaybackPollMs(apiPlaybackRef.current);
      pollIntervalRef.current = ms;
      playerLog("Starting poll timer, interval ms:", ms);
      timeoutId = window.setTimeout(() => {
        void fetchApiPlayback().finally(() => {
          if (!cancelled) scheduleNext();
        });
      }, ms);
    };

    playerLog("Starting playback polling");
    void fetchApiPlayback().finally(() => {
      if (!cancelled) scheduleNext();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [hasToken, fetchApiPlayback, sdkPlaying]);

  useEffect(() => {
    if (!playbackReady) return;
    const id = window.setInterval(() => {
      void refreshSdkState();
    }, 1000);
    return () => window.clearInterval(id);
  }, [playbackReady, refreshSdkState]);

  const useSdk = sdkPlaying;

  const displayApi = useMemo(
    () => (!useSdk && isApiPlaybackWithTrack(apiPlayback) ? apiPlayback : null),
    [apiPlayback, useSdk],
  );

  useEffect(() => {
    if (!displayApi) {
      playlistContextCacheRef.current = { uri: null, name: null };
      return;
    }
    if (displayApi.contextType !== "playlist" || !displayApi.contextUri) {
      playlistContextCacheRef.current = { uri: null, name: null };
      return;
    }
    const name = displayApi.contextName;
    if (typeof name === "string" && name.trim().length > 0) {
      playlistContextCacheRef.current = {
        uri: displayApi.contextUri,
        name: name.trim(),
      };
    }
  }, [displayApi]);

  const displayPlaylistContextName = useMemo(() => {
    if (!displayApi || displayApi.contextType !== "playlist") return null;
    const uri = displayApi.contextUri;
    const fromApi = displayApi.contextName;
    if (typeof fromApi === "string" && fromApi.trim().length > 0) return fromApi.trim();
    if (
      uri &&
      playlistContextCacheRef.current.uri === uri &&
      playlistContextCacheRef.current.name
    ) {
      return playlistContextCacheRef.current.name;
    }
    return null;
  }, [displayApi]);

  const playlistContext = useMemo(() => {
    if (!displayApi || displayApi.contextType !== "playlist") return null;
    const spotifyId = playlistIdFromContextUri(displayApi.contextUri);
    const name =
      (typeof displayApi.contextName === "string" &&
        displayApi.contextName.trim()) ||
      displayPlaylistContextName;
    if (!name || !spotifyId) return null;

    const isWam = Boolean(displayApi.isWamPlaylist);
    const href =
      isWam && displayApi.wamPlaylistId
        ? `/playlists/${displayApi.wamPlaylistId}`
        : `https://open.spotify.com/playlist/${spotifyId}`;

    return { name, href, isWam };
  }, [displayApi, displayPlaylistContextName]);

  const sdkTrack = sdkState?.track_window?.current_track ?? null;

  const nowTrackId = useMemo(() => {
    if (useSdk && sdkTrack?.id) return sdkTrack.id;
    if (displayApi?.trackId) return displayApi.trackId;
    if (sdkTrack?.id) return sdkTrack.id;
    return null;
  }, [useSdk, sdkTrack?.id, displayApi?.trackId]);

  const nowPlayingIsRateableTrack = useMemo(() => {
    if (displayApi?.itemKind === "episode") return false;
    if (sdkTrack?.type === "episode") return false;
    return true;
  }, [displayApi?.itemKind, sdkTrack?.type]);

  useEffect(() => {
    if (!hasUser || !nowTrackId) {
      setCurrentTrackRating(null);
      return;
    }
    const ac = new AbortController();
    void fetch(`/api/ratings?spotify_id=${encodeURIComponent(nowTrackId)}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          rating?: RatingDetail | null;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setCurrentTrackRating(null);
          return;
        }
        setCurrentTrackRating(body.rating ?? null);
      })
      .catch(() => {
        if (!ac.signal.aborted) setCurrentTrackRating(null);
      });
    return () => ac.abort();
  }, [hasUser, nowTrackId]);

  useEffect(() => {
    setRateDialogOpen(false);
  }, [nowTrackId]);

  /** Only show SDK metadata when this browser is actively playing via Web Playback SDK. */
  const showFromSdk = sdkPlaying;
  const volumeFromSdk = playbackReady && Boolean(sdkTrack);

  const hasAnyTrack = sdkPlaying
    ? Boolean(sdkTrack)
    : isApiPlaybackWithTrack(apiPlayback);

  useEffect(() => {
    if (useSdk || !displayApi) return;
    progressAnchorRef.current = {
      base: displayApi.progressMs,
      at: Date.now(),
    };
    setSmoothApiProgressMs(displayApi.progressMs);
  }, [displayApi, useSdk, displayApi?.progressMs, displayApi?.trackId]);

  useEffect(() => {
    if (useSdk || !displayApi?.isPlaying) return;
    const id = window.setInterval(() => {
      const { base, at } = progressAnchorRef.current;
      setSmoothApiProgressMs(base + (Date.now() - at));
    }, 1000);
    return () => window.clearInterval(id);
  }, [displayApi?.isPlaying, displayApi?.trackId, useSdk]);

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

  const playbackSource = sdkPlaying
    ? "sdk"
    : isApiPlaybackWithTrack(apiPlayback)
      ? "api"
      : "none";

  useEffect(() => {
    playerLog("State update:", {
      hasUser,
      hasToken,
      playbackReady,
      connectError,
      pollingDisabled: PLAYBACK_POLLING_DISABLED,
      sdkPlaying,
      sdkTrackName: sdkTrack?.name ?? null,
      sdkPaused: sdkState?.paused ?? null,
      apiPlayback: JSON.stringify(apiPlayback),
      displayApi: displayApi ? displayApi.trackName : null,
      showFromSdk,
      hasAnyTrack,
      source: playbackSource,
    });
  }, [
    hasUser,
    hasToken,
    playbackReady,
    connectError,
    sdkPlaying,
    sdkTrack?.name,
    sdkState?.paused,
    apiPlayback,
    displayApi,
    showFromSdk,
    hasAnyTrack,
    playbackSource,
  ]);

  if (!hasUser) return null;

  const artUrl = showFromSdk
    ? sdkTrack?.album?.images?.[0]?.url ?? null
    : displayApi?.imageUrl || null;

  const trackTitle = showFromSdk
    ? sdkTrack?.name ?? "Nothing playing"
    : displayApi?.trackName ?? "Nothing playing";

  const artistLine = showFromSdk
    ? sdkTrack?.artists?.map((a) => a.name).join(", ") ?? "—"
    : displayApi?.artistName ?? "—";

  const deviceLine = useSdk
    ? "Playing in this browser"
    : displayApi
      ? displayApi.isPlaying
        ? `Playing on ${displayApi.deviceName}`
        : `Paused · ${displayApi.deviceName}`
      : showFromSdk && playbackReady
        ? "Paused · this browser"
        : null;

  const duration = useSdk
    ? sdkState?.duration ?? 0
    : displayApi?.durationMs ?? sdkState?.duration ?? 0;

  const position = useSdk
    ? sdkState?.position ?? 0
    : displayApi
      ? smoothApiProgressMs
      : sdkState?.position ?? 0;

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const paused = useSdk
    ? Boolean(sdkState?.paused ?? true)
    : displayApi
      ? !displayApi.isPlaying
      : Boolean(sdkState?.paused ?? true);

  const canShowRate = Boolean(
    nowTrackId && hasAnyTrack && nowPlayingIsRateableTrack,
  );

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const ms = Math.floor(ratio * duration);
    void seek(ms).then(() => refreshAll());
  };

  const onVolume = (vals: number[]) => {
    const v = vals[0] ?? 70;
    setVolumePct(v);
    if (volumeFromSdk) {
      void setVolume(v / 100).catch(() => {
        /* SDK not connected — slider is visual only */
      });
    }
  };

  playerLog("Rendering:", {
    showPlayer: hasToken,
    trackName: hasAnyTrack ? trackTitle : "Nothing playing",
    isPlaying: sdkPlaying
      ? !sdkState?.paused
      : isApiPlaybackWithTrack(apiPlayback)
        ? apiPlayback.isPlaying
        : false,
    source: playbackSource,
  });

  if (!hasToken) {
    return (
      <div
        className={cn(
          "fixed right-0 bottom-0 left-0 z-40 border-t border-white/10 bg-black/95 text-white backdrop-blur-xl",
        )}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-3">
          <p className="text-center text-xs text-white/55 sm:text-left">
            Log out and sign in again to enable in-browser playback (Premium +
            new scopes).
          </p>
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
            <p className="truncate text-sm font-medium text-white">
              {hasAnyTrack ? trackTitle : "Nothing playing"}
            </p>
            <p className="truncate text-xs text-white/50">{hasAnyTrack ? artistLine : "—"}</p>
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
                    : "Rate this track"
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
              className="h-full rounded-full bg-wam transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/30">
            <span>{formatMs(position)}</span>
            <span>{formatMs(duration)}</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-8 px-4 pb-3 pt-2">
          <button
            type="button"
            aria-label="Previous"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => void previous().then(() => refreshAll())}
          >
            <SkipBack className="size-5" />
          </button>
          <button
            type="button"
            aria-label={paused ? "Play" : "Pause"}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-wam text-black shadow-md transition-transform hover:scale-[1.03] hover:bg-wam/90"
            onClick={() => void (paused ? resume() : pause()).then(() => refreshAll())}
          >
            {paused ? (
              <Play className="size-[18px] fill-current" />
            ) : (
              <Pause className="size-[18px] fill-current" />
            )}
          </button>
          <button
            type="button"
            aria-label="Next"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => void next().then(() => refreshAll())}
          >
            <SkipForward className="size-5" />
          </button>
        </div>
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden w-full max-w-6xl flex-col gap-3 px-3 py-3 md:flex md:h-20 md:flex-row md:items-stretch md:gap-0 md:px-4 md:py-0">
        <div className="order-1 flex min-h-0 min-w-0 shrink-0 flex-1 basis-0 items-start gap-2 md:order-none md:items-center md:gap-3 md:pr-3">
          <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/10 md:size-12 md:rounded-lg">
            {artUrl ? (
              <Image
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
            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white md:truncate md:text-sm">
              {hasAnyTrack ? trackTitle : "Nothing playing"}
            </p>
            <p className="truncate text-[11px] text-white/50 md:text-xs">
              {hasAnyTrack ? artistLine : "—"}
            </p>
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
              onClick={() => void previous().then(() => refreshAll())}
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              aria-label={paused ? "Play" : "Pause"}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wam text-black shadow-md transition-transform hover:scale-[1.03] hover:bg-wam/90"
              onClick={() => void (paused ? resume() : pause()).then(() => refreshAll())}
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
              onClick={() => void next().then(() => refreshAll())}
            >
              <SkipForward className="size-4" />
            </button>
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
                  className="h-full rounded-full bg-wam transition-[width]"
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
                  : "Rate this track"
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
