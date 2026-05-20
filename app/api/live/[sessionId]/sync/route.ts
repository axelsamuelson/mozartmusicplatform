import { NextResponse } from "next/server";

import {
  buildSyncPlaybackPatch,
  sessionPlaybackChanged,
} from "@/lib/live/mapPlaybackToSession";
import { loadPendingQueue } from "@/lib/live/jukeboxQueue";
import {
  getEffectiveLiveSessionMode,
  shouldSkipHostPlaybackSync,
} from "@/lib/live/sessionMode";
import { persistHostProviderToken } from "@/lib/live/getHostToken";
import { invalidatePlaybackQueueDisplayCache } from "@/lib/live/queueDisplayCache";
import { fetchCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import { isSpotify429Error } from "@/lib/spotify/rateLimiter";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const session = row as LiveSessionRow;
  if (shouldSkipHostPlaybackSync(session)) {
    return NextResponse.json({ session, unchanged: true, syncSkipped: true });
  }

  if (getEffectiveLiveSessionMode(session) === "queue") {
    const pending = await loadPendingQueue(supabase, sessionId);
    if (pending.length > 0) {
      return NextResponse.json({ session, unchanged: true, syncSkipped: true });
    }
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

  let playback;
  try {
    playback = await fetchCurrentPlayback(accessToken, { userId: user.id });
  } catch (e) {
    if (isSpotify429Error(e) || (e instanceof Error && /circuit/i.test(e.message))) {
      return NextResponse.json({
        session,
        unchanged: true,
        syncSkipped: true,
        reason: "spotify_unavailable",
      });
    }
    const msg = e instanceof Error ? e.message : "Spotify playback unavailable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  try {
    const { data: authData } = await supabase.auth.getSession();
    await persistHostProviderToken(createAdminClient(), sessionId, accessToken, {
      refreshToken: authData.session?.provider_refresh_token ?? null,
      expiresInSec: 3600,
    });
  } catch {
    /* non-fatal */
  }

  const patch = buildSyncPlaybackPatch(
    session,
    playback && "trackId" in playback && playback.itemKind === "track"
      ? playback
      : null,
  );

  if (!sessionPlaybackChanged(session, patch)) {
    return NextResponse.json({ session, unchanged: true });
  }

  if (patch.spotify_track_id !== session.spotify_track_id) {
    invalidatePlaybackQueueDisplayCache(sessionId);
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[sync] updating track:", patch.spotify_track_id);
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
