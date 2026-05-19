import type { SupabaseClient } from "@supabase/supabase-js";

import { getValidProviderAccessToken } from "@/lib/spotify/userOAuthToken";
import type { LiveSessionRow } from "@/lib/types/live";

/**
 * Spotify access token for host playback writes (PUT /me/player/play).
 * Prefers persisted host_provider_token; falls back when caller is the host.
 */
export async function getHostToken(
  supabase: SupabaseClient,
  session: Pick<LiveSessionRow, "host_user_id" | "host_provider_token">,
  callerUserId?: string,
): Promise<string> {
  if (session.host_provider_token?.trim()) {
    return session.host_provider_token.trim();
  }

  if (callerUserId && callerUserId === session.host_user_id) {
    return getValidProviderAccessToken(supabase);
  }

  throw new Error("HOST_TOKEN_MISSING");
}

/** Persist host Spotify token for server-side playback control. */
export async function persistHostProviderToken(
  admin: SupabaseClient,
  sessionId: string,
  accessToken: string,
): Promise<void> {
  const { error } = await admin
    .from("live_sessions")
    .update({ host_provider_token: accessToken })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
