import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { persistSpotifyTokenMetadata } from "@/lib/spotify/spotifyTokenMetadata";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
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
      if (session?.provider_refresh_token) {
        await persistSpotifyTokenMetadata(supabase, {
          provider_refresh_token: session.provider_refresh_token,
          expiresIn: 3600,
        });
      }
      return response;
    }

    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/?error=auth&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
