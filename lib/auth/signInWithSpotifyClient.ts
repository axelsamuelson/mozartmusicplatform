"use client";

import { buildAuthCallbackUrl, getClientAppOrigin } from "@/lib/auth/appUrl";
import { createClient } from "@/lib/supabase/client";
import { SPOTIFY_OAUTH_SCOPES } from "@/lib/spotify/oauthScopes";

function logOAuthRedirectUrl(label: string, url: string | null | undefined): void {
  if (process.env.NODE_ENV !== "development") return;
  if (!url) {
    console.log(`${label}: (no url)`);
    return;
  }
  console.log(`${label}:`, url);
  try {
    const parsed = new URL(url);
    console.log(`${label} parsed:`, {
      host: parsed.host,
      scopes_param: parsed.searchParams.get("scopes"),
      scope_param: parsed.searchParams.get("scope"),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Client-side Spotify OAuth — scopes are sent from the browser in the authorize URL.
 * Callback is still handled server-side at /auth/callback.
 */
export async function signInWithSpotifyClient(nextPath?: string): Promise<void> {
  const supabase = createClient();
  const fromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("next")
      : null;
  const next =
    nextPath ??
    fromQuery ??
    (typeof window !== "undefined"
      ? sessionStorage.getItem("wam_pending_share")
      : null) ??
    "/dashboard";
  const origin = getClientAppOrigin();
  const redirectTo = buildAuthCallbackUrl(origin, next);

  console.log("OAuth options:", { scopes: SPOTIFY_OAUTH_SCOPES, redirectTo });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      scopes: SPOTIFY_OAUTH_SCOPES,
      redirectTo,
      queryParams: { show_dialog: "true" },
    },
  });

  console.log("OAuth result:", {
    error: error ? { message: error.message, status: error.status } : null,
    hasUrl: Boolean(data?.url),
  });

  logOAuthRedirectUrl("Redirect URL", data?.url);

  if (error) {
    window.location.assign("/?error=auth");
    return;
  }

  if (data?.url) {
    window.location.assign(data.url);
  } else {
    window.location.assign("/?error=auth");
  }
}
