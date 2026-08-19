import { NextResponse } from "next/server";

import { CACHE_PRIVATE_60 } from "@/lib/spotify/cacheHeaders";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

interface SpotifyRecentItem {
  track: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: { images: { url: string }[] };
  };
  played_at: string;
}

export interface RecentTrack {
  spotifyId: string;
  name: string;
  artistName: string;
  artistId: string | null;
  imageUrl: string | null;
  playedAt: string;
  score: number | null;
}

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
  } catch {
    return NextResponse.json({ error: "no_token" }, { status: 401 });
  }

  const res = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=20",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Spotify ${res.status}: ${text.slice(0, 200)}` },
      { status: res.status },
    );
  }

  const data = (await res.json()) as { items: SpotifyRecentItem[] };

  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  const itemMap = new Map<string, SpotifyRecentItem>();
  for (const item of data.items) {
    if (seen.has(item.track.id)) continue;
    seen.add(item.track.id);
    uniqueIds.push(item.track.id);
    itemMap.set(item.track.id, item);
  }

  const scoreMap = new Map<string, number>();
  if (uniqueIds.length > 0) {
    const { data: ratings } = await supabase
      .from("ratings")
      .select("spotify_id, score")
      .eq("user_id", user.id)
      .in("spotify_id", uniqueIds);
    if (ratings) {
      for (const r of ratings) {
        scoreMap.set(r.spotify_id, r.score);
      }
    }
  }

  const tracks: RecentTrack[] = uniqueIds.map((id) => {
    const item = itemMap.get(id)!;
    return {
      spotifyId: id,
      name: item.track.name,
      artistName: item.track.artists[0]?.name ?? "Unknown",
      artistId: item.track.artists[0]?.id ?? null,
      imageUrl: item.track.album.images[item.track.album.images.length - 1]?.url ?? null,
      playedAt: item.played_at,
      score: scoreMap.get(id) ?? null,
    };
  });

  return NextResponse.json(
    { tracks },
    { headers: { "Cache-Control": CACHE_PRIVATE_60 } },
  );
}
