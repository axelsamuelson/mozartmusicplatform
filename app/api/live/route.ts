import { type NextRequest, NextResponse } from "next/server";

import { playbackToSessionPatch } from "@/lib/live/mapPlaybackToSession";
import { generateSessionCode, normalizeSessionCode } from "@/lib/utils/sessionCode";
import { fetchCurrentPlayback } from "@/lib/spotify/currentlyPlaying";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { LiveSessionRow } from "@/lib/types/live";

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

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!playback?.trackId || playback.itemKind !== "track") {
    return NextResponse.json(
      { error: "Start playing a track on Spotify before starting a live session." },
      { status: 400 },
    );
  }

  await supabase
    .from("live_sessions")
    .update({ is_active: false })
    .eq("host_user_id", user.id)
    .eq("is_active", true);

  const code = await uniqueCode(supabase);

  const playbackPatch = playbackToSessionPatch(playback);

  const { data: inserted, error: insertErr } = await supabase
    .from("live_sessions")
    .insert({
      code,
      host_user_id: user.id,
      is_active: true,
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

  return NextResponse.json({
    sessionId: inserted.id as string,
    code: inserted.code as string,
    session: inserted as LiveSessionRow,
  });
}
