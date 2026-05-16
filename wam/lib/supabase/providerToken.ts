import type { SupabaseClient } from "@supabase/supabase-js";

/** Spotify OAuth access token from the Supabase session (not client credentials). */
export async function requireProviderAccessToken(
  supabase: SupabaseClient,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.provider_token;
  if (!token) {
    throw new Error("MISSING_SPOTIFY_TOKEN");
  }
  return token;
}
