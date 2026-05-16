import { NextResponse, type NextRequest } from "next/server";

import { fetchSpotifyItem, SpotifyHttpError, type ItemType } from "@/lib/spotify/api";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: ItemType[] = ["track", "album", "artist"];

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

  let payload;
  try {
    payload = await fetchSpotifyItem(id, type);
  } catch (e) {
    if (e instanceof SpotifyHttpError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status === 404 ? 404 : e.status >= 500 ? 502 : e.status },
      );
    }
    const message = e instanceof Error ? e.message : "Spotify request failed";
    return NextResponse.json({ error: message }, { status: 502 });
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

  return NextResponse.json({ item: data });
}
