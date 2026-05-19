import { NextResponse } from "next/server";

import { persistHostProviderToken } from "@/lib/live/getHostToken";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import { createClient } from "@/lib/supabase/server";

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
  if (session.co_host_user_id !== user.id) {
    return NextResponse.json({ error: "Only co-host can take over" }, { status: 403 });
  }

  let hostToken: string;
  try {
    hostToken = await requireProviderAccessToken(supabase);
  } catch {
    return NextResponse.json({ error: "Spotify token required" }, { status: 401 });
  }

  const { data: updated, error } = await supabase
    .from("live_sessions")
    .update({
      host_user_id: user.id,
      co_host_user_id: session.host_user_id,
      host_disconnected_at: null,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Takeover failed" }, { status: 500 });
  }

  await persistHostProviderToken(supabase, sessionId, hostToken);

  return NextResponse.json({ session: updated, ok: true });
}
