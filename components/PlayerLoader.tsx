"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

const Player = dynamic(
  () => import("@/components/Player").then((m) => ({ default: m.Player })),
  { ssr: false },
);

/** Mount Player only when authenticated and not on the public landing page. */
export function PlayerLoader() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (pathname === "/") return null;
  if (!session?.user) return null;

  return <Player />;
}
