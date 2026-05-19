"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { LivePresenceMember } from "@/lib/types/live";
import type { LiveSessionRow } from "@/lib/types/live";

const TAKEOVER_MS = 5 * 60 * 1000;

export type WamJamsControllerProps = {
  session: LiveSessionRow;
  userId: string | null;
  participants: LivePresenceMember[];
  onSessionUpdate?: (session: LiveSessionRow) => void;
};

export function WamJamsController({
  session,
  userId,
  participants,
  onSessionUpdate,
}: WamJamsControllerProps) {
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const takeoverSentRef = useRef(false);
  const disconnectSentRef = useRef(false);

  const isCoHost = Boolean(userId && session.co_host_user_id === userId);
  const isHost = Boolean(userId && session.host_user_id === userId);

  const hostPresent = participants.some((p) => p.userId === session.host_user_id);

  const markHostDisconnected = useCallback(async () => {
    if (!isHost || disconnectSentRef.current) return;
    disconnectSentRef.current = true;
    const at = new Date().toISOString();
    await fetch(`/api/live/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host_disconnected_at: at }),
      keepalive: true,
    }).catch(() => undefined);
  }, [isHost, session.id]);

  useEffect(() => {
    if (!isHost) return;
    const onUnload = () => {
      const blob = new Blob(
        [JSON.stringify({ host_disconnected_at: new Date().toISOString() })],
        { type: "application/json" },
      );
      navigator.sendBeacon(`/api/live/${session.id}/host-disconnect`, blob);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [isHost, session.id]);

  useEffect(() => {
    if (!session.jams_enabled && !session.wam_controls_playback) return;
    if (hostPresent) {
      disconnectSentRef.current = false;
      return;
    }
    if (!session.host_disconnected_at) {
      void markHostDisconnected();
    }
  }, [
    hostPresent,
    markHostDisconnected,
    session.host_disconnected_at,
    session.jams_enabled,
    session.wam_controls_playback,
  ]);

  useEffect(() => {
    if (!session.host_disconnected_at) {
      setCountdownMs(null);
      takeoverSentRef.current = false;
      return;
    }

    const disconnectedAt = new Date(session.host_disconnected_at).getTime();
    const tick = () => {
      const remaining = TAKEOVER_MS - (Date.now() - disconnectedAt);
      setCountdownMs(Math.max(0, remaining));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session.host_disconnected_at]);

  useEffect(() => {
    if (countdownMs !== 0 || takeoverSentRef.current) return;
    if (!isCoHost || !session.co_host_user_id) return;

    takeoverSentRef.current = true;
    void (async () => {
      const res = await fetch(`/api/live/${session.id}/takeover`, { method: "POST" });
      const body = (await res.json()) as { session?: LiveSessionRow; error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Takeover failed");
        return;
      }
      toast.success("You are now the host");
      if (body.session) onSessionUpdate?.(body.session);
    })();
  }, [countdownMs, isCoHost, onSessionUpdate, session.co_host_user_id, session.id]);

  if (!session.host_disconnected_at || countdownMs === null) return null;

  const mins = Math.floor(countdownMs / 60000);
  const secs = Math.floor((countdownMs % 60000) / 1000);

  if (isCoHost) {
    return (
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
        Host disconnected — taking over in {mins}:{secs.toString().padStart(2, "0")}…
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-sm text-white/60">
      Host is away — playback paused. Ask host to return or end the session.
    </p>
  );
}
