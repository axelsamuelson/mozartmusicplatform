"use client";

import { useEffect, useState } from "react";

import { liveDisplayName } from "@/lib/live/userDisplay";
import { createClient } from "@/lib/supabase/client";

export function useLiveSessionDisplayName(
  sessionId: string | null,
  anonymousMode: boolean,
): {
  displayName: string;
  isAnonymous: boolean;
  loading: boolean;
} {
  const [displayName, setDisplayName] = useState("User");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setDisplayName("User");
      setIsAnonymous(false);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      if (!anonymousMode) {
        setDisplayName(liveDisplayName(user));
        setIsAnonymous(false);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/live/${sessionId}/alias`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const body = (await res.json()) as {
          error?: string;
          display_name?: string;
          is_anonymous?: boolean;
        };
        if (!res.ok) throw new Error(body.error || "Could not load alias");
        setDisplayName(body.display_name ?? liveDisplayName(user));
        setIsAnonymous(Boolean(body.is_anonymous));
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setDisplayName(liveDisplayName(user));
        setIsAnonymous(false);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => ac.abort();
  }, [sessionId, anonymousMode]);

  return { displayName, isAnonymous, loading };
}
