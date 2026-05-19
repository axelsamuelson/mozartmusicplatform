import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";

export async function loadActiveSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<LiveSessionRow | null> {
  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as LiveSessionRow) : null;
}

export const LIVE_SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
