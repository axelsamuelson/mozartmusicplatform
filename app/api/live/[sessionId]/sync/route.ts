import { NextResponse } from "next/server";

import {
  playbackToSessionPatch,
  sessionPlaybackChanged,
} from "@/lib/live/mapPlaybackToSession";
import { fetchCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { LiveSessionRow } from "@/lib/types/live";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
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

  const { data: row, error: fetchErr } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (row.host_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "MISSING_SPOTIFY_TOKEN" || msg === "MISSING_SPOTIFY_REFRESH") {
      return NextResponse.json(
        { error: "Spotify session missing. Sign in again with Spotify." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg || "Auth failed" }, { status: 401 });
  }

  const playback = await fetchCurrentPlayback(accessToken);
  const session = row as LiveSessionRow;
  const patch = playbackToSessionPatch(
    playback && "trackId" in playback && playback.itemKind === "track"
      ? playback
      : null,
  );

  if (!sessionPlaybackChanged(session, patch)) {
    return NextResponse.json({ session, unchanged: true });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("live_sessions")
    .update(patch)
    .eq("id", sessionId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to sync playback" },
      { status: 500 },
    );
  }

  return NextResponse.json({ session: updated as LiveSessionRow });
}
