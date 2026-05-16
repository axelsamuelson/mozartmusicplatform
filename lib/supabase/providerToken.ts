import type { SupabaseClient } from "@supabase/supabase-js";

import { getValidProviderAccessToken } from "@/lib/spotify/userOAuthToken";

/** Spotify user access token (refreshed server-side when expired). */
export async function requireProviderAccessToken(
  supabase: SupabaseClient,
): Promise<string> {
  return getValidProviderAccessToken(supabase);
}
