import { NextResponse, type NextRequest } from "next/server";

import { rankedTracksByScore } from "@/lib/playlist/trackRank";
import { spotifyPlaylistWebUrl } from "@/lib/playlist/urls";
import { loadAllUserRatings } from "@/lib/ratings/normalize";
import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import { loadUserPlaylistTracksMap } from "@/lib/spotify/playlistTracksDb";
import { createClient } from "@/lib/supabase/server";
import type { PlaylistRankingPayload } from "@/lib/types/trackPlaylists";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const playlistId = id?.trim();
  if (!playlistId || playlistId.length > 64) {
    return NextResponse.json({ error: "Missing playlist id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [cachedMap, ratings] = await Promise.all([
      loadUserPlaylistTracksMap(supabase, user.id),
      loadAllUserRatings(supabase, user.id),
    ]);

    const row = cachedMap.get(playlistId);
    if (!row) {
      return NextResponse.json(
        { error: "Playlist not synced yet. Open Playlists → Spotify to sync it." },
        { status: 404 },
      );
    }

    const idSet = new Set(row.track_ids);
    const inPlaylist = ratings.filter((r) => idSet.has(r.spotify_id));
    const tracks = rankedTracksByScore(inPlaylist);

    const payload: PlaylistRankingPayload = {
      playlist: {
        id: row.playlist_id,
        name: row.name?.trim() || "Untitled playlist",
        image_url: row.image_url,
        source: "spotify",
        spotify_url: spotifyPlaylistWebUrl(row.playlist_id),
        edit_href: null,
        total_tracks: row.total_tracks || row.track_ids.length,
      },
      tracks,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load ranking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
