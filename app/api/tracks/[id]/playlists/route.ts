import { NextResponse, type NextRequest } from "next/server";

import { playlistsContainingTrack } from "@/lib/playlist/trackMembership";
import { normalizeRating, RATING_SELECT } from "@/lib/ratings/normalize";
import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import { loadUserPlaylistTracksMap } from "@/lib/spotify/playlistTracksDb";
import { createClient } from "@/lib/supabase/server";
import type { WamPlaylistRow } from "@/lib/types/playlists";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const trackId = id?.trim();
  if (!trackId || trackId.length > 64) {
    return NextResponse.json({ error: "Missing track id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [wamRes, ratingRes, cachedMap] = await Promise.all([
    supabase.from("wam_playlists").select("*").eq("user_id", user.id),
    supabase
      .from("ratings")
      .select(RATING_SELECT)
      .eq("user_id", user.id)
      .eq("spotify_id", trackId)
      .maybeSingle(),
    loadUserPlaylistTracksMap(supabase, user.id),
  ]);

  if (wamRes.error) {
    return NextResponse.json({ error: wamRes.error.message }, { status: 500 });
  }
  if (ratingRes.error) {
    return NextResponse.json({ error: ratingRes.error.message }, { status: 500 });
  }

  const rating = ratingRes.data
    ? normalizeRating(ratingRes.data as Record<string, unknown>)
    : null;

  const payload = playlistsContainingTrack({
    trackId,
    rating,
    wamPlaylists: (wamRes.data ?? []) as WamPlaylistRow[],
    cachedPlaylists: [...cachedMap.values()],
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": CACHE_NO_STORE },
  });
}
