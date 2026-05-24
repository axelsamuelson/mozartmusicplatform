"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { isLiveSimulateEnabled } from "@/lib/dev/liveSimulateGate";
import type { LiveSessionRow } from "@/lib/types/live";
import { cn } from "@/lib/utils";

type Props = {
  session: LiveSessionRow;
  isHost: boolean;
  onSessionUpdate: (next: LiveSessionRow) => void;
  onRatingsSeeded?: () => void;
  className?: string;
};

export function LiveSimulatePanel({
  session,
  isHost,
  onSessionUpdate,
  onRatingsSeeded,
  className,
}: Props) {
  const enabled = isLiveSimulateEnabled();
  const isSimulated = session.device_name === "[simulated]";
  const [busy, setBusy] = useState(false);

  const patchPlayback = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/dev/live/${session.id}/playback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          error?: string;
          session?: LiveSessionRow;
          ratings?: { insertedCount: number };
        };
        if (!res.ok) throw new Error(data.error || res.statusText);
        if (data.session) onSessionUpdate(data.session);
        if (data.ratings?.insertedCount) onRatingsSeeded?.();
      } finally {
        setBusy(false);
      }
    },
    [session.id, onSessionUpdate, onRatingsSeeded],
  );

  if (!enabled || !isSimulated) return null;

  if (!isHost) {
    return (
      <p className={cn("text-center text-xs text-white/40", className)}>
        Test session — host controls the track
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        className,
      )}
    >
      <Button
        type="button"
        size="sm"
        disabled={busy}
        className="rounded-full bg-wam px-4 text-black hover:bg-wam/90"
        onClick={() => void patchPlayback({ advance_track: true })}
      >
        Next track
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        className="rounded-full border-white/20 px-4 text-white/80"
        onClick={() =>
          void patchPlayback({ is_playing: !session.is_playing })
        }
      >
        {session.is_playing ? "Pause" : "Play"}
      </Button>
    </div>
  );
}
