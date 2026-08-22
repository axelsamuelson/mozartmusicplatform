/** Spotify GET /v1/me/player/queue — tracks up next on the active device. */

import { parseRetryAfterSec, SpotifyApiError } from "@/lib/spotify/errors";
import {
  assertSpotifyCircuitAvailable,
  beginSpotifyHalfOpenProbe,
  recordSpotify429,
  recordSpotifySuccess,
  releaseSpotifyHalfOpenProbe,
} from "@/lib/spotify/rateLimiter";

const ME_PLAYER_QUEUE = "https://api.spotify.com/v1/me/player/queue";

export type SpotifyQueuedTrack = {
  spotify_track_id: string;
  track_name: string;
  artist_name: string | null;
  image_url: string | null;
};

function itemType(item: Record<string, unknown>): string | undefined {
  const t = item.type;
  return typeof t === "string" ? t : undefined;
}

function pickImage(urls: { url?: string }[] | undefined): string {
  const u = urls?.[0]?.url;
  return typeof u === "string" && u.length > 0 ? u : "";
}

function parseQueuedTrack(item: Record<string, unknown>): SpotifyQueuedTrack | null {
  if (itemType(item) !== "track") return null;

  const id = typeof item.id === "string" ? item.id : "";
  const name = typeof item.name === "string" ? item.name : "";
  if (!id || !name) return null;

  const artists = Array.isArray(item.artists)
    ? (item.artists as { name?: string }[])
        .map((a) => (typeof a?.name === "string" ? a.name : ""))
        .filter(Boolean)
        .join(", ")
    : "";

  const album =
    item.album && typeof item.album === "object"
      ? (item.album as Record<string, unknown>)
      : null;
  const images =
    album && Array.isArray(album.images)
      ? (album.images as { url?: string }[])
      : undefined;

  return {
    spotify_track_id: id,
    track_name: name,
    artist_name: artists || null,
    image_url: pickImage(images) || null,
  };
}

/** Upcoming tracks on the host device (may be fewer than requested — API limit). */
export async function fetchSpotifyPlayerQueue(
  accessToken: string,
): Promise<SpotifyQueuedTrack[]> {
  assertSpotifyCircuitAvailable();
  if (!beginSpotifyHalfOpenProbe()) {
    throw new SpotifyApiError(503, "Spotify circuit open");
  }

  const res = await fetch(ME_PLAYER_QUEUE, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 204 || res.status === 404) {
    recordSpotifySuccess();
    return [];
  }
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) {
      recordSpotify429();
    } else {
      releaseSpotifyHalfOpenProbe();
    }
    throw new SpotifyApiError(
      res.status,
      t,
      res.status === 429
        ? parseRetryAfterSec(res.headers.get("Retry-After"))
        : undefined,
    );
  }

  recordSpotifySuccess();

  const data = (await res.json()) as { queue?: unknown[] };
  const raw = Array.isArray(data.queue) ? data.queue : [];
  const tracks: SpotifyQueuedTrack[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const parsed = parseQueuedTrack(entry as Record<string, unknown>);
    if (parsed) tracks.push(parsed);
  }

  return tracks;
}
