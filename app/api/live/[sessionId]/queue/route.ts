import { type NextRequest, NextResponse } from "next/server";

import { getHostToken, HostTokenExpiredError } from "@/lib/live/getHostToken";
import {
  loadPendingQueue,
  loadPlayedQueue,
  loadSessionScores,
  pickAndApplyNextTrack,
  recomputeQueuePositions,
} from "@/lib/live/jukeboxQueue";
import { buildLiveQueueDisplay } from "@/lib/live/liveQueueDisplay";
import { invalidatePlaybackQueueDisplayCache } from "@/lib/live/queueDisplayCache";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { playQueueTrackOnHost } from "@/lib/live/songQueuePlayback";
import {
  getLiveSessionMode,
  sessionHasQueue,
  usesJukeboxQueueOrdering,
  usesRoundRobinQueueOrdering,
} from "@/lib/live/sessionMode";
import { resolveLiveDisplayName } from "@/lib/live/resolveLiveDisplayName";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
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

    const admin = createAdminClient();
    let hostAccessToken: string | undefined;
    if (user.id === session.host_user_id) {
      try {
        hostAccessToken = await requireProviderAccessToken(supabase);
      } catch {
        hostAccessToken = undefined;
      }
    }
    if (!hostAccessToken) {
      try {
        hostAccessToken = await getHostToken(admin, session, user.id);
      } catch {
        hostAccessToken = undefined;
      }
    }

    const displayQueue = sessionHasQueue(session)
      ? await buildLiveQueueDisplay(admin, session, queue, {
          callerUserId: user.id,
          hostAccessToken,
        })
      : [];

    return NextResponse.json({
      queue,
      displayQueue,
      session,
      myQueueCount: myCount,
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
  is_manual?: boolean;
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
  const isManual = body.is_manual === true;
  const mode = getLiveSessionMode(session);
  if (!sessionHasQueue(session)) {
    return NextResponse.json(
      { error: "Queue is not enabled for this session" },
      { status: 400 },
    );
  }
  if (mode === "jams" && !isManual) {
    return NextResponse.json(
      {
        error:
          "In WAM Jams, tracks rotate from your source buffer. Use a manual jump to queue one track for your next slot.",
      },
      { status: 400 },
    );
  }

  const pending = await loadPendingQueue(supabase, sessionId);
  const queueWasEmpty = pending.length === 0;
  const myPending = pending.filter((q) => q.user_id === user.id);

  if (isManual) {
    const existingManual = myPending.some((q) => q.is_manual);
    if (existingManual) {
      return NextResponse.json(
        { error: "You already have a manual track waiting for your next slot" },
        { status: 400 },
      );
    }
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
      is_manual: isManual,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to add track" },
      { status: 500 },
    );
  }

  invalidatePlaybackQueueDisplayCache(sessionId);

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
    if (usesJukeboxQueueOrdering(session) || usesRoundRobinQueueOrdering(session)) {
      await recomputeQueuePositions(admin, session);
    }

    let sessionOut = session;
    const freshSession = (await loadActiveSession(admin, sessionId)) ?? session;
    if (
      usesRoundRobinQueueOrdering(freshSession) &&
      queueWasEmpty &&
      !freshSession.current_queue_id
    ) {
      const { nextTrack, session: updated } = await pickAndApplyNextTrack(
        admin,
        freshSession,
      );
      if (nextTrack) {
        await playQueueTrackOnHost(admin, updated, nextTrack.spotify_track_id, user.id);
        sessionOut = updated;
      }
    }

    const queue = await loadPendingQueue(admin, sessionId);
    let hostAccessToken: string | undefined;
    if (user.id === sessionOut.host_user_id) {
      try {
        hostAccessToken = await requireProviderAccessToken(supabase);
      } catch {
        hostAccessToken = undefined;
      }
    }
    if (!hostAccessToken) {
      try {
        hostAccessToken = await getHostToken(admin, sessionOut, user.id);
      } catch {
        hostAccessToken = undefined;
      }
    }

    const displayQueue = sessionHasQueue(sessionOut)
      ? await buildLiveQueueDisplay(admin, sessionOut, queue, {
          callerUserId: user.id,
          hostAccessToken,
        })
      : [];
    const myCount = queue.filter((q) => q.user_id === user.id).length;
    return NextResponse.json({
      item: inserted as LiveQueueRow,
      queue,
      displayQueue,
      session: sessionOut,
      myQueueCount: myCount,
    });
  } catch (e) {
    if (e instanceof HostTokenExpiredError) {
      return NextResponse.json(
        {
          error: "host_token_expired",
          message: "Host needs to log out and in again",
        },
        { status: 401 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to order queue";
    if (msg === "HOST_TOKEN_MISSING") {
      return NextResponse.json(
        { error: "Host Spotify token missing. Host must reconnect Spotify." },
        { status: 401 },
      );
    }
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
  if (!sessionHasQueue(session)) {
    return NextResponse.json({ error: "Queue is not enabled for this session" }, { status: 400 });
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
    if (usesJukeboxQueueOrdering(session)) {
      await recomputeQueuePositions(admin, session);
    }
    const queue = await loadPendingQueue(admin, sessionId);
    return NextResponse.json({ queue });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to reorder queue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
