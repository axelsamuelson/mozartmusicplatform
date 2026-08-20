import { after, NextResponse, type NextRequest } from "next/server";

import {
  shouldRecordListeningHistory,
  upsertListeningHistory,
} from "@/lib/playback/listeningHistory";
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
  getSpotifyCircuitState,
  isSpotify429Error,
  isSpotifyCircuitOpen,
  recordSpotify429,
  recordSpotifySuccess,
} from "@/lib/spotify/rateLimiter";
import { hasSpotifyProviderCredentials } from "@/lib/spotify/spotifyTokenMetadata";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

const IS_DEV = process.env.NODE_ENV === "development";

function withServerTime<T extends SpotifyPlaybackApiResponse>(body: T) {
  return { ...body, serverTime: Date.now() };
}

function playbackJson(
  body: SpotifyPlaybackApiResponse,
  userId: string,
  supabase?: Awaited<ReturnType<typeof createClient>>,
): NextResponse {
  setDedupedPlayback(userId, body);
  setLastKnownPlayback(userId, body);

  if (
    supabase &&
    "trackId" in body &&
    typeof body.trackId === "string" &&
    body.trackId &&
    body.itemKind !== "episode" &&
    typeof body.trackName === "string" &&
    body.trackName &&
    shouldRecordListeningHistory(userId, body.trackId)
  ) {
    const trackId = body.trackId;
    const trackName = body.trackName;
    const artistName = body.artistName ?? null;
    const artistId = body.artistId ?? null;
    const imageUrl = body.imageUrl ?? null;
    after(() =>
      upsertListeningHistory(supabase, userId, {
        spotifyId: trackId,
        name: trackName,
        artistName,
        artistId,
        imageUrl,
      }),
    );
  }

  const circuit = getSpotifyCircuitState();
  return NextResponse.json(withServerTime(body), {
    headers: {
      "Cache-Control": CACHE_NO_STORE,
      "X-WAM-Circuit": circuit,
    },
  });
}

function fallbackPlayback(userId: string): NextResponse {
  const last =
    getDedupedPlayback(userId) ??
    getLastKnownPlayback(userId) ?? { isPlaying: false };
  const circuit = getSpotifyCircuitState();
  return NextResponse.json(withServerTime(last), {
    headers: {
      "Cache-Control": CACHE_NO_STORE,
      "X-WAM-Circuit": circuit,
    },
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

export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const hasCredentials = hasSpotifyProviderCredentials(session, user);
  const circuit = getSpotifyCircuitState();

  if (IS_DEV) {
    console.log("[playback] request", {
      userId: user.id,
      hasCredentials,
      circuit,
    });
  }

  if (!hasCredentials) {
    return NextResponse.json(
      { error: "no_token" },
      { status: 401, headers: { "Cache-Control": CACHE_NO_STORE } },
    );
  }

  const deduped = fresh ? null : getDedupedPlayback(user.id);
  if (deduped) {
    if (IS_DEV) {
      console.log("[playback] dedup hit", {
        isPlaying: deduped.isPlaying,
        trackId: "trackId" in deduped ? deduped.trackId : null,
      });
    }
    return NextResponse.json(withServerTime(deduped), {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
        "X-WAM-Circuit": circuit,
      },
    });
  }

  if (isSpotifyCircuitOpen()) {
    if (IS_DEV) {
      console.warn("[playback] circuit OPEN — returning fallback");
    }
    return fallbackPlayback(user.id);
  }

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (IS_DEV) {
      console.warn("[playback] token error", msg);
    }
    if (msg === "MISSING_SPOTIFY_TOKEN" || msg === "MISSING_SPOTIFY_REFRESH") {
      return NextResponse.json(
        { error: "no_token" },
        { status: 401, headers: { "Cache-Control": CACHE_NO_STORE } },
      );
    }
    return NextResponse.json({ error: msg || "Auth failed" }, { status: 401 });
  }

  try {
    const playback = await fetchCurrentPlayback(accessToken, { userId: user.id });
    recordSpotifySuccess();

    if (IS_DEV) {
      console.log("[playback] spotify /me/player", {
        hasPlayback: Boolean(playback),
        isPlaying: playback?.isPlaying ?? null,
        trackId: playback?.trackId ?? null,
        trackName: playback?.trackName ?? null,
        deviceName: playback?.deviceName ?? null,
      });
    }

    if (!playback) {
      const empty: SpotifyPlaybackApiResponse = { isPlaying: false };
      return playbackJson(empty, user.id, supabase);
    }

    try {
      const body = await enrichPlayback(
        supabase,
        user.id,
        accessToken,
        playback,
      );
      return playbackJson(body, user.id, supabase);
    } catch (enrichErr) {
      const enrichMsg =
        enrichErr instanceof Error ? enrichErr.message : String(enrichErr);
      if (IS_DEV) {
        console.warn("[playback] enrich failed, returning raw playback:", enrichMsg);
      }
      return playbackJson(playback, user.id, supabase);
    }
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
