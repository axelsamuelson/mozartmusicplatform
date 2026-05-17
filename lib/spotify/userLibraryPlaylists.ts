/** Spotify Web API: current user’s playlists (owned only) and playlist item stats (user OAuth token). */

import { parseRetryAfterSec } from "@/lib/spotify/errors";
import {
  isSpotifyCircuitOpen,
  recordSpotify429,
} from "@/lib/spotify/rateLimiter";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET with 429 backoff (Retry-After or exponential) to avoid failing the whole library load. */
async function spotifyGetJson<T>(accessToken: string, url: string): Promise<T> {
  if (isSpotifyCircuitOpen()) {
    throw new Error("Spotify API 429: circuit open");
  }

  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (res.status === 429 && attempt < maxAttempts - 1) {
      const retryAfterSec = parseRetryAfterSec(res.headers.get("Retry-After"), 30);
      const waitMs = Math.min(30_000, Math.max(400, retryAfterSec * 1000));
      await res.text().catch(() => undefined);
      await delay(waitMs);
      continue;
    }

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Spotify API ${res.status}: ${t.slice(0, 400)}`);
    }
    const text = await res.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Spotify API ${res.status}: invalid JSON response`);
    }
  }
  recordSpotify429();
  throw new Error("Spotify API 429: exhausted retries");
}

function offsetFromPlaylistItemsUrl(u: string): number | null {
  try {
    const o = new URL(u).searchParams.get("offset");
    if (o === null || o === "") return 0;
    const n = Number.parseInt(o, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Current Spotify profile (GET /v1/me). */
export async function fetchSpotifyCurrentUser(accessToken: string): Promise<{
  id: string;
  display_name: string | null;
}> {
  const me = await spotifyGetJson<{ id?: string; display_name?: string | null }>(
    accessToken,
    "https://api.spotify.com/v1/me",
  );
  const id = typeof me.id === "string" && me.id.length > 0 ? me.id : "";
  if (!id) {
    throw new Error("Spotify API 200: /v1/me response missing user id");
  }
  return {
    id,
    display_name: typeof me.display_name === "string" ? me.display_name : null,
  };
}

export type SpotifyMyPlaylistSummary = {
  id: string;
  name: string;
  image_url: string | null;
  owner_label: string;
  /** From `tracks.total` on GET /v1/me/playlists (may differ slightly from paginated item count). */
  total_tracks: number;
};

type MePlaylistsPage = {
  items: Array<{
    id: string;
    name: string;
    images: { url: string }[];
    owner: { display_name: string | null; id: string };
    tracks?: { total?: number };
  }>;
  next: string | null;
};

/**
 * Paginate GET /v1/me/playlists and keep only playlists owned by the current Spotify user
 * (`owner.id` matches GET /v1/me `id`).
 */
export async function fetchOwnedMyPlaylistSummaries(
  accessToken: string,
): Promise<SpotifyMyPlaylistSummary[]> {
  const me = await fetchSpotifyCurrentUser(accessToken);
  const out: SpotifyMyPlaylistSummary[] = [];
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (true) {
    if (!url) break;
    const currentUrl = url;
    const playlistPage: MePlaylistsPage = await spotifyGetJson<MePlaylistsPage>(
      accessToken,
      currentUrl,
    );
    for (const it of playlistPage.items ?? []) {
      if (!it?.id) continue;
      const owner = it.owner;
      const ownerId = owner?.id;
      if (ownerId !== me.id) continue;

      const images = Array.isArray(it.images) ? it.images : [];
      const totalTracks =
        typeof it.tracks?.total === "number" && Number.isFinite(it.tracks.total)
          ? Math.max(0, it.tracks.total)
          : 0;
      out.push({
        id: it.id,
        name: typeof it.name === "string" ? it.name : "Untitled playlist",
        image_url: images[0]?.url ?? null,
        owner_label: owner?.display_name?.trim() || owner?.id || "Unknown",
        total_tracks: totalTracks,
      });
    }
    url = playlistPage.next;
    if (url) await delay(120);
  }

  return out;
}

/** Playlist line: Spotify documents `item` (current); `track` is deprecated but still seen in the wild. */
type PlaylistItemRow = {
  is_local?: boolean;
  track?: { id?: string | null; type?: string } | null;
  item?: { id?: string | null; type?: string } | null;
};

type PlaylistItemsPage = {
  total?: number;
  items?: PlaylistItemRow[];
  next?: string | null;
};

/**
 * `item` is required in fields — `track` alone can yield empty objects after API changes.
 * @see https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
 */
const PLAYLIST_ITEMS_FIELDS = encodeURIComponent("total,items(item(id,type),is_local),next");

export type PlaylistTrackStatsResult = {
  /** Spotify `total` for the playlist (all item kinds). */
  total_tracks: number;
  /** Music `track` rows with a string id — used for rated matching (playlist order, duplicates kept). */
  trackRowIds: string[];
};

function lineItemTrackLike(row: PlaylistItemRow | undefined): {
  id: string;
  type?: string;
} | null {
  if (!row || typeof row !== "object") return null;
  if (row.is_local === true) return null;
  const tr = row.item ?? row.track ?? null;
  if (!tr || typeof tr !== "object") return null;
  if (tr.id == null || typeof tr.id !== "string" || tr.id.length === 0) return null;
  const typ = tr.type;
  // Simplified / partial objects sometimes omit `type`; treat unknown as track-like for playlists.
  if (typ != null && typ !== "" && typ !== "track") return null;
  return { id: tr.id, type: typ };
}

/**
 * Paginate GET /v1/playlists/{id}/items with `fields` so `total` is reliable.
 * Skips local files, episodes (explicit non-track `type`), and rows without a usable track id.
 */
export async function fetchPlaylistTrackStats(
  accessToken: string,
  playlistId: string,
): Promise<PlaylistTrackStatsResult> {
  const fields = PLAYLIST_ITEMS_FIELDS;
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?fields=${fields}&limit=50&offset=0&market=from_token`;

  let spotifyTotal: number | null = null;
  const trackRowIds: string[] = [];
  let rawItemsSeen = 0;
  let pageIndex = 0;

  while (url) {
    const page: PlaylistItemsPage = await spotifyGetJson<PlaylistItemsPage>(accessToken, url);
    const items = page.items ?? [];
    rawItemsSeen += items.length;

    if (typeof page.total === "number") {
      spotifyTotal = page.total;
    }

    for (const row of items) {
      const line = lineItemTrackLike(row);
      if (!line) continue;
      trackRowIds.push(line.id);
    }

    pageIndex += 1;
    url = page.next ?? null;
    if (url) await delay(90);
  }

  const total_tracks = spotifyTotal != null ? spotifyTotal : rawItemsSeen;

  return { total_tracks, trackRowIds };
}
