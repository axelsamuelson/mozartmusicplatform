"use client";

import { useEffect, useMemo, useState } from "react";

import type { EnsuredTestUser } from "@/lib/dev/ensureLiveTestUsers";
import { isLiveSimulateEnabled } from "@/lib/dev/liveSimulateGate";
import { mergeTestParticipants } from "@/lib/dev/mergeTestParticipants";
import { MIN_LIVE_TEST_USERS } from "@/lib/dev/liveTestPersonas";
import type { LivePresenceMember, LiveRatingRow } from "@/lib/types/live";

export function useTestParticipants(
  realtime: LivePresenceMember[],
  ratingsForCurrentTrack: LiveRatingRow[],
  sessionIsSimulated: boolean,
): {
  displayParticipants: LivePresenceMember[];
} {
  const simulateEnv = isLiveSimulateEnabled();
  const [testUsers, setTestUsers] = useState<EnsuredTestUser[]>([]);

  useEffect(() => {
    if (!simulateEnv || !sessionIsSimulated) return;
    void fetch("/api/dev/live/test-users", { method: "POST" })
      .then((res) => res.json())
      .then((body: { users?: EnsuredTestUser[] }) => {
        if (body.users?.length) setTestUsers(body.users);
      })
      .catch(() => {});
  }, [simulateEnv, sessionIsSimulated]);

  const displayParticipants = useMemo(() => {
    if (!simulateEnv || !sessionIsSimulated) return realtime;
    return mergeTestParticipants(realtime, testUsers, ratingsForCurrentTrack, {
      enabled: true,
      minCount: MIN_LIVE_TEST_USERS,
    });
  }, [simulateEnv, sessionIsSimulated, realtime, testUsers, ratingsForCurrentTrack]);

  return { displayParticipants };
}
