import { type NextRequest, NextResponse } from "next/server";

import { loadUserRatedTrackSpotifyIds } from "@/lib/ratings/userRatedTrackIds";
import { SpotifyApiError } from "@/lib/spotify/errors";
import {
  loadUserPlaylistTracksMap,
  statsFromTrackIds,
  upsertPlaylistTracks,
} from "@/lib/spotify/playlistTracksDb";
import { fetchSpotifyPlaylistMeta } from "@/lib/spotify/currentlyPlaying";
import { fetchPlaylistTrackStats } from "@/lib/spotify/userLibraryPlaylists";
import type { SpotifyPlaylistStatsPayload } from "@/lib/types/spotifyLibrary";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SyncBody = {
  playlist_id?: string;
  force?: boolean;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playlistId = body.playlist_id?.trim();
  if (!playlistId) {
    return NextResponse.json(
      { error: "playlist_id is required" },
      { status: 400 },
    );
  }

  const force = body.force === true;

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
    const [tracksMap, ratedTrackIds] = await Promise.all([
      loadUserPlaylistTracksMap(supabase, user.id),
      loadUserRatedTrackSpotifyIds(supabase, user.id),
    ]);

    const cached = tracksMap.get(playlistId);
    if (!force && cached) {
      const stats = statsFromTrackIds(
        cached.track_ids,
        cached.total_tracks,
        ratedTrackIds,
      );
      return NextResponse.json({
        playlist_id: playlistId,
        cached: true,
        ...stats,
      } satisfies SpotifyPlaylistStatsPayload & {
        playlist_id: string;
        cached: boolean;
      });
    }

    const [{ total_tracks, trackRowIds }, playlistMeta] = await Promise.all([
      fetchPlaylistTrackStats(accessToken, playlistId),
      fetchSpotifyPlaylistMeta(accessToken, playlistId),
    ]);

    await upsertPlaylistTracks(
      supabase,
      user.id,
      playlistId,
      total_tracks,
      trackRowIds,
      {
        name: playlistMeta.name,
        image_url: playlistMeta.imageUrl,
      },
    );

    const stats = statsFromTrackIds(trackRowIds, total_tracks, ratedTrackIds);

    return NextResponse.json({
      playlist_id: playlistId,
      cached: false,
      ...stats,
    });
  } catch (e) {
    if (e instanceof SpotifyApiError && e.status === 429) {
      return NextResponse.json(
        {
          error: "Rate limited",
          retryAfter: e.retryAfterSec,
        },
        { status: 429 },
      );
    }
    const message = e instanceof Error ? e.message : "Sync failed";
    const spotifyStatus = /^Spotify API (\d{3}):/.exec(message)?.[1];
    if (spotifyStatus === "401") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (spotifyStatus === "403") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (spotifyStatus === "429") {
      return NextResponse.json(
        { error: "Rate limited", retryAfter: 30 },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
