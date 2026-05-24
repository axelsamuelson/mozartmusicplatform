import { type NextRequest, NextResponse } from "next/server";

import { loadMatchedPlaylistTracks } from "@/lib/playlist/loadMatchedTracks";
import { parsePlaylistPatchBody, playlistFiltersToDbColumns } from "@/lib/playlist/playlistFilters";
import { assertWamOwned } from "@/lib/spotify/playlistGuard";
import { SPOTIFY_CIRCUIT_UNAVAILABLE_MSG } from "@/lib/spotify/rateLimiter";
import { unfollowSpotifyPlaylist } from "@/lib/spotify/userPlaylistSpotify";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
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

  let matched_tracks;
  try {
    matched_tracks = await loadMatchedPlaylistTracks(supabase, user.id, pl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load ratings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    playlist: pl,
    matched_tracks,
  });
}

export async function PATCH(
  request: NextRequest,
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let patch: ReturnType<typeof parsePlaylistPatchBody>;
  try {
    patch = parsePlaylistPatchBody(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid patch body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!patch.sort_order && !patch.filters) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.sort_order) update.sort_order = patch.sort_order;
  if (patch.filters) {
    Object.assign(update, playlistFiltersToDbColumns(patch.filters));
  }

  const { data: updated, error } = await supabase
    .from("wam_playlists")
    .update(update)
    .eq("id", playlistId)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pl = updated as WamPlaylistRow;
  let matched_tracks;
  try {
    matched_tracks = await loadMatchedPlaylistTracks(supabase, user.id, pl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load ratings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ playlist: pl, matched_tracks });
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
    if (msg === SPOTIFY_CIRCUIT_UNAVAILABLE_MSG) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
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
