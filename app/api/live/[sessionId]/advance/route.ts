import { NextResponse } from "next/server";

import {
  AdvanceInProgressError,
  releaseAdvanceLock,
  requireAdvanceLock,
} from "@/lib/live/advanceLock";
import { isLiveAdvancedModesEnabled } from "@/lib/live/liveAdvancedModes";
import { advanceJamsSession } from "@/lib/live/jamsAdvance";
import { HostTokenExpiredError } from "@/lib/live/getHostToken";
import { loadPendingQueue } from "@/lib/live/jukeboxQueue";
import { usesJamsAdvance } from "@/lib/live/sessionMode";
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

  if (!isLiveAdvancedModesEnabled()) {
    return NextResponse.json(
      { error: "Advanced session modes are disabled" },
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
  if (!isHostOrCoHost(session, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!usesJamsAdvance(session)) {
    return NextResponse.json(
      { error: "WAM Jams is not enabled for this session" },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    await requireAdvanceLock(admin, sessionId);
  } catch (e) {
    if (e instanceof AdvanceInProgressError) {
      return NextResponse.json(
        { error: "Advance already in progress" },
        { status: 409 },
      );
    }
    throw e;
  }

  try {
    const result = await advanceJamsSession(admin, supabase, session, user.id);
    const queue = await loadPendingQueue(admin, sessionId);

    return NextResponse.json({
      session: result.session,
      nextTrack: result.nextTrack,
      queue,
      notice: result.notice ?? null,
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
    const msg = e instanceof Error ? e.message : "Failed to advance";
    if (msg === "HOST_TOKEN_MISSING") {
      return NextResponse.json(
        { error: "Host Spotify token missing. Host must reconnect Spotify." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await releaseAdvanceLock(admin, sessionId);
  }
}
