"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Extra scopes for Premium playback — only via upgradeSpotifyPlayback().
 * Login uses Supabase defaults (user-read-email) to avoid scope conflicts on /me.
 *
 * Also add these in Supabase Dashboard → Auth → Providers → Spotify → Scopes
 * (comma-separated):
 * user-read-private,playlist-read-private,playlist-modify-public,playlist-modify-private,streaming,user-read-playback-state,user-modify-playback-state,user-read-currently-playing
 */
const SPOTIFY_EXTRA_SCOPES =
  "user-read-private playlist-read-private playlist-modify-public playlist-modify-private streaming user-read-playback-state user-modify-playback-state user-read-currently-playing";

async function appOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function startSpotifyOAuth(scopes?: string) {
  const supabase = await createClient();
  const base = await appOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      redirectTo: `${base}/auth/callback`,
      ...(scopes ? { scopes } : {}),
      queryParams: { show_dialog: "true" },
    },
  });

  if (error || !data.url) {
    redirect("/?error=auth");
  }

  redirect(data.url);
}

/** Minimal OAuth — only Supabase default scopes (user-read-email). Most reliable for /me. */
export async function signInWithSpotify() {
  await startSpotifyOAuth();
}

/** Request playlist + playback scopes (run once after login if player/playlists need it). */
export async function upgradeSpotifyPlayback() {
  await startSpotifyOAuth(SPOTIFY_EXTRA_SCOPES);
}
