import type { SupabaseClient, User } from "@supabase/supabase-js";

export const SPOTIFY_REFRESH_METADATA_KEY = "spotify_refresh_token";
export const SPOTIFY_TOKEN_EXPIRES_METADATA_KEY = "spotify_token_expires_at";

const TOKEN_EXPIRY_BUFFER_SEC = 120;

export function spotifyRefreshFromUser(user: User | null | undefined): string | null {
  const token = user?.user_metadata?.[SPOTIFY_REFRESH_METADATA_KEY];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function spotifyTokenExpiresAt(user: User | null | undefined): number {
  const raw = user?.user_metadata?.[SPOTIFY_TOKEN_EXPIRES_METADATA_KEY];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

export function sessionProviderTokenIsFresh(
  providerToken: string | null | undefined,
  user: User | null | undefined,
): providerToken is string {
  if (!providerToken) return false;
  const expiresAt = spotifyTokenExpiresAt(user);
  if (expiresAt <= 0) return true;
  return expiresAt > Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_BUFFER_SEC;
}

/** True when we can refresh Spotify (session or persisted user_metadata). */
export function hasSpotifyRefreshToken(
  session: { provider_refresh_token?: string | null } | null | undefined,
  user: User | null | undefined,
): boolean {
  return Boolean(
    session?.provider_refresh_token?.length || spotifyRefreshFromUser(user),
  );
}

export function hasSpotifyProviderCredentials(
  session:
    | { provider_token?: string | null; provider_refresh_token?: string | null }
    | null
    | undefined,
  user: User | null | undefined,
): boolean {
  return Boolean(session?.provider_token) || hasSpotifyRefreshToken(session, user);
}

/** Persist Spotify refresh + expiry in user_metadata (survives Supabase session refresh). */
export async function persistSpotifyTokenMetadata(
  supabase: SupabaseClient,
  opts: {
    provider_refresh_token?: string | null;
    expiresIn?: number;
  },
): Promise<void> {
  const data: Record<string, string | number> = {};
  if (opts.provider_refresh_token) {
    data[SPOTIFY_REFRESH_METADATA_KEY] = opts.provider_refresh_token;
  }
  if (typeof opts.expiresIn === "number" && opts.expiresIn > 0) {
    data[SPOTIFY_TOKEN_EXPIRES_METADATA_KEY] =
      Math.floor(Date.now() / 1000) + opts.expiresIn;
  }
  if (Object.keys(data).length === 0) return;

  const { error } = await supabase.auth.updateUser({ data });
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[spotify] persistSpotifyTokenMetadata:", error.message);
  }
}
