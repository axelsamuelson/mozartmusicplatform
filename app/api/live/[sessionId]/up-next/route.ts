import { NextResponse } from "next/server";

import { loadUpNextTracks } from "@/lib/live/jamsUpNext";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { usesJamsAdvance } from "@/lib/live/sessionMode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await loadActiveSession(supabase, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!usesJamsAdvance(session)) {
    return NextResponse.json(
      { error: "WAM Jams is not enabled for this session" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const items = await loadUpNextTracks(admin, sessionId);
    return NextResponse.json({ items, queue_mode: session.queue_mode ?? "transparent" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load up next";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
