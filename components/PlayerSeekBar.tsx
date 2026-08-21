"use client";

import { useEffect, useRef, useState } from "react";

import { getCurrentProgressMs } from "@/lib/playback/progress";
import type { PlaybackState } from "@/lib/playback/types";
import { cn } from "@/lib/utils";

const DISPLAY_PROGRESS_MIN_INTERVAL_MS = 250;

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PlayerSeekBar({
  playback,
  onSeek,
  compact,
  className,
}: {
  playback: PlaybackState | null;
  onSeek: (ms: number) => void;
  compact?: boolean;
  className?: string;
}) {
  const [position, setPosition] = useState(0);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const duration = playback?.durationMs ?? 0;

  useEffect(() => {
    const current = playbackRef.current;
    if (!current?.trackId) {
      setPosition(0);
      return;
    }
    setPosition(getCurrentProgressMs(current));
    if (!current.isPlaying) return;

    let raf = 0;
    let lastUiUpdate = 0;
    const tick = () => {
      const state = playbackRef.current;
      if (!state?.isPlaying) return;
      const now = Date.now();
      if (now - lastUiUpdate >= DISPLAY_PROGRESS_MIN_INTERVAL_MS) {
        lastUiUpdate = now;
        setPosition(getCurrentProgressMs(state));
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

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const onSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const ms = Math.floor(ratio * duration);
    setPosition(ms);
    onSeek(ms);
  };

  if (compact) {
    // Full-bleed top rail: tall hit target, thin visual track, no time labels
    // (saves a full row on small phones).
    return (
      <div
        className={cn(
          "relative flex h-4 w-full cursor-pointer items-end",
          className,
        )}
        onClick={onSeekBarClick}
        role="slider"
        tabIndex={0}
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatMs(position)} of ${formatMs(duration)}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.preventDefault();
        }}
      >
        <div className="h-0.5 w-full bg-white/10">
          <div
            className="h-full bg-wam"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
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
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
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
  );
}
