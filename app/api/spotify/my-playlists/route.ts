import { NextResponse } from "next/server";

import { loadUserRatedTrackSpotifyIds } from "@/lib/ratings/userRatedTrackIds";
import {
  cachedSpotifyRequest,
  getStaleSpotifyCache,
  SPOTIFY_CACHE_TTL,
} from "@/lib/spotify/cache";
import {
  loadUserPlaylistTracksMap,
  statsFromTrackIds,
} from "@/lib/spotify/playlistTracksDb";
import {
  fetchOwnedMyPlaylistSummaries,
  type SpotifyMyPlaylistSummary,
} from "@/lib/spotify/userLibraryPlaylists";
import type { SpotifyPlaylistListItem } from "@/lib/types/spotifyLibrary";
import {
  isSpotifyCircuitOpen,
  SPOTIFY_CIRCUIT_OPEN_ERROR,
} from "@/lib/spotify/rateLimiter";
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

  const cacheKey = `playlists:v2:${user.id}`;

  let summaries: SpotifyMyPlaylistSummary[];
  try {
    summaries = await cachedSpotifyRequest(
      cacheKey,
      SPOTIFY_CACHE_TTL.userPlaylists,
      () => fetchOwnedMyPlaylistSummaries(accessToken),
    );
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === SPOTIFY_CIRCUIT_OPEN_ERROR ||
        e.message === "SPOTIFY_CIRCUIT_OPEN_NO_CACHE" ||
        isSpotifyCircuitOpen())
    ) {
      const stale = await getStaleSpotifyCache<SpotifyMyPlaylistSummary[]>(
        cacheKey,
      ).catch(() => null);
      if (!stale?.length) {
        return NextResponse.json(
          { error: "Spotify temporarily unavailable. Try again shortly." },
          { status: 503 },
        );
      }
      summaries = stale;
    } else {
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
        const stale = await getStaleSpotifyCache<SpotifyMyPlaylistSummary[]>(
          cacheKey,
        ).catch(() => null);
        if (stale?.length) {
          summaries = stale;
        } else {
          return NextResponse.json({ error: message }, { status: 429 });
        }
      } else {
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }
  }

  try {
    const [tracksMap, ratedTrackIds] = await Promise.all([
      loadUserPlaylistTracksMap(supabase, user.id),
      loadUserRatedTrackSpotifyIds(supabase, user.id),
    ]);

    const playlists: SpotifyPlaylistListItem[] = summaries.map((pl) => {
      const cached = tracksMap.get(pl.id);
      const total_tracks = cached
        ? Math.max(pl.total_tracks, cached.total_tracks)
        : pl.total_tracks;

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
      {
        headers: {
          "Cache-Control": `private, max-age=${SPOTIFY_CACHE_TTL.userPlaylists}`,
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load playlists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
