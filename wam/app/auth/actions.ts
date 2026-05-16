"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const SPOTIFY_SCOPES =
  "user-read-private user-read-email playlist-read-private playlist-modify-public playlist-modify-private streaming user-read-playback-state user-modify-playback-state user-read-currently-playing";

async function appOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signInWithSpotify() {
  const supabase = await createClient();
  const base = await appOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      redirectTo: `${base}/auth/callback`,
      scopes: SPOTIFY_SCOPES,
    },
  });

  if (error || !data.url) {
    redirect("/?error=auth");
  }

  redirect(data.url);
}
