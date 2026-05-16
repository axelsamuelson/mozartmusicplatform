import { NextResponse } from "next/server";

import { ratingMatchesPlaylistFilters, trackUrisFromRatings } from "@/lib/playlist/matchRating";
import { loadAllUserRatings } from "@/lib/ratings/normalize";
import { assertWamOwned } from "@/lib/spotify/playlistGuard";
import { replacePlaylistTracks } from "@/lib/spotify/userPlaylistSpotify";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { WamPlaylistRow } from "@/lib/types/playlists";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export async function POST(
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

  const filters = {
    filter_genres: pl.filter_genres,
    filter_mood_levels: pl.filter_mood_levels,
    filter_moments: pl.filter_moments,
    filter_min_score: pl.filter_min_score,
  };

  let uris: string[];
  try {
    const ratings = await loadAllUserRatings(supabase, user.id);
    const matched = ratings.filter((r) => ratingMatchesPlaylistFilters(r, filters));
    uris = trackUrisFromRatings(matched);
    await replacePlaylistTracks(accessToken, pl.spotify_playlist_id, uris);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from("wam_playlists")
    .update({
      track_count: uris.length,
      last_synced_at: now,
    })
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (upErr || !updated) {
    return NextResponse.json(
      { error: upErr?.message ?? "Failed to update playlist row" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    playlist: updated as WamPlaylistRow,
    track_count: uris.length,
  });
}
