import { NextResponse, type NextRequest } from "next/server";

import { CACHE_PRIVATE_300 } from "@/lib/spotify/cacheHeaders";
import {
  searchSpotify,
  SpotifyHttpError,
  type ItemType,
} from "@/lib/spotify/api";

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

  try {
    const results = await searchSpotify(q, types, limit);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": CACHE_PRIVATE_300 } },
    );
  } catch (e) {
    if (e instanceof SpotifyHttpError) {
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
