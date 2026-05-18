"use client";

import { useEffect, useRef, useState } from "react";

import { subscribeLiveSessionRealtime } from "@/lib/live/sessionRealtimeHub";
import type { LivePresenceMember } from "@/lib/types/live";

export type { LivePresenceMember };

export function useLiveSessionChannel(options: {
  sessionId: string | null;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  hasRated: boolean;
  enabled?: boolean;
  onRatingsChange?: () => void;
}): { participants: LivePresenceMember[]; connected: boolean } {
  const {
    sessionId,
    userId,
    displayName,
    avatarUrl,
    hasRated,
    enabled = true,
    onRatingsChange,
  } = options;

  const [participants, setParticipants] = useState<LivePresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  const subscriptionRef = useRef<ReturnType<typeof subscribeLiveSessionRealtime> | null>(
    null,
  );
  const onRatingsChangeRef = useRef(onRatingsChange);
  onRatingsChangeRef.current = onRatingsChange;

  useEffect(() => {
    if (!enabled || !sessionId || !userId) {
      setParticipants([]);
      setConnected(false);
      subscriptionRef.current?.release();
      subscriptionRef.current = null;
      return;
    }

    const sub = subscribeLiveSessionRealtime({
      sessionId,
      userId,
      meta: { displayName, avatarUrl, hasRated },
      onParticipants: setParticipants,
      onConnected: setConnected,
      onRatingsChange: () => onRatingsChangeRef.current?.(),
    });
    subscriptionRef.current = sub;

    return () => {
      sub.release();
      subscriptionRef.current = null;
    };
  }, [enabled, sessionId, userId]);

  useEffect(() => {
    subscriptionRef.current?.updatePresence({
      displayName,
      avatarUrl,
      hasRated,
    });
  }, [displayName, avatarUrl, hasRated]);

  return { participants, connected };
}
