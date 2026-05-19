import {
  assertSpotifyCircuitAvailable,
  beginSpotifyHalfOpenProbe,
  recordSpotify429,
  recordSpotifySuccess,
} from "@/lib/spotify/rateLimiter";

export type TrackMetadata = {
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
};

const BATCH_SIZE = 50;

type SpotifyTrackJson = {
  id: string;
  name: string;
  artists?: { name: string }[];
  album?: { images?: { url: string }[] };
};

/** GET /v1/tracks?ids=… with circuit breaker (max 50 ids per request). */
export async function fetchTrackMetadataBatch(
  accessToken: string,
  trackIds: string[],
): Promise<Map<string, TrackMetadata>> {
  const out = new Map<string, TrackMetadata>();
  const unique = [...new Set(trackIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return out;

  assertSpotifyCircuitAvailable();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    if (!beginSpotifyHalfOpenProbe()) break;

    const res = await fetch(
      `https://api.spotify.com/v1/tracks?ids=${encodeURIComponent(chunk.join(","))}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );

    if (res.status === 429) {
      recordSpotify429();
      break;
    }

    if (!res.ok) continue;

    recordSpotifySuccess();
    const body = (await res.json()) as { tracks?: (SpotifyTrackJson | null)[] };
    for (const tr of body.tracks ?? []) {
      if (!tr?.id) continue;
      out.set(tr.id, {
        spotify_track_id: tr.id,
        track_name: tr.name,
        artist_name: tr.artists?.map((a) => a.name).join(", ") ?? null,
        image_url: tr.album?.images?.[0]?.url ?? null,
      });
    }
  }

  return out;
}
