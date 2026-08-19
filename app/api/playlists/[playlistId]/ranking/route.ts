import { NextResponse, type NextRequest } from "next/server";

import { loadMatchedPlaylistTracks } from "@/lib/playlist/loadMatchedTracks";
import { rankedTracksByScore } from "@/lib/playlist/trackRank";
import { spotifyPlaylistWebUrl } from "@/lib/playlist/urls";
import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import { createClient } from "@/lib/supabase/server";
import type { WamPlaylistRow } from "@/lib/types/playlists";
import type { PlaylistRankingPayload } from "@/lib/types/trackPlaylists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ playlistId: string }> },
) {
  const { playlistId } = await context.params;
  if (!UUID_RE.test(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("wam_playlists")
    .select("*")
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pl = row as WamPlaylistRow;

  try {
    const matched = await loadMatchedPlaylistTracks(supabase, user.id, pl);
    const { data: cached } = await supabase
      .from("playlist_tracks")
      .select("image_url")
      .eq("user_id", user.id)
      .eq("playlist_id", pl.spotify_playlist_id)
      .maybeSingle();

    const image_url =
      typeof cached?.image_url === "string" && cached.image_url.length > 0
        ? cached.image_url
        : null;

    const payload: PlaylistRankingPayload = {
      playlist: {
        id: pl.id,
        name: pl.name,
        image_url,
        source: "wam",
        spotify_url: pl.spotify_playlist_id
          ? spotifyPlaylistWebUrl(pl.spotify_playlist_id)
          : null,
        edit_href: `/playlists/${pl.id}`,
        total_tracks: matched.length,
      },
      tracks: rankedTracksByScore(matched),
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load ranking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
