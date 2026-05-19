import { type NextRequest, NextResponse } from "next/server";

import { finalizeTrackScores } from "@/lib/live/jukeboxScores";
import { loadSessionScores } from "@/lib/live/jukeboxQueue";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { sessionHasScores } from "@/lib/live/sessionMode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LiveQueueRow } from "@/lib/types/live";

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

  try {
    const scores = await loadSessionScores(supabase, sessionId);
    return NextResponse.json({ scores, session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load scores";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = {
  queue_id?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: PostBody = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
  if (!sessionHasScores(session)) {
    return NextResponse.json(
      { error: "Scoring is not enabled for this session mode" },
      { status: 400 },
    );
  }

  const queueId = body.queue_id ?? session.current_queue_id;
  if (!queueId) {
    return NextResponse.json({ error: "No queue item to score" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: queueItem, error: fetchErr } = await admin
    .from("live_queue")
    .select("*")
    .eq("id", queueId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!queueItem) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  const isHost = session.host_user_id === user.id;
  const isOwner = (queueItem as LiveQueueRow).user_id === user.id;
  if (!isHost && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await finalizeTrackScores(
      admin,
      session,
      queueItem as LiveQueueRow,
    );
    const scores = await loadSessionScores(admin, sessionId);
    return NextResponse.json({ ...result, scores });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update scores";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
