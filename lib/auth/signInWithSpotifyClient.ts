"use client";

import { buildAuthCallbackUrl } from "@/lib/auth/appUrl";
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
  if (typeof window === "undefined") {
    throw new Error("signInWithSpotifyClient must run in the browser");
  }

  const supabase = createClient();
  const fromQuery = new URLSearchParams(window.location.search).get("next");
  const next =
    nextPath ??
    fromQuery ??
    sessionStorage.getItem("wam_pending_share") ??
    "/dashboard";
  const redirectTo = buildAuthCallbackUrl(window.location.origin, next);

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
