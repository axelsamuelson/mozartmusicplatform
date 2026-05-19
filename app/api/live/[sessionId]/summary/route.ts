import { NextResponse } from "next/server";

import { generateSessionSummary } from "@/lib/live/sessionSummary";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("live_session_summary")
    .select("payload, generated_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!data) return NextResponse.json({ summary: null });
  return NextResponse.json({ summary: data.payload, generatedAt: data.generated_at });
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await loadActiveSession(supabase, sessionId);
  const ended = session?.ended_at;
  if (!session && !ended) {
    const { data: endedRow } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (!endedRow?.ended_at) {
      return NextResponse.json({ error: "Session not ended" }, { status: 400 });
    }
  }

  const { data: row } = await supabase
    .from("live_sessions")
    .select("created_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!row?.ended_at) {
    return NextResponse.json({ error: "Session not ended" }, { status: 400 });
  }

  const admin = createAdminClient();
  const payload = await generateSessionSummary(
    admin,
    sessionId,
    row.created_at as string,
    row.ended_at as string,
  );

  const { data: saved, error } = await admin
    .from("live_session_summary")
    .upsert(
      { session_id: sessionId, payload, generated_at: new Date().toISOString() },
      { onConflict: "session_id" },
    )
    .select("payload")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summary: saved?.payload ?? payload });
}
