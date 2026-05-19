import { NextResponse } from "next/server";

import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function isHostOrCoHost(
  session: { host_user_id: string; co_host_user_id?: string | null },
  userId: string,
): boolean {
  return session.host_user_id === userId || session.co_host_user_id === userId;
}

export async function POST(
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
  if (!isHostOrCoHost(session, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const endedAt = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("live_sessions")
    .update({ is_active: false, ended_at: endedAt })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Failed to end session" }, { status: 500 });
  }

  return NextResponse.json({ session: updated, summaryReady: true, ended: true });
}
