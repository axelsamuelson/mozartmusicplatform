"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import { interpolatedProgressMs } from "@/lib/live/mapPlaybackToSession";
import type { LiveSessionRow } from "@/lib/types/live";
import { glassCard } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export type LiveNowPlayingProps = {
  session: LiveSessionRow;
  className?: string;
};

export function LiveNowPlaying({ session, className }: LiveNowPlayingProps) {
  const [smoothProgress, setSmoothProgress] = useState(() =>
    interpolatedProgressMs(session),
  );

  useEffect(() => {
    const tick = () => setSmoothProgress(interpolatedProgressMs(session));
    tick();
    if (!session.is_playing) return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [
    session.is_playing,
    session.progress_ms,
    session.duration_ms,
    session.playback_updated_at,
    session.spotify_track_id,
  ]);

  const duration = session.duration_ms ?? 0;
  const progressPct =
    duration > 0 ? Math.min(100, (smoothProgress / duration) * 100) : 0;
  const hasTrack = Boolean(session.spotify_track_id && session.track_name);

  return (
    <article className={cn(glassCard, "flex flex-col items-center gap-4 text-center", className)}>
      <LiveArt session={session} hasTrack={hasTrack} />

      <div className="w-full min-w-0">
        {hasTrack ? (
          <>
            <h1 className="truncate text-lg font-semibold text-white">
              {session.track_name}
            </h1>
            <p className="truncate text-sm text-white/50">{session.artist_name ?? "—"}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-white/70">Nothing playing</h1>
            <p className="text-sm text-white/40">Waiting for the host to start a track…</p>
          </>
        )}

        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/45">
          {session.is_playing ? (
            <Play className="size-3 fill-wam text-wam" aria-hidden />
          ) : (
            <Pause className="size-3 text-white/50" aria-hidden />
          )}
          <span>
            {session.is_playing ? "Playing" : "Paused"}
            {session.device_name ? ` · ${session.device_name}` : ""}
          </span>
        </p>
      </div>

      {hasTrack && duration > 0 ? (
        <div className="w-full px-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <ProgressFill pct={progressPct} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/35">
            <span>{formatMs(smoothProgress)}</span>
            <span>{formatMs(duration)}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function LiveArt({ session, hasTrack }: { session: LiveSessionRow; hasTrack: boolean }) {
  return (
    <div className="relative size-32 overflow-hidden rounded-xl border border-white/10 bg-white/10 shadow-lg">
      {hasTrack && session.image_url ? (
        <Image
          src={session.image_url}
          alt=""
          fill
          className="object-cover"
          sizes="128px"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-3xl text-white/25" aria-hidden>
          ♪
        </div>
      )}
    </div>
  );
}

function ProgressFill({ pct }: { pct: number }) {
  return (
    <div
      className="h-full rounded-full bg-wam transition-[width] duration-300"
      style={{ width: `${pct}%` }}
    />
  );
}
