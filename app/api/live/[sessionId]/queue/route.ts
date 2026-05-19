import { type NextRequest, NextResponse } from "next/server";

import {
  loadPendingQueue,
  loadPlayedQueue,
  loadSessionScores,
  recomputeQueuePositions,
} from "@/lib/live/jukeboxQueue";
import { MAX_QUEUE_TRACKS_PER_USER } from "@/lib/live/jukeboxPriority";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { resolveLiveDisplayName } from "@/lib/live/resolveLiveDisplayName";
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
    const queue = await loadPendingQueue(supabase, sessionId);
    const myCount = queue.filter((q) => q.user_id === user.id).length;
    return NextResponse.json({
      queue,
      session,
      myQueueCount: myCount,
      maxPerUser: MAX_QUEUE_TRACKS_PER_USER,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load queue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PostBody = {
  spotify_track_id?: string;
  track_name?: string;
  artist_name?: string | null;
  image_url?: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const spotify_track_id =
    typeof body.spotify_track_id === "string" ? body.spotify_track_id.trim() : "";
  const track_name = typeof body.track_name === "string" ? body.track_name.trim() : "";
  if (!spotify_track_id || !track_name) {
    return NextResponse.json(
      { error: "spotify_track_id and track_name are required" },
      { status: 400 },
    );
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
  if (!session.jukebox_enabled) {
    return NextResponse.json(
      { error: "Jukebox mode is not enabled for this session" },
      { status: 400 },
    );
  }

  const pending = await loadPendingQueue(supabase, sessionId);
  const myPending = pending.filter((q) => q.user_id === user.id);
  if (myPending.length >= MAX_QUEUE_TRACKS_PER_USER) {
    return NextResponse.json(
      { error: `You can only have ${MAX_QUEUE_TRACKS_PER_USER} tracks in the queue` },
      { status: 400 },
    );
  }

  const duplicate = pending.some(
    (q) => q.user_id === user.id && q.spotify_track_id === spotify_track_id,
  );
  if (duplicate) {
    return NextResponse.json({ error: "This track is already in your queue" }, { status: 400 });
  }

  let display_name: string;
  try {
    const resolved = await resolveLiveDisplayName(supabase, session, user);
    display_name = resolved.displayName;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not resolve display name";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const artist_name =
    typeof body.artist_name === "string" ? body.artist_name : body.artist_name ?? null;
  const image_url =
    typeof body.image_url === "string" ? body.image_url : body.image_url ?? null;

  const { data: inserted, error: insertErr } = await supabase
    .from("live_queue")
    .insert({
      session_id: sessionId,
      user_id: user.id,
      display_name,
      spotify_track_id,
      track_name,
      artist_name,
      image_url,
      position: pending.length + 1,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to add track" },
      { status: 500 },
    );
  }

  try {
    const admin = createAdminClient();
    await admin.from("live_scores").upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        display_name,
        points: 0,
        tracks_played: 0,
        avg_score: null,
      },
      { onConflict: "session_id,user_id", ignoreDuplicates: true },
    );
    await recomputeQueuePositions(admin, session);
    const queue = await loadPendingQueue(admin, sessionId);
    const myCount = queue.filter((q) => q.user_id === user.id).length;
    return NextResponse.json({
      item: inserted as LiveQueueRow,
      queue,
      myQueueCount: myCount,
      maxPerUser: MAX_QUEUE_TRACKS_PER_USER,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to order queue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const trackId = request.nextUrl.searchParams.get("trackId")?.trim();
  if (!trackId) {
    return NextResponse.json({ error: "trackId query param is required" }, { status: 400 });
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
  if (!session.jukebox_enabled) {
    return NextResponse.json({ error: "Jukebox mode is not enabled" }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("live_queue")
    .select("*")
    .eq("session_id", sessionId)
    .eq("id", trackId)
    .eq("user_id", user.id)
    .is("played_at", null)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json(
      { error: "Queue item not found or already played" },
      { status: 404 },
    );
  }

  if (session.current_queue_id === trackId) {
    return NextResponse.json(
      { error: "Cannot remove the track that is currently playing" },
      { status: 400 },
    );
  }

  const { error: delErr } = await supabase.from("live_queue").delete().eq("id", trackId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    await recomputeQueuePositions(admin, session);
    const queue = await loadPendingQueue(admin, sessionId);
    return NextResponse.json({ queue });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to reorder queue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
