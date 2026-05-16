import { NextResponse } from "next/server";

import { getValidProviderAccessToken } from "@/lib/spotify/userOAuthToken";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Fresh Spotify user access token for Web Playback SDK (browser). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const access_token = await getValidProviderAccessToken(supabase);
    return NextResponse.json(
      { access_token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token error";
    if (msg === "MISSING_SPOTIFY_TOKEN" || msg === "MISSING_SPOTIFY_REFRESH") {
      return NextResponse.json(
        {
          error:
            "Spotify session missing or expired. Sign out and sign in with Spotify again.",
        },
        { status: 401 },
      );
    }
    if (msg === "MISSING_SPOTIFY_OAUTH_ENV") {
      return NextResponse.json(
        { error: "Server missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
