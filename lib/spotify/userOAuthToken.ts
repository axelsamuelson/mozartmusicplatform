import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistSpotifyTokenMetadata,
  sessionProviderTokenIsFresh,
  spotifyRefreshFromUser,
} from "@/lib/spotify/spotifyTokenMetadata";

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
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Spotify refresh failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return (await res.json()) as SpotifyRefreshResponse;
}

/**
 * Spotify user access token: session provider_token when fresh, otherwise refresh
 * via provider_refresh_token (session or user_metadata from first login).
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

  if (sessionProviderTokenIsFresh(session.provider_token, user)) {
    return session.provider_token;
  }

  const refresh =
    session.provider_refresh_token ?? spotifyRefreshFromUser(user);

  if (!refresh) {
    throw new Error("MISSING_SPOTIFY_REFRESH");
  }

  const data = await refreshSpotifyUserToken(refresh);

  await persistSpotifyTokenMetadata(supabase, {
    provider_refresh_token: data.refresh_token ?? refresh,
    expiresIn: data.expires_in,
  });

  return data.access_token;
}
