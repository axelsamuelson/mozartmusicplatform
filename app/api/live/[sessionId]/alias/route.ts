import { NextResponse } from "next/server";

import { resolveLiveDisplayName } from "@/lib/live/resolveLiveDisplayName";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const resolved = await resolveLiveDisplayName(
      supabase,
      data as LiveSessionRow,
      user,
    );
    return NextResponse.json({
      display_name: resolved.displayName,
      is_anonymous: resolved.isAnonymous,
      anonymous_mode: Boolean((data as LiveSessionRow).anonymous_mode),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not resolve display name";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
