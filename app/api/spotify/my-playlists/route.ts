import { NextResponse } from "next/server";

import { CACHE_PRIVATE_60 } from "@/lib/spotify/cacheHeaders";
import { loadUserRatedTrackSpotifyIds } from "@/lib/ratings/userRatedTrackIds";
import {
  loadUserPlaylistTracksMap,
  statsFromTrackIds,
} from "@/lib/spotify/playlistTracksDb";
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
    const [summaries, tracksMap, ratedTrackIds] = await Promise.all([
      fetchOwnedMyPlaylistSummaries(accessToken),
      loadUserPlaylistTracksMap(supabase, user.id),
      loadUserRatedTrackSpotifyIds(supabase, user.id),
    ]);

    const playlists: SpotifyPlaylistListItem[] = summaries.map((pl) => {
      const cached = tracksMap.get(pl.id);
      const total_tracks = pl.total_tracks;

      if (cached) {
        const stats = statsFromTrackIds(
          cached.track_ids,
          cached.total_tracks,
          ratedTrackIds,
        );
        const countsMatch = cached.total_tracks === total_tracks;
        return {
          id: pl.id,
          name: pl.name,
          image_url: pl.image_url,
          owner: pl.owner_label,
          total_tracks,
          rated_count: stats.rated_count,
          unrated_count: stats.unrated_count,
          rated_percent: stats.rated_percent,
          needs_sync: !countsMatch,
          missing_tracks_cache: false,
        };
      }

      return {
        id: pl.id,
        name: pl.name,
        image_url: pl.image_url,
        owner: pl.owner_label,
        total_tracks,
        rated_count: null,
        unrated_count: null,
        rated_percent: null,
        needs_sync: true,
        missing_tracks_cache: true,
      };
    });

    return NextResponse.json(
      { playlists },
      { headers: { "Cache-Control": CACHE_PRIVATE_60 } },
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
          error: `${message} — ensure Spotify login includes playlist read access (e.g. playlist-read-private).`,
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
