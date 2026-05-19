"use client";

import { useEffect, useRef, useState } from "react";

import { subscribeLiveSessionRealtime } from "@/lib/live/sessionRealtimeHub";
import type { LivePresenceMember, LiveSessionRow } from "@/lib/types/live";

export type { LivePresenceMember };

export function useLiveSessionChannel(options: {
  sessionId: string | null;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  /** Omit to leave has_rated unchanged on the presence channel (e.g. host dialog). */
  hasRated?: boolean;
  enabled?: boolean;
  onRatingsChange?: () => void;
  onQueueChange?: () => void;
  onScoresChange?: () => void;
  onBufferChange?: () => void;
  onSessionUpdate?: (session: LiveSessionRow) => void;
  onSessionEnded?: () => void;
}): { participants: LivePresenceMember[]; connected: boolean } {
  const {
    sessionId,
    userId,
    displayName,
    avatarUrl,
    hasRated,
    enabled = true,
    onRatingsChange,
    onQueueChange,
    onScoresChange,
    onBufferChange,
    onSessionUpdate,
    onSessionEnded,
  } = options;

  const [participants, setParticipants] = useState<LivePresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  const subscriptionRef = useRef<ReturnType<typeof subscribeLiveSessionRealtime> | null>(
    null,
  );
  const onRatingsChangeRef = useRef(onRatingsChange);
  const onQueueChangeRef = useRef(onQueueChange);
  const onScoresChangeRef = useRef(onScoresChange);
  const onBufferChangeRef = useRef(onBufferChange);
  const onSessionUpdateRef = useRef(onSessionUpdate);
  const onSessionEndedRef = useRef(onSessionEnded);
  onRatingsChangeRef.current = onRatingsChange;
  onQueueChangeRef.current = onQueueChange;
  onScoresChangeRef.current = onScoresChange;
  onBufferChangeRef.current = onBufferChange;
  onSessionUpdateRef.current = onSessionUpdate;
  onSessionEndedRef.current = onSessionEnded;

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
      meta: {
        displayName,
        avatarUrl,
        ...(hasRated !== undefined ? { hasRated } : {}),
      },
      onParticipants: setParticipants,
      onConnected: setConnected,
      onRatingsChange: () => onRatingsChangeRef.current?.(),
      onQueueChange: () => onQueueChangeRef.current?.(),
      onScoresChange: () => onScoresChangeRef.current?.(),
      onBufferChange: () => onBufferChangeRef.current?.(),
      onSessionUpdate: (session) => onSessionUpdateRef.current?.(session),
      onSessionEnded: () => onSessionEndedRef.current?.(),
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
      ...(hasRated !== undefined ? { hasRated } : {}),
    });
  }, [displayName, avatarUrl, hasRated]);

  return { participants, connected };
}
