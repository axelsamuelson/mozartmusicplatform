import { type NextRequest, NextResponse } from "next/server";

import { createSpotifyPlaylist } from "@/lib/spotify/userPlaylistSpotify";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { WamPlaylistRow } from "@/lib/types/playlists";

type CreateBody = {
  name?: string;
  description?: string | null;
  filter_genres?: string[];
  filter_mood_levels?: number[];
  filter_moments?: string[];
  filter_min_score?: number;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wam_playlists")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ playlists: (data ?? []) as WamPlaylistRow[] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const filter_genres = Array.isArray(body.filter_genres)
    ? body.filter_genres.filter((x): x is string => typeof x === "string")
    : [];
  const filter_mood_levels = Array.isArray(body.filter_mood_levels)
    ? body.filter_mood_levels.filter((x): x is number => typeof x === "number")
    : [];
  const filter_moments = Array.isArray(body.filter_moments)
    ? body.filter_moments.filter((x): x is string => typeof x === "string")
    : [];
  const filter_min_score =
    typeof body.filter_min_score === "number" &&
    Number.isFinite(body.filter_min_score)
      ? Math.max(0, Math.min(100, Math.round(body.filter_min_score)))
      : 0;

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "MISSING_SPOTIFY_TOKEN") {
      return NextResponse.json(
        { error: "Spotify session missing; sign in again with Spotify." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let playlistId: string;
  try {
    const created = await createSpotifyPlaylist(
      accessToken,
      name,
      typeof body.description === "string" ? body.description : null,
    );
    playlistId = created.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spotify error";
    const spotifyStatus = /^Spotify API (\d{3}):/.exec(msg)?.[1];
    if (spotifyStatus === "401") {
      return NextResponse.json(
        { error: "Spotify session expired or invalid; sign in again with Spotify." },
        { status: 401 },
      );
    }
    if (spotifyStatus === "403") {
      return NextResponse.json(
        {
          error:
            "Spotify refused creating a playlist (missing playlist-modify scopes or account restriction). Sign out and sign in with Spotify again.",
        },
        { status: 403 },
      );
    }
    if (spotifyStatus === "429") {
      return NextResponse.json(
        {
          error:
            "Spotify is still rate-limiting this action after automatic retries. Wait a minute and try again.",
        },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const filters = {
    filter_genres: filter_genres.length ? filter_genres : null,
    filter_mood_levels: filter_mood_levels.length ? filter_mood_levels : null,
    filter_moments: filter_moments.length ? filter_moments : null,
    filter_min_score,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("wam_playlists")
    .insert({
      user_id: user.id,
      spotify_playlist_id: playlistId,
      name,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
      ...filters,
      track_count: 0,
      last_synced_at: null,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    try {
      const { unfollowSpotifyPlaylist } = await import(
        "@/lib/spotify/userPlaylistSpotify"
      );
      await unfollowSpotifyPlaylist(accessToken, playlistId);
    } catch {
      /* best effort */
    }
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to save playlist" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { playlist: inserted as WamPlaylistRow },
    { status: 201 },
  );
}
