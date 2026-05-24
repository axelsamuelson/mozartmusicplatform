import { type NextRequest, NextResponse } from "next/server";

import { devLiveApiAllowed } from "@/lib/dev/liveSimulateGate";
import { seedLiveTestRatings } from "@/lib/dev/seedLiveTestRatings";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PostBody = {
  scores?: number[];
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json({ error: "Dev live API disabled" }, { status: 403 });
  }

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

  const { data: session, error: loadErr } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const row = session as LiveSessionRow;
  if (row.host_user_id !== user.id) {
    return NextResponse.json({ error: "Host only" }, { status: 403 });
  }

  const trackId = row.spotify_track_id;
  if (!trackId) {
    return NextResponse.json(
      { error: "No track on session — set playback first" },
      { status: 400 },
    );
  }

  let body: PostBody = {};
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }

  try {
    const result = await seedLiveTestRatings(sessionId, trackId, body.scores);
    return NextResponse.json({ trackId, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Seed failed" },
      { status: 500 },
    );
  }
}
