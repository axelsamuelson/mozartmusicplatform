import { NextResponse } from "next/server";

import { enrichTracksFromCacheAndSpotify } from "@/lib/live/enrichTrackMetadata";
import { getHostToken } from "@/lib/live/getHostToken";
import { loadUpNextTracks } from "@/lib/live/jamsUpNext";
import { LIVE_SESSION_UUID_RE, loadActiveSession } from "@/lib/live/loadActiveSession";
import { usesJamsAdvance } from "@/lib/live/sessionMode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  if (!usesJamsAdvance(session)) {
    return NextResponse.json(
      { error: "WAM Jams is not enabled for this session" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const items = await loadUpNextTracks(admin, sessionId);
    const trackIds = items.map((i) => i.spotify_track_id);

    let hostToken: string | null = null;
    try {
      hostToken = await getHostToken(admin, session);
    } catch {
      hostToken = null;
    }

    const meta = await enrichTracksFromCacheAndSpotify(
      admin,
      trackIds,
      hostToken ?? undefined,
    );

    const enriched = items.map((item) => {
      const m = meta.get(item.spotify_track_id);
      return {
        ...item,
        track_name: m?.track_name ?? item.track_name,
        artist_name: m?.artist_name ?? item.artist_name,
        image_url: m?.image_url ?? item.image_url,
      };
    });

    return NextResponse.json({
      items: enriched,
      queue_mode: session.queue_mode ?? "transparent",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load up next";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
