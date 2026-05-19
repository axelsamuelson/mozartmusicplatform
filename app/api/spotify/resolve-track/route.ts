import { type NextRequest, NextResponse } from "next/server";

import { normalizeSpotifyShareInput } from "@/lib/spotify/parseTrackUrl";
import {
  fetchTrackMetadata,
  resolveTrackIdFromShare,
  resolveTrackIdFromUrl,
} from "@/lib/spotify/resolveSpotifyTrackUrl";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let urlParam = request.nextUrl.searchParams.get("url")?.trim() ?? null;
  const title = request.nextUrl.searchParams.get("title");
  let text = request.nextUrl.searchParams.get("text")?.trim() ?? null;

  if (!urlParam && !title && !text) {
    return NextResponse.json({ error: "url, title, or text is required" }, { status: 400 });
  }

  const blob = [urlParam, text, title].filter(Boolean).join("\n");
  const normalized = normalizeSpotifyShareInput(blob);
  if (normalized.primary && !urlParam) urlParam = normalized.primary;
  if (!text && blob) text = blob;

  try {
    let trackId: string | null = null;
    for (const candidate of normalized.candidates.length
      ? normalized.candidates
      : [urlParam, text, title].filter((v): v is string => Boolean(v))) {
      trackId = await resolveTrackIdFromUrl(candidate);
      if (trackId) break;
    }
    if (!trackId) {
      trackId = await resolveTrackIdFromShare({ url: urlParam, title, text });
    }
    if (!trackId) {
      return NextResponse.json(
        { error: "Could not find a Spotify track in that link" },
        { status: 400 },
      );
    }

    const track = await fetchTrackMetadata(trackId);
    return NextResponse.json(track);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to resolve track";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
