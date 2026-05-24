"use client";

import { useCallback, useEffect, useState } from "react";

import { collectClientAuditFromBridge } from "@/lib/audit/auditBridge";
import { getLastPlaybackCircuitHeader } from "@/lib/audit/playbackHints";
import { getActiveLiveSession } from "@/lib/live/activeSessionStorage";
import { getKnownPollLeader, getPlaybackTabId } from "@/lib/playback/pollLeader";
import { isPlaybackDeviceReady } from "@/lib/spotify/player";
import type { AuditClientSnapshot, WamAuditReport } from "@/lib/audit/types";
import type { PlaybackState } from "@/lib/playback/types";

export type AuditCollectorInput = {
  hasUser: boolean;
  hasToken: boolean;
  playbackReady: boolean;
  connectError: string | null;
  skipApiPoll: boolean;
  hostSyncEnabled: boolean;
  queueAutoAdvanceEnabled: boolean;
  playback: PlaybackState | null;
  circuitOpenClientHint?: boolean;
  liveChannelConnected?: boolean | null;
  liveParticipantCount?: number | null;
};

export function buildClientAuditSnapshot(
  input: AuditCollectorInput,
): AuditClientSnapshot {
  const active = getActiveLiveSession();
  const p = input.playback;

  return {
    generatedAt: new Date().toISOString(),
    tabId: getPlaybackTabId(),
    tabVisible:
      typeof document !== "undefined"
        ? document.visibilityState === "visible"
        : true,
    isPollLeader: getKnownPollLeader(),
    hasUser: input.hasUser,
    hasToken: input.hasToken,
    playbackReady: input.playbackReady,
    connectError: input.connectError,
    sdkDeviceReady: isPlaybackDeviceReady(),
    skipApiPoll: input.skipApiPoll,
    hostSyncEnabled: input.hostSyncEnabled,
    queueAutoAdvanceEnabled: input.queueAutoAdvanceEnabled,
    circuitOpenClientHint:
      input.circuitOpenClientHint ??
      getLastPlaybackCircuitHeader() === "open",
    playback: p
      ? {
          source: p.source,
          trackId: p.trackId,
          isPlaying: p.isPlaying,
          progressMs: p.progressMsAtSync,
          durationMs: p.durationMs,
          deviceName: p.deviceName,
          syncedAt: p.syncedAt,
          contextType: p.contextType,
        }
      : null,
    activeLiveSession:
      active?.hostUserId != null
        ? {
            sessionId: active.sessionId,
            code: active.code,
            hostUserId: active.hostUserId,
            wamControlsPlayback: active.wamControlsPlayback ?? false,
            jamsEnabled: active.jamsEnabled ?? false,
            jukeboxEnabled: active.jukeboxEnabled ?? false,
          }
        : null,
    liveChannelConnected: input.liveChannelConnected ?? null,
    liveParticipantCount: input.liveParticipantCount ?? null,
  };
}

export function useAuditReport(refreshMs = 5_000): {
  report: WamAuditReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [report, setReport] = useState<WamAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = collectClientAuditFromBridge();
      const active = getActiveLiveSession();
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client,
          activeLiveSession:
            active?.hostUserId != null
              ? {
                  sessionId: active.sessionId,
                  code: active.code,
                  hostUserId: active.hostUserId,
                  wamControlsPlayback: active.wamControlsPlayback ?? false,
                  jamsEnabled: active.jamsEnabled ?? false,
                  jukeboxEnabled: active.jukeboxEnabled ?? false,
                }
              : null,
        }),
        cache: "no-store",
      });
      const body = (await res.json()) as WamAuditReport & { error?: string };
      if (!res.ok) throw new Error(body.error || res.statusText);
      setReport(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  return { report, loading, error, refresh };
}
