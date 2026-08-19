import { NextResponse, type NextRequest } from "next/server";

import { rankedTracksByScore } from "@/lib/playlist/trackRank";
import { spotifyPlaylistWebUrl } from "@/lib/playlist/urls";
import { loadUserRatingsBySpotifyIds } from "@/lib/ratings/normalize";
import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import { loadPlaylistTracksRow } from "@/lib/spotify/playlistTracksDb";
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
    const row = await loadPlaylistTracksRow(supabase, user.id, playlistId);
    if (!row) {
      return NextResponse.json(
        { error: "Playlist not synced yet. Open Playlists → Spotify to sync it." },
        { status: 404 },
      );
    }

    const ratings = await loadUserRatingsBySpotifyIds(
      supabase,
      user.id,
      row.track_ids,
    );
    const tracks = rankedTracksByScore(ratings);

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
