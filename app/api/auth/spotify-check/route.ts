import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public diagnostic: verifies Spotify app credentials in .env.local work.
 * Does not test user login / User Management allowlist.
 */
export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      ok: false,
      error: "SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET missing in server env",
    });
  }

  let spotifyTokenOk = false;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    spotifyTokenOk = res.ok;
  } catch {
    spotifyTokenOk = false;
  }

  let supabaseClientId: string | null = null;
  try {
    const authorize = new URL(`${supabaseUrl}/auth/v1/authorize`);
    authorize.searchParams.set("provider", "spotify");
    authorize.searchParams.set(
      "redirect_to",
      "http://localhost:3000/auth/callback",
    );
    const res = await fetch(authorize.toString(), { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    const match = location.match(/client_id=([^&]+)/);
    supabaseClientId = match?.[1] ?? null;
  } catch {
    supabaseClientId = null;
  }

  const clientIdsMatch =
    supabaseClientId != null && supabaseClientId === clientId;

  return NextResponse.json({
    ok: spotifyTokenOk && clientIdsMatch,
    spotify_app_credentials: spotifyTokenOk ? "valid" : "invalid",
    env_client_id: clientId,
    supabase_oauth_client_id: supabaseClientId,
    client_ids_match: clientIdsMatch,
    supabase_project: supabaseUrl?.replace("https://", "").replace(".supabase.co", ""),
    hint: clientIdsMatch
      ? "Client ID matches .env.local. If login still fails: re-paste Spotify Client Secret in Supabase (Providers → Spotify) — a stale secret causes 'user profile from external provider'. User Management allowlist must include your Spotify email."
      : "Supabase Spotify provider uses a different Client ID than .env.local — fix in Supabase Dashboard → Authentication → Providers → Spotify.",
  });
}
