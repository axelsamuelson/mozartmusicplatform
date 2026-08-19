import { NextResponse, type NextRequest } from "next/server";

import { playlistsContainingTrack } from "@/lib/playlist/trackMembership";
import { loadAllUserRatingsSlim } from "@/lib/ratings/normalize";
import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import { loadPlaylistsContainingTrack } from "@/lib/spotify/playlistTracksDb";
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

  try {
    const [wamRes, ratings, cachedPlaylists] = await Promise.all([
      supabase.from("wam_playlists").select("*").eq("user_id", user.id),
      loadAllUserRatingsSlim(supabase, user.id, "track"),
      loadPlaylistsContainingTrack(supabase, user.id, trackId),
    ]);

    if (wamRes.error) {
      return NextResponse.json({ error: wamRes.error.message }, { status: 500 });
    }

    const payload = playlistsContainingTrack({
      trackId,
      ratings,
      wamPlaylists: (wamRes.data ?? []) as WamPlaylistRow[],
      cachedPlaylists,
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load playlists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
