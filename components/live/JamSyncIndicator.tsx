"use client";

import type { JamOverlaySyncStatus } from "@/lib/live/useJamOverlaySync";

export type JamSyncIndicatorProps = {
  status: JamOverlaySyncStatus;
};

export function JamSyncIndicator({ status }: JamSyncIndicatorProps) {
  if (status === "synced") {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs text-wam/70">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-wam" />
        In sync with Spotify Jam
      </div>
    );
  }

  if (status === "out_of_sync") {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs text-orange-400/80">
        <div className="h-1.5 w-1.5 rounded-full bg-orange-400" />
        Out of sync — join the Spotify Jam to listen along
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
      <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
      Checking sync…
    </div>
  );
}
