import { NextResponse } from "next/server";

import { finalizeTrackScores } from "@/lib/live/jukeboxScores";
import {
  loadPendingQueue,
  pickAndApplyNextTrack,
} from "@/lib/live/jukeboxQueue";
import { isLiveSessionFeaturesEnabled } from "@/lib/live/liveSessionFeatures";
import {
  getEffectiveLiveSessionMode,
  sessionHasScores,
} from "@/lib/live/sessionMode";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LiveQueueRow } from "@/lib/types/live";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!LIVE_SESSION_UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  if (!isLiveSessionFeaturesEnabled()) {
    return NextResponse.json(
      { error: "Live queue is disabled" },
      { status: 403 },
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
  if (session.host_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const mode = getEffectiveLiveSessionMode(session);
  if (mode === "jams") {
    return NextResponse.json(
      { error: "Use Jams advance in WAM Jams sessions" },
      { status: 400 },
    );
  }
  if (mode !== "jukebox" && mode !== "queue") {
    return NextResponse.json({ error: "Song queue is not enabled" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    if (session.current_queue_id) {
      const { data: currentItem } = await admin
        .from("live_queue")
        .select("*")
        .eq("id", session.current_queue_id)
        .maybeSingle();

      if (currentItem && !(currentItem as LiveQueueRow).played_at) {
        const now = new Date().toISOString();
        const { data: playedItem, error: playErr } = await admin
          .from("live_queue")
          .update({ played_at: now })
          .eq("id", session.current_queue_id)
          .select("*")
          .single();

        if (playErr) throw new Error(playErr.message);

        if (sessionHasScores(session)) {
          await finalizeTrackScores(
            admin,
            session,
            (playedItem ?? currentItem) as LiveQueueRow,
          );
        }
      }
    }

    const freshSession =
      (await loadActiveSession(admin, sessionId)) ?? session;
    const { nextTrack, session: updatedSession } = await pickAndApplyNextTrack(
      admin,
      freshSession,
    );
    const queue = await loadPendingQueue(admin, sessionId);

    return NextResponse.json({
      nextTrack,
      session: updatedSession,
      queue,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to advance queue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
