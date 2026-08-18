import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  persistSpotifyTokenMetadata,
  sessionProviderTokenIsFresh,
  spotifyRefreshFromUser,
  spotifyTokenExpiresAt,
} from "@/lib/spotify/spotifyTokenMetadata";
import {
  isSpotify429Error,
  isSpotifyCircuitOpen,
  recordSpotify429,
  SPOTIFY_CIRCUIT_UNAVAILABLE_MSG,
} from "@/lib/spotify/rateLimiter";
import {
  getCachedSpotifyAccess,
  getCachedSpotifyAccessTtlSec,
  getInflightSpotifyRefresh,
  getStaleSpotifyAccess,
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
    const stale = getStaleSpotifyAccess(userId);
    if (stale) return stale;
    throw e;
  }
}

function cacheKnownAccessToken(
  userId: string,
  accessToken: string,
  user: User,
): void {
  const expiresAt = spotifyTokenExpiresAt(user);
  const now = Math.floor(Date.now() / 1000);
  const ttl = expiresAt > now ? expiresAt - now : 3600;
  setCachedSpotifyAccess(userId, accessToken, Math.max(60, ttl));
}

/**
 * Spotify user access token: in-memory cache → fresh session token → refresh.
 * Works even when `getSession()` has dropped `provider_token` (common after
 * Supabase cookie refresh) as long as user_metadata still has a refresh token.
 */
export async function getValidProviderAccessToken(
  supabase: SupabaseClient,
): Promise<string> {
  const [{ data: { session } }, { data: { user } }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (!user) {
    throw new Error("MISSING_SPOTIFY_TOKEN");
  }

  const userId = user.id;

  const cached = getCachedSpotifyAccess(userId);
  if (cached) return cached;

  if (isSpotifyCircuitOpen()) {
    const fallback =
      getStaleSpotifyAccess(userId) ?? session?.provider_token ?? null;
    if (fallback) return fallback;
    throw new Error(SPOTIFY_CIRCUIT_UNAVAILABLE_MSG);
  }

  const sessionToken = session?.provider_token;
  if (sessionProviderTokenIsFresh(sessionToken, user)) {
    cacheKnownAccessToken(userId, sessionToken, user);
    return sessionToken;
  }

  const inflight = getInflightSpotifyRefresh(userId);
  if (inflight) return inflight;

  const refreshFromSession = session?.provider_refresh_token?.trim() || null;
  const refreshFromMetadata = spotifyRefreshFromUser(user);
  const refresh = refreshFromSession ?? refreshFromMetadata;

  if (!refresh) {
    const fallback =
      getStaleSpotifyAccess(userId) ?? session?.provider_token ?? null;
    if (fallback) {
      setCachedSpotifyAccess(userId, fallback, 120);
      return fallback;
    }
    throw new Error("MISSING_SPOTIFY_REFRESH");
  }

  const promise = refreshAndCache(supabase, userId, refresh).catch((e) => {
    const fallback =
      getStaleSpotifyAccess(userId) ?? session?.provider_token ?? null;
    if (fallback) {
      setCachedSpotifyAccess(userId, fallback, 120);
      return fallback;
    }
    throw e;
  });
  setInflightSpotifyRefresh(userId, promise);
  return promise;
}

export function providerAccessTokenTtlSec(userId: string): number {
  return getCachedSpotifyAccessTtlSec(userId) ?? 3600;
}
