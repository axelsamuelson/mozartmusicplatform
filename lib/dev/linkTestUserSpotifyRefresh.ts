import { createAdminClient } from "@/lib/supabase/admin";
import {
  SPOTIFY_REFRESH_METADATA_KEY,
  SPOTIFY_TOKEN_EXPIRES_METADATA_KEY,
} from "@/lib/spotify/spotifyTokenMetadata";
import { isLiveSimulateEnabled } from "@/lib/dev/liveSimulateGate";

export type LinkTestUserSpotifyResult =
  | { linked: true; userId: string; email: string }
  | { linked: false; reason: string };

/** Read refresh token from local env (never commit this value). */
export function testSpotifyRefreshTokenFromEnv(): string | null {
  const token =
    process.env.WAM_TEST_SPOTIFY_REFRESH_TOKEN?.trim() ||
    process.env.TEST_SPOTIFY_PROVIDER_REFRESH_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

async function verifySpotifyRefresh(refreshToken: string): Promise<void> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET");
  }
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
    throw new Error(`Spotify refresh verify failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

/**
 * Copy WAM_TEST_SPOTIFY_REFRESH_TOKEN onto a dev test user's user_metadata
 * so playback/playlist APIs work in smoke and e2e tests.
 */
export async function linkTestUserSpotifyRefresh(
  userId: string,
  email: string,
): Promise<LinkTestUserSpotifyResult> {
  if (!isLiveSimulateEnabled()) {
    return { linked: false, reason: "Dev simulate disabled" };
  }

  const refreshToken = testSpotifyRefreshTokenFromEnv();
  if (!refreshToken) {
    return {
      linked: false,
      reason:
        "Set WAM_TEST_SPOTIFY_REFRESH_TOKEN in .env.local (Spotify refresh token from your account)",
    };
  }

  await verifySpotifyRefresh(refreshToken);

  const admin = createAdminClient();
  const { data: userData, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !userData.user) {
    return { linked: false, reason: getErr?.message ?? "User not found" };
  }

  const existing = userData.user.user_metadata ?? {};
  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existing,
      [SPOTIFY_REFRESH_METADATA_KEY]: refreshToken,
      [SPOTIFY_TOKEN_EXPIRES_METADATA_KEY]: Math.floor(Date.now() / 1000) + 3600,
    },
  });
  if (upErr) {
    return { linked: false, reason: upErr.message };
  }

  return { linked: true, userId, email };
}
