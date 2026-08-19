import { NextResponse, type NextRequest } from "next/server";

import {
  artistScoreFromTrackRatings,
  isTrackRatingForArtist,
} from "@/lib/profile/aggregateRatings";
import { loadAllUserRatingsSlim } from "@/lib/ratings/normalize";
import { CACHE_PRIVATE_60 } from "@/lib/spotify/cacheHeaders";
import {
  cachedSpotifyRequest,
  getStaleSpotifyCache,
  SPOTIFY_CACHE_TTL,
} from "@/lib/spotify/cache";
import {
  fetchArtistAlbums,
  fetchArtistTopTracks,
  fetchSpotifyItem,
  SpotifyHttpError,
  type ArtistAlbumRow,
  type ArtistTopTrack,
  type CachedItemPayload,
} from "@/lib/spotify/api";
import {
  isSpotifyCircuitOpen,
  SPOTIFY_CIRCUIT_OPEN_ERROR,
} from "@/lib/spotify/rateLimiter";
import { createClient } from "@/lib/supabase/server";

async function optionalCatalog<T>(
  key: string,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await cachedSpotifyRequest(key, SPOTIFY_CACHE_TTL.artistCatalog, fetcher);
  } catch {
    const stale = await getStaleSpotifyCache<T>(key).catch(() => null);
    return stale ?? fallback;
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const artistId = id?.trim();
  if (!artistId) {
    return NextResponse.json({ error: "Missing artist id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `item:${artistId}:artist`;
  let payload: CachedItemPayload;
  try {
    payload = await cachedSpotifyRequest(cacheKey, SPOTIFY_CACHE_TTL.item, () =>
      fetchSpotifyItem(artistId, "artist"),
    );
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === SPOTIFY_CIRCUIT_OPEN_ERROR ||
        e.message === "SPOTIFY_CIRCUIT_OPEN_NO_CACHE" ||
        isSpotifyCircuitOpen())
    ) {
      const stale = await getStaleSpotifyCache<CachedItemPayload>(cacheKey).catch(
        () => null,
      );
      if (!stale) {
        return NextResponse.json(
          { error: "Spotify temporarily unavailable" },
          { status: 503 },
        );
      }
      payload = stale;
    } else if (e instanceof SpotifyHttpError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status === 404 ? 404 : e.status >= 500 ? 502 : e.status },
      );
    } else {
      const message = e instanceof Error ? e.message : "Spotify request failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const now = new Date().toISOString();
  await supabase.from("cached_items").upsert(
    {
      spotify_id: payload.spotify_id,
      type: payload.type,
      name: payload.name,
      artist_name: payload.artist_name,
      image_url: payload.image_url,
      preview_url: payload.preview_url,
      genres: payload.genres,
      primary_artist_id: null,
      release_year: payload.release_year ?? null,
      cached_at: now,
    },
    { onConflict: "spotify_id" },
  );

  let topTracks: ArtistTopTrack[];
  let albums: ArtistAlbumRow[];
  let ratings: Awaited<ReturnType<typeof loadAllUserRatingsSlim>>;
  try {
    [topTracks, albums, ratings] = await Promise.all([
      optionalCatalog<ArtistTopTrack[]>(
        `artist-top-tracks:${artistId}`,
        () => fetchArtistTopTracks(artistId),
        [],
      ),
      optionalCatalog<ArtistAlbumRow[]>(
        `artist-albums:${artistId}`,
        () => fetchArtistAlbums(artistId, 10),
        [],
      ),
      loadAllUserRatingsSlim(supabase, user.id, "track"),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load ratings";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const artistRatings = ratings
    .filter((r) => isTrackRatingForArtist(r, payload.spotify_id, payload.name))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.item?.name ?? "").localeCompare(b.item?.name ?? "", undefined, {
          sensitivity: "base",
        }),
    );

  const stats = artistScoreFromTrackRatings(artistRatings);

  return NextResponse.json(
    {
      artist: {
        spotify_id: payload.spotify_id,
        name: payload.name,
        image_url: payload.image_url,
        genres: payload.genres ?? [],
      },
      stats,
      ratings: artistRatings,
      top_tracks: topTracks,
      albums,
    },
    { headers: { "Cache-Control": CACHE_PRIVATE_60 } },
  );
}
