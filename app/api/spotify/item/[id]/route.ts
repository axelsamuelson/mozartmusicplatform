import { NextResponse, type NextRequest } from "next/server";

import { CACHE_PRIVATE_86400 } from "@/lib/spotify/cacheHeaders";
import {
  cachedSpotifyRequest,
  getStaleSpotifyCache,
  SPOTIFY_CACHE_TTL,
} from "@/lib/spotify/cache";
import {
  fetchSpotifyItem,
  SpotifyHttpError,
  type CachedItemPayload,
  type ItemType,
} from "@/lib/spotify/api";
import {
  isSpotifyCircuitOpen,
  SPOTIFY_CIRCUIT_OPEN_ERROR,
} from "@/lib/spotify/rateLimiter";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: ItemType[] = ["track", "album", "artist"];

async function loadCachedItemFromDb(
  supabase: Awaited<ReturnType<typeof createClient>>,
  spotifyId: string,
) {
  const { data } = await supabase
    .from("cached_items")
    .select(
      "spotify_id, type, name, artist_name, image_url, preview_url, genres, primary_artist_id, cached_at",
    )
    .eq("spotify_id", spotifyId)
    .maybeSingle();
  return data;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const typeParam = request.nextUrl.searchParams.get("type")?.toLowerCase();

  if (!typeParam || !ALLOWED.includes(typeParam as ItemType)) {
    return NextResponse.json(
      { error: "Query parameter type is required (track, album, or artist)" },
      { status: 400 },
    );
  }
  const type = typeParam as ItemType;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `item:${id}:${type}`;

  let payload: CachedItemPayload;
  try {
    payload = await cachedSpotifyRequest(
      cacheKey,
      SPOTIFY_CACHE_TTL.item,
      () => fetchSpotifyItem(id, type),
    );
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === SPOTIFY_CIRCUIT_OPEN_ERROR ||
        e.message === "SPOTIFY_CIRCUIT_OPEN_NO_CACHE" ||
        isSpotifyCircuitOpen())
    ) {
      const stalePayload = await getStaleSpotifyCache<CachedItemPayload>(
        cacheKey,
      ).catch(() => null);
      if (stalePayload) {
        payload = stalePayload;
      } else {
        const dbItem = await loadCachedItemFromDb(supabase, id);
        if (dbItem) {
          return NextResponse.json(
            { item: dbItem },
            { headers: { "Cache-Control": CACHE_PRIVATE_86400 } },
          );
        }
        return NextResponse.json(
          { error: "Spotify temporarily unavailable" },
          { status: 503 },
        );
      }
    } else if (e instanceof SpotifyHttpError) {
      const stalePayload = await getStaleSpotifyCache<CachedItemPayload>(
        cacheKey,
      ).catch(() => null);
      if (stalePayload) {
        payload = stalePayload;
      } else {
        return NextResponse.json(
          { error: e.message },
          { status: e.status === 404 ? 404 : e.status >= 500 ? 502 : e.status },
        );
      }
    } else {
      const message = e instanceof Error ? e.message : "Spotify request failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cached_items")
    .upsert(
      {
        spotify_id: payload.spotify_id,
        type: payload.type,
        name: payload.name,
        artist_name: payload.artist_name,
        image_url: payload.image_url,
        preview_url: payload.preview_url,
        genres: payload.genres,
        primary_artist_id: payload.primary_artist_id ?? null,
        cached_at: now,
      },
      { onConflict: "spotify_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { item: data },
    { headers: { "Cache-Control": CACHE_PRIVATE_86400 } },
  );
}
