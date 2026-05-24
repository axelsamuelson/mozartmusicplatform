import { type NextRequest, NextResponse } from "next/server";

import { devLiveApiAllowed } from "@/lib/dev/liveSimulateGate";
import { simulatedPlaybackPatch } from "@/lib/dev/liveSimulatePlayback";
import {
  SIMULATED_LIVE_TRACKS,
  simulatedTrackByIndex,
  type SimulatedTrack,
} from "@/lib/dev/liveSimulateTracks";
import { seedLiveTestRatings } from "@/lib/dev/seedLiveTestRatings";
import { sessionPlaybackChanged } from "@/lib/live/mapPlaybackToSession";
import { createClient } from "@/lib/supabase/server";
import type { LiveSessionRow } from "@/lib/types/live";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PatchBody = {
  trackIndex?: number;
  track?: Partial<SimulatedTrack>;
  is_playing?: boolean;
  progress_ms?: number;
  advance_track?: boolean;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json({ error: "Dev live simulate API disabled" }, { status: 403 });
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
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const row = session as LiveSessionRow;
  if (row.host_user_id !== user.id) {
    return NextResponse.json(
      { error: "Only the session host can drive simulated playback" },
      { status: 403 },
    );
  }

  if (row.device_name !== "[simulated]") {
    return NextResponse.json(
      {
        error:
          "This session was not created in simulate mode. Start one from /dev/live.",
      },
      { status: 400 },
    );
  }

  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    body = {};
  }

  let track: SimulatedTrack;
  if (body.advance_track) {
    const currentIdx = SIMULATED_LIVE_TRACKS.findIndex(
      (t) => t.spotify_track_id === row.spotify_track_id,
    );
    track = simulatedTrackByIndex(currentIdx < 0 ? 0 : currentIdx + 1);
  } else if (body.track?.spotify_track_id || body.track?.track_name) {
    const base = simulatedTrackByIndex(body.trackIndex ?? 0);
    track = { ...base, ...body.track } as SimulatedTrack;
  } else if (body.trackIndex != null) {
    track = simulatedTrackByIndex(body.trackIndex);
  } else {
    const base = simulatedTrackByIndex(0);
    track = {
      spotify_track_id: row.spotify_track_id ?? base.spotify_track_id,
      track_name: row.track_name ?? base.track_name,
      artist_name: row.artist_name ?? base.artist_name,
      image_url: row.image_url ?? base.image_url,
      duration_ms: row.duration_ms ?? base.duration_ms,
    };
  }

  const patch = simulatedPlaybackPatch(track, {
    isPlaying:
      typeof body.is_playing === "boolean" ? body.is_playing : (row.is_playing ?? true),
    progressMs:
      typeof body.progress_ms === "number"
        ? body.progress_ms
        : body.advance_track
          ? 0
          : (row.progress_ms ?? 0),
  });

  if (!body.advance_track && !sessionPlaybackChanged(row, patch)) {
    return NextResponse.json({ session: row, changed: false });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("live_sessions")
    .update(patch)
    .eq("id", sessionId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Update failed" },
      { status: 500 },
    );
  }

  const updatedRow = updated as LiveSessionRow;
  let ratings: { insertedCount: number; skippedCount: number } | null = null;
  if (
    body.advance_track &&
    updatedRow.spotify_track_id &&
    updatedRow.spotify_track_id !== row.spotify_track_id
  ) {
    try {
      ratings = await seedLiveTestRatings(
        sessionId,
        updatedRow.spotify_track_id,
      );
    } catch {
      /* non-fatal for playback patch */
    }
  }

  return NextResponse.json({
    session: updatedRow,
    changed: true,
    ratings,
  });
}
