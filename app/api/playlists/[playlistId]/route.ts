import { NextResponse } from "next/server";

import { ratingMatchesPlaylistFilters } from "@/lib/playlist/matchRating";
import { loadAllUserRatings } from "@/lib/ratings/normalize";
import { assertWamOwned } from "@/lib/spotify/playlistGuard";
import { unfollowSpotifyPlaylist } from "@/lib/spotify/userPlaylistSpotify";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { RatingDetail } from "@/lib/types/ratings";
import type { WamPlaylistRow } from "@/lib/types/playlists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ playlistId: string }> },
) {
  const { playlistId } = await context.params;
  if (!isUuid(playlistId)) {
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
  const filters: Parameters<typeof ratingMatchesPlaylistFilters>[1] = {
    filter_genres: pl.filter_genres,
    filter_mood_levels: pl.filter_mood_levels,
    filter_moments: pl.filter_moments,
    filter_min_score: pl.filter_min_score,
  };

  let matched_tracks: RatingDetail[] = [];
  try {
    const ratings = await loadAllUserRatings(supabase, user.id);
    matched_tracks = ratings.filter((r) => ratingMatchesPlaylistFilters(r, filters));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load ratings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    playlist: pl,
    matched_tracks,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ playlistId: string }> },
) {
  const { playlistId } = await context.params;
  if (!isUuid(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("wam_playlists")
    .select("*")
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pl = row as WamPlaylistRow;

  try {
    await assertWamOwned(pl.spotify_playlist_id, user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_WAM_OWNED") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    if (m === "MISSING_SPOTIFY_TOKEN") {
      return NextResponse.json(
        { error: "Spotify session missing; sign in again with Spotify." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: m }, { status: 500 });
  }

  try {
    await unfollowSpotifyPlaylist(accessToken, pl.spotify_playlist_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spotify unfollow failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: delErr } = await supabase
    .from("wam_playlists")
    .delete()
    .eq("id", playlistId)
    .eq("user_id", user.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
