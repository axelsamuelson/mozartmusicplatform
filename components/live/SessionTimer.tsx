"use client";

import { useEffect, useState } from "react";

import type { LiveSessionRow } from "@/lib/types/live";
import { cn } from "@/lib/utils";

export function SessionTimer({
  session,
  onExpire,
}: {
  session: LiveSessionRow;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const started = new Date(session.created_at).getTime();
  const elapsedMs = now - started;

  const durationMs = session.duration_minutes
    ? session.duration_minutes * 60_000
    : null;
  const remainingMs =
    durationMs != null ? Math.max(0, durationMs - elapsedMs) : null;

  useEffect(() => {
    if (remainingMs === 0) onExpire?.();
  }, [remainingMs, onExpire]);

  if (durationMs != null && remainingMs != null) {
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    const urgent = remainingMs <= 60_000;
    const warn = remainingMs <= 5 * 60_000;

    return (
      <p
        className={cn(
          "text-xs tabular-nums",
          urgent && "animate-pulse text-red-400",
          !urgent && warn && "text-amber-400",
          !urgent && !warn && "text-white/45",
        )}
      >
        Session ends in {mins}:{secs.toString().padStart(2, "0")}
      </p>
    );
  }

  const em = Math.floor(elapsedMs / 60000);
  const es = Math.floor((elapsedMs % 60000) / 1000);
  return (
    <p className="text-xs text-white/45 tabular-nums">
      Session running — {em}:{es.toString().padStart(2, "0")}
    </p>
  );
}
