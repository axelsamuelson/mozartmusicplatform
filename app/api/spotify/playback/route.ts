import { NextResponse } from "next/server";

import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import {
  fetchCurrentPlayback,
  playlistIdFromContextUri,
} from "@/lib/spotify/currentlyPlaying";
import type { SpotifyPlaybackApiResponse } from "@/lib/spotify/currentlyPlaying";
import {
  getLastKnownPlayback,
  setLastKnownPlayback,
} from "@/lib/spotify/playbackFallback";
import {
  getDedupedPlayback,
  setDedupedPlayback,
} from "@/lib/spotify/playbackDedup";
import { resolvePlaybackPlaylistContext } from "@/lib/spotify/playbackPlaylistContext";
import { SpotifyApiError } from "@/lib/spotify/errors";
import {
  isSpotify429Error,
  isSpotifyCircuitOpen,
  recordSpotify429,
  recordSpotifySuccess,
} from "@/lib/spotify/rateLimiter";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

function playbackJson(
  body: SpotifyPlaybackApiResponse,
  userId: string,
): NextResponse {
  setDedupedPlayback(userId, body);
  setLastKnownPlayback(userId, body);
  return NextResponse.json(body, {
    headers: { "Cache-Control": CACHE_NO_STORE },
  });
}

function fallbackPlayback(userId: string): NextResponse {
  const last =
    getDedupedPlayback(userId) ??
    getLastKnownPlayback(userId) ?? { isPlaying: false };
  return NextResponse.json(last, {
    headers: { "Cache-Control": CACHE_NO_STORE },
  });
}

async function enrichPlayback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accessToken: string,
  playback: NonNullable<Awaited<ReturnType<typeof fetchCurrentPlayback>>>,
): Promise<SpotifyPlaybackApiResponse> {
  let contextName = playback.contextName;
  let contextImageUrl: string | null = null;
  let isWamPlaylist = false;
  let wamPlaylistId: string | null = null;

  if (
    playback.contextType === "playlist" &&
    playback.contextUri?.startsWith("spotify:playlist:")
  ) {
    const pid = playlistIdFromContextUri(playback.contextUri);
    if (pid) {
      const resolved = await resolvePlaybackPlaylistContext(
        supabase,
        userId,
        accessToken,
        pid,
      );
      contextName = resolved.contextName ?? contextName;
      contextImageUrl = resolved.contextImageUrl;
      isWamPlaylist = resolved.isWamPlaylist;
      wamPlaylistId = resolved.wamPlaylistId;
    }
  }

  return {
    ...playback,
    contextName,
    contextImageUrl,
    isWamPlaylist,
    wamPlaylistId,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deduped = getDedupedPlayback(user.id);
  if (deduped) {
    return NextResponse.json(deduped, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  }

  if (isSpotifyCircuitOpen()) {
    return fallbackPlayback(user.id);
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
    recordSpotifySuccess();

    if (!playback) {
      const empty: SpotifyPlaybackApiResponse = { isPlaying: false };
      return playbackJson(empty, user.id);
    }

    const body = await enrichPlayback(supabase, user.id, accessToken, playback);
    return playbackJson(body, user.id);
  } catch (e) {
    if (isSpotify429Error(e)) {
      recordSpotify429();
      return fallbackPlayback(user.id);
    }

    if (e instanceof SpotifyApiError) {
      if (e.status === 429) {
        recordSpotify429();
        return fallbackPlayback(user.id);
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
      recordSpotify429();
      return fallbackPlayback(user.id);
    }

    const last = getLastKnownPlayback(user.id);
    if (last) {
      return fallbackPlayback(user.id);
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
