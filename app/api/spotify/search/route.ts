import { NextResponse, type NextRequest } from "next/server";

import { CACHE_PRIVATE_300 } from "@/lib/spotify/cacheHeaders";
import {
  cachedSpotifyRequest,
  getStaleSpotifyCache,
  SPOTIFY_CACHE_TTL,
} from "@/lib/spotify/cache";
import {
  searchSpotify,
  SpotifyHttpError,
  type ItemType,
  type SpotifySearchRow,
} from "@/lib/spotify/api";
import { isSpotifyCircuitOpen } from "@/lib/spotify/rateLimiter";

const ALLOWED: ItemType[] = ["track", "album", "artist"];

function parseTypes(param: string | null): ItemType[] {
  if (!param || param.trim() === "") {
    return [...ALLOWED];
  }
  const parts = param.split(",").map((s) => s.trim().toLowerCase());
  const parsed = parts.filter((p): p is ItemType =>
    ALLOWED.includes(p as ItemType),
  );
  return parsed.length ? parsed : [...ALLOWED];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }
  if (q.length < 3) {
    return NextResponse.json(
      { error: "Query must be at least 3 characters" },
      { status: 400 },
    );
  }

  const rawLimit = searchParams.get("limit");
  let limit = rawLimit ? Number.parseInt(rawLimit, 10) : 10;
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const types = parseTypes(searchParams.get("type"));
  const cacheKey = `search:${q.toLowerCase()}:${types.join(",")}:${limit}`;

  try {
    const results = await cachedSpotifyRequest(
      cacheKey,
      SPOTIFY_CACHE_TTL.search,
      () => searchSpotify(q, types, limit),
    );
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": CACHE_PRIVATE_300 } },
    );
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === "SPOTIFY_CIRCUIT_OPEN_NO_CACHE" || isSpotifyCircuitOpen())
    ) {
      const stale = await getStaleSpotifyCache<SpotifySearchRow[]>(
        cacheKey,
      ).catch(() => null);
      if (stale) {
        return NextResponse.json(
          { results: stale },
          { headers: { "Cache-Control": CACHE_PRIVATE_300 } },
        );
      }
      return NextResponse.json(
        { results: [] },
        { headers: { "Cache-Control": CACHE_PRIVATE_300 } },
      );
    }
    if (e instanceof SpotifyHttpError) {
      const stale = await getStaleSpotifyCache<Awaited<ReturnType<typeof searchSpotify>>>(
        cacheKey,
      ).catch(() => null);
      if (stale) {
        return NextResponse.json(
          { results: stale },
          { headers: { "Cache-Control": CACHE_PRIVATE_300 } },
        );
      }
      return NextResponse.json(
        { error: e.message },
        { status: e.status >= 500 ? 502 : e.status },
      );
    }
    const message = e instanceof Error ? e.message : "Search failed";
    const status = message.includes("Missing SPOTIFY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
