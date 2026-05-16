import { NextResponse } from "next/server";

import {
  fetchCurrentPlayback,
  fetchSpotifyPlaylistName,
  playlistIdFromContextUri,
} from "@/lib/spotify/currentlyPlaying";
import type { SpotifyPlaybackApiResponse } from "@/lib/spotify/currentlyPlaying";
import { SpotifyApiError } from "@/lib/spotify/errors";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

const CACHE_OK = "public, max-age=4";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "MISSING_SPOTIFY_TOKEN") {
      return NextResponse.json(
        { error: "Missing Spotify token. Sign out and sign in with Spotify again." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg || "Auth failed" }, { status: 401 });
  }

  try {
    const playback = await fetchCurrentPlayback(accessToken);
    if (!playback) {
      const empty: SpotifyPlaybackApiResponse = { isPlaying: false };
      return NextResponse.json(empty, {
        headers: { "Cache-Control": CACHE_OK },
      });
    }

    let contextName = playback.contextName;
    if (
      playback.contextType === "playlist" &&
      playback.contextUri?.startsWith("spotify:playlist:")
    ) {
      const pid = playlistIdFromContextUri(playback.contextUri);
      if (pid) {
        const name = await fetchSpotifyPlaylistName(accessToken, pid);
        contextName = name ?? contextName;
      }
    }

    const body: SpotifyPlaybackApiResponse = {
      ...playback,
      contextName,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": CACHE_OK },
    });
  } catch (e) {
    if (e instanceof SpotifyApiError) {
      if (e.status === 429) {
        return NextResponse.json(
          { error: "Spotify rate limited", retryAfter: e.retryAfterSec },
          { status: 429, headers: { "Cache-Control": "no-store" } },
        );
      }
      if (e.status === 401) {
        return NextResponse.json({ error: e.message }, { status: 401 });
      }
      if (e.status === 403) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
    }
    const message = e instanceof Error ? e.message : "Playback fetch failed";
    const spotifyStatus = /^Spotify API (\d{3}):/.exec(message)?.[1];
    if (spotifyStatus === "401") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (spotifyStatus === "403") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (spotifyStatus === "429") {
      return NextResponse.json(
        { error: "Spotify rate limited", retryAfter: 30 },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
