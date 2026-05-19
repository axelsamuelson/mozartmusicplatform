import type { SupabaseClient } from "@supabase/supabase-js";

import { getValidProviderAccessToken } from "@/lib/spotify/userOAuthToken";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LiveSessionRow } from "@/lib/types/live";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class HostTokenExpiredError extends Error {
  constructor() {
    super("HOST_TOKEN_EXPIRED");
    this.name = "HostTokenExpiredError";
  }
}

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

async function refreshHostSpotifyToken(
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

function tokenNeedsRefresh(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return t < Date.now() + REFRESH_BUFFER_MS;
}

async function refreshAndPersistHostToken(
  session: Pick<
    LiveSessionRow,
    "id" | "host_provider_refresh_token" | "host_provider_token"
  >,
): Promise<string> {
  const refresh = session.host_provider_refresh_token?.trim();
  if (!refresh) throw new HostTokenExpiredError();

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    throw new HostTokenExpiredError();
  }

  const body = await refreshHostSpotifyToken(refresh);
  const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();
  const patch: Record<string, string> = {
    host_provider_token: body.access_token,
    host_token_expires_at: expiresAt,
  };
  if (body.refresh_token) {
    patch.host_provider_refresh_token = body.refresh_token;
  }

  const { error } = await admin
    .from("live_sessions")
    .update(patch)
    .eq("id", session.id);

  if (error) throw new Error(error.message);
  return body.access_token;
}

/**
 * Spotify access token for host playback writes (PUT /me/player/play).
 * Refreshes persisted host token when near expiry.
 */
export async function getHostToken(
  supabase: SupabaseClient,
  session: Pick<
    LiveSessionRow,
    | "id"
    | "host_user_id"
    | "host_provider_token"
    | "host_provider_refresh_token"
    | "host_token_expires_at"
  >,
  callerUserId?: string,
): Promise<string> {
  const stored = session.host_provider_token?.trim();
  if (stored && !tokenNeedsRefresh(session.host_token_expires_at)) {
    return stored;
  }

  if (stored && session.host_provider_refresh_token?.trim()) {
    try {
      return await refreshAndPersistHostToken(session);
    } catch (e) {
      if (e instanceof HostTokenExpiredError) throw e;
      /* fall through to caller token */
    }
  }

  if (callerUserId && callerUserId === session.host_user_id) {
    return getValidProviderAccessToken(supabase);
  }

  if (stored) return stored;

  throw new Error("HOST_TOKEN_MISSING");
}

/** Persist host Spotify token for server-side playback control. */
export async function persistHostProviderToken(
  admin: SupabaseClient,
  sessionId: string,
  accessToken: string,
  options?: { refreshToken?: string | null; expiresInSec?: number },
): Promise<void> {
  const patch: Record<string, string> = {
    host_provider_token: accessToken,
  };
  if (options?.refreshToken?.trim()) {
    patch.host_provider_refresh_token = options.refreshToken.trim();
  }
  if (options?.expiresInSec && options.expiresInSec > 0) {
    patch.host_token_expires_at = new Date(
      Date.now() + options.expiresInSec * 1000,
    ).toISOString();
  }

  const { error } = await admin.from("live_sessions").update(patch).eq("id", sessionId);
  if (error) throw new Error(error.message);
}
