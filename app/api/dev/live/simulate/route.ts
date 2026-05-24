import { type NextRequest, NextResponse } from "next/server";

import { createSimulatedLiveSession } from "@/lib/dev/createSimulatedLiveSession";
import { devLiveApiAllowed } from "@/lib/dev/liveSimulateGate";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";

export const dynamic = "force-dynamic";

type PostBody = {
  trackIndex?: number;
  anonymous_mode?: boolean;
  jukebox_enabled?: boolean;
  jams_enabled?: boolean;
  wam_controls_playback?: boolean;
};

export async function POST(request: NextRequest) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json(
      {
        error:
          "Dev live simulate API is disabled. Use NODE_ENV=development or set DEV_LIVE_SECRET.",
      },
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

  let body: PostBody = {};
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }

  try {
    const session = await createSimulatedLiveSession(supabase, user.id, body);
    return NextResponse.json({
      simulated: true,
      sessionId: session.id,
      code: session.code,
      session,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create session" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json({ error: "Dev live simulate API disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { SIMULATED_LIVE_TRACKS } = await import("@/lib/dev/liveSimulateTracks");
  return NextResponse.json({ tracks: SIMULATED_LIVE_TRACKS });
}
