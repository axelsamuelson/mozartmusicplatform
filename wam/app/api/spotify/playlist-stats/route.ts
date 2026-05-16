import { type NextRequest, NextResponse } from "next/server";

import { loadUserRatedTrackSpotifyIds } from "@/lib/ratings/userRatedTrackIds";
import { fetchPlaylistTrackStats } from "@/lib/spotify/userLibraryPlaylists";
import type { SpotifyPlaylistStatsPayload } from "@/lib/types/spotifyLibrary";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

/** Per-user rated track ids cache to avoid N DB reads when many playlist-stats requests run in parallel. */
const ratedIdsCache = new Map<string, { ids: Set<string>; ts: number }>();
const RATED_IDS_TTL_MS = 120_000;

async function ratedTrackIdsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const hit = ratedIdsCache.get(userId);
  const now = Date.now();
  if (hit && now - hit.ts < RATED_IDS_TTL_MS) {
    return hit.ids;
  }
  const ids = await loadUserRatedTrackSpotifyIds(supabase, userId);
  ratedIdsCache.set(userId, { ids, ts: now });
  return ids;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlistId = request.nextUrl.searchParams.get("id")?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: "Query parameter id is required" }, { status: 400 });
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
    const ratedTrackIds = await ratedTrackIdsForUser(supabase, user.id);
    const { total_tracks, trackRowIds } = await fetchPlaylistTrackStats(accessToken, playlistId);

    let rated_count = 0;
    for (const id of trackRowIds) {
      if (ratedTrackIds.has(id)) rated_count += 1;
    }
    const unrated_count = Math.max(0, total_tracks - rated_count);
    const rated_percent = total_tracks
      ? Math.round((rated_count / total_tracks) * 100)
      : 0;

    const body: SpotifyPlaylistStatsPayload = {
      rated_count,
      unrated_count,
      rated_percent,
      total_tracks,
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Playlist stats failed";
    const spotifyStatus = /^Spotify API (\d{3}):/.exec(message)?.[1];
    if (spotifyStatus === "401") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (spotifyStatus === "403") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (spotifyStatus === "429") {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
