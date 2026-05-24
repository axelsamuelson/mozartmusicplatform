import { type NextRequest, NextResponse } from "next/server";

import { createSimulatedLiveSession } from "@/lib/dev/createSimulatedLiveSession";
import { devLiveApiAllowed } from "@/lib/dev/liveSimulateGate";
import { ensureLiveTestUsers } from "@/lib/dev/ensureLiveTestUsers";
import { seedLiveTestRatings } from "@/lib/dev/seedLiveTestRatings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PostBody = {
  trackIndex?: number;
  anonymous_mode?: boolean;
  jukebox_enabled?: boolean;
  jams_enabled?: boolean;
};

/** One call: test users + simulated session + 4 ratings → ready to test. */
export async function POST(request: NextRequest) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json({ error: "Dev live API disabled" }, { status: 403 });
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
    await ensureLiveTestUsers();
    const session = await createSimulatedLiveSession(supabase, user.id, body);
    const trackId = session.spotify_track_id;
    let ratings = { insertedCount: 0, skippedCount: 0 };
    if (trackId) {
      ratings = await seedLiveTestRatings(session.id, trackId);
    }

    return NextResponse.json({
      simulated: true,
      sessionId: session.id,
      code: session.code,
      session,
      ratings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quick start failed" },
      { status: 500 },
    );
  }
}
