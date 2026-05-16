import { NextResponse } from "next/server";

import { fetchOwnedMyPlaylistSummaries } from "@/lib/spotify/userLibraryPlaylists";
import type { SpotifyPlaylistListItem } from "@/lib/types/spotifyLibrary";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accessToken: string;
  try {
    accessToken = await requireProviderAccessToken(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "MISSING_SPOTIFY_TOKEN") {
      return NextResponse.json(
        { error: "Missing Spotify token. Sign out and sign in with Spotify again." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg || "Auth failed" }, { status: 401 });
  }

  try {
    const summaries = await fetchOwnedMyPlaylistSummaries(accessToken);

    const playlists: SpotifyPlaylistListItem[] = summaries.map((pl) => ({
      id: pl.id,
      name: pl.name,
      image_url: pl.image_url,
      owner: pl.owner_label,
      total_tracks: pl.total_tracks,
    }));

    return NextResponse.json(
      { playlists },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load Spotify playlists";

    const spotifyStatus = /^Spotify API (\d{3}):/.exec(message)?.[1];
    if (spotifyStatus === "401") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (spotifyStatus === "403") {
      return NextResponse.json(
        {
          error:
            `${message} — ensure Spotify login includes playlist read access (e.g. playlist-read-private).`,
        },
        { status: 403 },
      );
    }
    if (spotifyStatus === "429") {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
