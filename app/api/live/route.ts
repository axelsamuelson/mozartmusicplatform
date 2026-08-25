import { type NextRequest, NextResponse } from "next/server";

import { persistHostProviderToken } from "@/lib/live/getHostToken";
import { playbackToSessionPatch } from "@/lib/live/mapPlaybackToSession";
import { generateSessionCode, normalizeSessionCode } from "@/lib/utils/sessionCode";
import { fetchCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { LiveSessionHostingMode, LiveSessionRow } from "@/lib/types/live";

export const dynamic = "force-dynamic";

async function uniqueCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateSessionCode();
    const { data } = await supabase
      .from("live_sessions")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not allocate session code");
}

function parseHostingMode(raw: unknown): LiveSessionHostingMode {
  return raw === "spotify_jam_overlay" ? "spotify_jam_overlay" : "wam_hosted";
}

export async function GET(request: NextRequest) {
  const codeParam = request.nextUrl.searchParams.get("code");
  if (!codeParam?.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const code = normalizeSessionCode(codeParam);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  return NextResponse.json({ session: data as LiveSessionRow });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let hostingMode: LiveSessionHostingMode = "wam_hosted";
  try {
    const body = (await request.json()) as { mode?: unknown };
    hostingMode = parseHostingMode(body.mode);
  } catch {
    /* empty / non-JSON body → wam_hosted */
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

  await supabase
    .from("live_sessions")
    .update({ is_active: false })
    .eq("host_user_id", user.id)
    .eq("is_active", true);

  const code = await uniqueCode(supabase);

  if (hostingMode === "spotify_jam_overlay") {
    const { data: inserted, error: insertErr } = await supabase
      .from("live_sessions")
      .insert({
        code,
        host_user_id: user.id,
        is_active: true,
        anonymous_mode: false,
        mode: "spotify_jam_overlay",
        wam_controls_playback: false,
        jams_enabled: false,
        jukebox_enabled: false,
      })
      .select("*")
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message ?? "Failed to create session" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      sessionId: inserted.id as string,
      code: inserted.code as string,
      session: inserted as LiveSessionRow,
    });
  }

  const playback = await fetchCurrentPlayback(accessToken, { userId: user.id });
  if (!playback?.trackId || playback.itemKind !== "track") {
    return NextResponse.json(
      { error: "Start playing a track on Spotify before starting a live session." },
      { status: 400 },
    );
  }

  const playbackPatch = playbackToSessionPatch(playback);

  const { data: inserted, error: insertErr } = await supabase
    .from("live_sessions")
    .insert({
      code,
      host_user_id: user.id,
      is_active: true,
      anonymous_mode: false,
      mode: "wam_hosted",
      ...playbackPatch,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create session" },
      { status: 500 },
    );
  }

  try {
    const { data: authData } = await supabase.auth.getSession();
    const admin = createAdminClient();
    await persistHostProviderToken(admin, inserted.id as string, accessToken, {
      refreshToken: authData.session?.provider_refresh_token ?? null,
      expiresInSec: 3600,
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[live] Could not persist host Spotify token on create:", e);
    }
  }

  return NextResponse.json({
    sessionId: inserted.id as string,
    code: inserted.code as string,
    session: inserted as LiveSessionRow,
  });
}
