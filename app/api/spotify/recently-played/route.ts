import { NextResponse } from "next/server";

import type { RecentTrack } from "@/lib/playback/recentTrack";
import { loadListeningHistory } from "@/lib/playback/listeningHistory";
import { CACHE_NO_STORE } from "@/lib/spotify/cacheHeaders";
import { createClient } from "@/lib/supabase/server";
import { requireProviderAccessToken } from "@/lib/supabase/providerToken";

export const dynamic = "force-dynamic";

const SPOTIFY_RECENT_TIMEOUT_MS = 4_000;

interface SpotifyRecentItem {
  track: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: { images: { url: string }[] };
  } | null;
  played_at: string;
}

export type { RecentTrack };

function mergeTracks(a: RecentTrack[], b: RecentTrack[]): RecentTrack[] {
  const byId = new Map<string, RecentTrack>();
  for (const t of [...a, ...b]) {
    const prev = byId.get(t.spotifyId);
    if (!prev) {
      byId.set(t.spotifyId, t);
      continue;
    }
    const newer =
      new Date(t.playedAt).getTime() >= new Date(prev.playedAt).getTime()
        ? t
        : prev;
    byId.set(t.spotifyId, {
      ...newer,
      score: newer.score ?? prev.score ?? t.score ?? null,
      imageUrl: newer.imageUrl ?? prev.imageUrl ?? t.imageUrl,
      artistId: newer.artistId ?? prev.artistId ?? t.artistId,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
  );
}

async function attachScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tracks: RecentTrack[],
): Promise<RecentTrack[]> {
  const ids = tracks.map((t) => t.spotifyId);
  if (ids.length === 0) return tracks;
  const { data: ratings } = await supabase
    .from("ratings")
    .select("spotify_id, score")
    .eq("user_id", userId)
    .in("spotify_id", ids);
  if (!ratings?.length) return tracks;
  const scoreMap = new Map(
    ratings.map((r) => [r.spotify_id as string, r.score as number]),
  );
  return tracks.map((t) => ({
    ...t,
    score: scoreMap.get(t.spotifyId) ?? t.score,
  }));
}

async function fetchSpotifyRecentlyPlayed(
  accessToken: string,
): Promise<{ tracks: RecentTrack[]; error?: string; status?: number }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SPOTIFY_RECENT_TIMEOUT_MS);
  try {
    const res = await fetch(
      "https://api.spotify.com/v1/me/player/recently-played?limit=50",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: ac.signal,
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 403) {
        return {
          tracks: [],
          status: 403,
          error:
            "Missing Spotify permission for listening history. Reconnect Spotify to grant access.",
        };
      }
      return {
        tracks: [],
        status: res.status,
        error: `Spotify ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as { items?: SpotifyRecentItem[] };
    const seen = new Set<string>();
    const tracks: RecentTrack[] = [];
    for (const item of data.items ?? []) {
      if (!item?.track?.id || seen.has(item.track.id)) continue;
      seen.add(item.track.id);
      const images = item.track.album?.images ?? [];
      tracks.push({
        spotifyId: item.track.id,
        name: item.track.name,
        artistName: item.track.artists[0]?.name ?? "Unknown",
        artistId: item.track.artists[0]?.id ?? null,
        imageUrl: images[0]?.url ?? images[images.length - 1]?.url ?? null,
        playedAt: item.played_at,
        score: null,
      });
    }
    return { tracks };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { tracks: [], status: 504, error: "Spotify history timed out" };
    }
    return {
      tracks: [],
      status: 502,
      error: e instanceof Error ? e.message : "Spotify history failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Primary: tracks we've observed via currently-playing (iPhone / any device).
  const stored = await loadListeningHistory(supabase, user.id, 40);

  let spotifyTracks: RecentTrack[] = [];
  let spotifyError: string | undefined;
  let spotifyStatus: number | undefined;

  try {
    const accessToken = await requireProviderAccessToken(supabase);
    const remote = await fetchSpotifyRecentlyPlayed(accessToken);
    spotifyTracks = remote.tracks;
    spotifyError = remote.error;
    spotifyStatus = remote.status;
  } catch {
    spotifyError = "no_token";
    spotifyStatus = 401;
  }

  const merged = await attachScores(
    supabase,
    user.id,
    mergeTracks(stored, spotifyTracks).slice(0, 40),
  );

  // Always 200 when we have anything to show — never hang the UI on Spotify failure.
  return NextResponse.json(
    {
      tracks: merged,
      spotifyError:
        merged.length === 0 && spotifyError
          ? spotifyError
          : spotifyError && spotifyStatus === 403
            ? spotifyError
            : null,
      spotifyStatus: spotifyStatus ?? null,
    },
    {
      status: 200,
      headers: { "Cache-Control": CACHE_NO_STORE },
    },
  );
}
