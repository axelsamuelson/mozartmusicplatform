import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistSpotifyTokenMetadata,
  sessionProviderTokenIsFresh,
  spotifyRefreshFromUser,
} from "@/lib/spotify/spotifyTokenMetadata";
import {
  isSpotify429Error,
  isSpotifyCircuitOpen,
  recordSpotify429,
  SPOTIFY_CIRCUIT_UNAVAILABLE_MSG,
} from "@/lib/spotify/rateLimiter";
import {
  clearSpotifyTokenCache,
  getCachedSpotifyAccess,
  getInflightSpotifyRefresh,
  markSpotifyMetadataPersisted,
  setCachedSpotifyAccess,
  setInflightSpotifyRefresh,
} from "@/lib/spotify/tokenRefreshCache";

type SpotifyRefreshResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

async function spotifyClientCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MISSING_SPOTIFY_OAUTH_ENV");
  }
  return { clientId, clientSecret };
}

async function refreshSpotifyUserToken(
  refreshToken: string,
): Promise<SpotifyRefreshResponse> {
  const { clientId, clientSecret } = await spotifyClientCredentials();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  if (res.status === 429) {
    recordSpotify429();
    throw new Error("Spotify rate limited — wait a few minutes before trying again");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Spotify refresh failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return (await res.json()) as SpotifyRefreshResponse;
}

/** Always persist after Spotify refresh so metadata survives session restore. */
async function persistAfterSpotifyRefresh(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string,
  refreshed: SpotifyRefreshResponse,
): Promise<void> {
  try {
    await persistSpotifyTokenMetadata(supabase, {
      provider_refresh_token: refreshed.refresh_token ?? refreshToken,
      expiresIn: refreshed.expires_in ?? 3600,
    });
    markSpotifyMetadataPersisted(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[token] Failed to persist after refresh:", msg);
  }
}

async function refreshAndCache(
  supabase: SupabaseClient,
  userId: string,
  refresh: string,
): Promise<string> {
  try {
    const data = await refreshSpotifyUserToken(refresh);
    setCachedSpotifyAccess(userId, data.access_token, data.expires_in);
    await persistAfterSpotifyRefresh(supabase, userId, refresh, data);
    return data.access_token;
  } catch (e) {
    if (isSpotify429Error(e)) {
      recordSpotify429();
    }
    clearSpotifyTokenCache(userId);
    throw e;
  }
}

/**
 * Spotify user access token: in-memory cache → fresh session token → refresh.
 * Refresh token order: session.provider_refresh_token → user_metadata.spotify_refresh_token.
 */
export async function getValidProviderAccessToken(
  supabase: SupabaseClient,
): Promise<string> {
  const [{ data: { session } }, { data: { user } }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (!session) {
    throw new Error("MISSING_SPOTIFY_TOKEN");
  }

  const userId = user?.id ?? session.user.id;

  const cached = getCachedSpotifyAccess(userId);
  if (cached) return cached;

  if (isSpotifyCircuitOpen()) {
    if (session.provider_token) {
      return session.provider_token;
    }
    throw new Error(SPOTIFY_CIRCUIT_UNAVAILABLE_MSG);
  }

  if (sessionProviderTokenIsFresh(session.provider_token, user)) {
    return session.provider_token;
  }

  const inflight = getInflightSpotifyRefresh(userId);
  if (inflight) return inflight;

  const refreshFromSession = session.provider_refresh_token?.trim() || null;
  const refreshFromMetadata = spotifyRefreshFromUser(user);
  const refresh = refreshFromSession ?? refreshFromMetadata;

  if (!refresh) {
    if (session.provider_token) {
      return session.provider_token;
    }
    throw new Error("MISSING_SPOTIFY_REFRESH");
  }

  const promise = refreshAndCache(supabase, userId, refresh);
  setInflightSpotifyRefresh(userId, promise);
  return promise;
}
