import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getRequestAppOrigin } from "@/lib/auth/appUrl";
import { persistSpotifyTokenMetadata } from "@/lib/spotify/spotifyTokenMetadata";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestAppOrigin(request);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    let response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const providerRefreshToken = session?.provider_refresh_token ?? null;
      const providerToken = session?.provider_token ?? null;

      if (providerToken) {
        await persistSpotifyTokenMetadata(supabase, {
          provider_refresh_token: providerRefreshToken,
          expiresIn: 3600,
        });
      }

      if (!providerRefreshToken) {
        console.warn(
          "[auth/callback] No provider_refresh_token in session — user may need to re-auth after token expiry",
        );
      }

      return response;
    }

    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/?error=auth&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
