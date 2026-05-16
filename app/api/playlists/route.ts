import { type NextRequest, NextResponse } from "next/server";

import { SpotifyApiError } from "@/lib/spotify/errors";
import { createSpotifyPlaylist } from "@/lib/spotify/userPlaylistSpotify";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";
import type { WamPlaylistRow } from "@/lib/types/playlists";

/** Spotify create + DB insert can wait on Retry-After; avoid Vercel killing the function early. */
export const maxDuration = 60;

const SPOTIFY_SESSION_EXPIRED_MSG =
  "Spotify session expired — please log out and log in again";

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
  try {
    console.log("POST /api/playlists env", {
      SPOTIFY_CLIENT_ID: Boolean(process.env.SPOTIFY_CLIENT_ID),
      SPOTIFY_CLIENT_SECRET: Boolean(process.env.SPOTIFY_CLIENT_SECRET),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    });

    console.log("Step 1: getting user session");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("Step 1: no authenticated user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("Step 1: user ok", { userId: user.id });

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

    console.log("Step 2: getting provider token");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const hasProviderToken = Boolean(session?.provider_token);
    const hasProviderRefresh = Boolean(session?.provider_refresh_token);
    console.log("Step 2: session", {
      hasSession: Boolean(session),
      hasProviderToken,
      hasProviderRefresh,
    });

    if (!hasProviderToken && !hasProviderRefresh) {
      console.log("Step 2: missing provider_token and provider_refresh_token");
      return NextResponse.json(
        { error: SPOTIFY_SESSION_EXPIRED_MSG },
        { status: 401 },
      );
    }

    let accessToken: string;
    try {
      accessToken = await requireProviderAccessToken(supabase);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      console.log("Step 2: requireProviderAccessToken failed", { msg });
      if (
        msg === "MISSING_SPOTIFY_TOKEN" ||
        msg === "MISSING_SPOTIFY_REFRESH"
      ) {
        return NextResponse.json(
          { error: SPOTIFY_SESSION_EXPIRED_MSG },
          { status: 401 },
        );
      }
      if (msg === "MISSING_SPOTIFY_OAUTH_ENV") {
        return NextResponse.json(
          {
            error:
              "Server missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in production env.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: msg || "Token error" }, { status: 500 });
    }
    console.log("Step 2: provider token ok");

    console.log("Step 3: creating playlist on Spotify", { name });
    let playlistId: string;
    try {
      const created = await createSpotifyPlaylist(
        accessToken,
        name,
        typeof body.description === "string" ? body.description : null,
      );
      playlistId = created.id;
    } catch (e) {
      if (e instanceof SpotifyApiError && e.status === 429) {
        console.log("Step 3: Spotify 429", { retryAfter: e.retryAfterSec });
        return NextResponse.json(
          { error: "Rate limited", retryAfter: e.retryAfterSec },
          { status: 429 },
        );
      }
      const msg = e instanceof Error ? e.message : "Spotify error";
      console.log("Step 3: Spotify create failed", { msg });
      if (msg.includes("timeout")) {
        return NextResponse.json(
          {
            error:
              "Spotify did not respond in time. Wait a minute (especially after rate limits) and try again.",
          },
          { status: 504 },
        );
      }
      const spotifyStatus = /^Spotify API (\d{3}):/.exec(msg)?.[1];
      if (spotifyStatus === "401") {
        return NextResponse.json(
          { error: SPOTIFY_SESSION_EXPIRED_MSG },
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
          { error: "Rate limited", retryAfter: 30 },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.log("Step 3: Spotify playlist created", { playlistId });

    const filters = {
      filter_genres: filter_genres.length ? filter_genres : null,
      filter_mood_levels: filter_mood_levels.length ? filter_mood_levels : null,
      filter_moments: filter_moments.length ? filter_moments : null,
      filter_min_score,
    };

    console.log("Step 4: saving to wam_playlists");
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
      console.log("Step 4: insert failed", {
        message: insertError?.message,
        code: insertError?.code,
      });
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

    console.log("Step 4: saved", { id: inserted.id });
    return NextResponse.json(
      { playlist: inserted as WamPlaylistRow },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/playlists fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: String(error) },
      { status: 500 },
    );
  }
}
