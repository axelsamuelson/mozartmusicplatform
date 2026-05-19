import {
  extractSpotifyTrackId,
  isSpotifyShortLink,
  spotifyCandidatesFromShare,
} from "@/lib/spotify/parseTrackUrl";
import {
  cachedSpotifyRequest,
  SPOTIFY_CACHE_TTL,
} from "@/lib/spotify/cache";
import { fetchSpotifyItem } from "@/lib/spotify/api";

export type ResolvedSpotifyTrack = {
  trackId: string;
  trackName: string;
  artistName: string | null;
  imageUrl: string | null;
};

async function followShortLink(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html,*/*",
      "User-Agent":
        "Mozilla/5.0 (compatible; WAM/1.0; +https://musicator.app)",
    },
  });
  const finalUrl = res.url;
  const fromFinal = extractSpotifyTrackId(finalUrl);
  if (fromFinal) return finalUrl;

  const html = await res.text().catch(() => "");
  const ogUrl = html.match(
    /property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
  )?.[1];
  if (ogUrl) return ogUrl;

  const canonical = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  )?.[1];
  return canonical ?? finalUrl;
}

export async function resolveTrackIdFromUrl(rawUrl: string): Promise<string | null> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (isSpotifyShortLink(trimmed)) {
    try {
      candidate = await followShortLink(trimmed);
    } catch {
      return null;
    }
  }

  return extractSpotifyTrackId(candidate);
}

export async function resolveTrackIdFromShare(params: {
  url?: string | null;
  title?: string | null;
  text?: string | null;
}): Promise<string | null> {
  const candidates = spotifyCandidatesFromShare(params);
  for (const candidate of candidates) {
    const id = await resolveTrackIdFromUrl(candidate);
    if (id) return id;
  }
  return null;
}

export async function fetchTrackMetadata(
  trackId: string,
): Promise<ResolvedSpotifyTrack> {
  const payload = await cachedSpotifyRequest(
    `item:${trackId}:track`,
    SPOTIFY_CACHE_TTL.item,
    () => fetchSpotifyItem(trackId, "track"),
  );

  return {
    trackId: payload.spotify_id,
    trackName: payload.name,
    artistName: payload.artist_name,
    imageUrl: payload.image_url,
  };
}
