/** Spotify GET /v1/me/player — active playback on any device (Web API). */

import {
  cachedSpotifyRequest,
  SPOTIFY_CACHE_TTL,
} from "@/lib/spotify/cache";
import { parseRetryAfterSec, SpotifyApiError } from "@/lib/spotify/errors";
import {
  assertSpotifyCircuitAvailable,
  beginSpotifyHalfOpenProbe,
  recordSpotify429,
  recordSpotifySuccess,
  releaseSpotifyHalfOpenProbe,
  withSpotifyUserThrottle,
} from "@/lib/spotify/rateLimiter";

const ME_PLAYER = "https://api.spotify.com/v1/me/player";

export type SpotifyRepeatState = "off" | "context" | "track";

/** Normalized playback for UI (GET /api/spotify/playback). */
export type SpotifyCurrentPlayback = {
  isPlaying: boolean;
  /** Spotify item id (track or episode). */
  trackId: string;
  itemKind: "track" | "episode";
  trackName: string;
  artistName: string;
  /** Primary credited artist Spotify id. */
  artistId: string | null;
  albumName: string;
  imageUrl: string;
  progressMs: number;
  durationMs: number;
  deviceName: string;
  deviceType: string;
  shuffleState: boolean;
  repeatState: SpotifyRepeatState;
  contextType: string | null;
  contextUri: string | null;
  contextName: string | null;
  contextImageUrl?: string | null;
  isWamPlaylist?: boolean;
  /** WAM `wam_playlists.id` when `isWamPlaylist` is true. */
  wamPlaylistId?: string | null;
};

/** GET /api/spotify/playback JSON body. */
export type SpotifyPlaybackApiResponse = SpotifyCurrentPlayback | { isPlaying: false };

function normalizeRepeat(s: unknown): SpotifyRepeatState {
  if (s === "context" || s === "track" || s === "off") return s;
  return "off";
}

function pickImage(urls: { url?: string }[] | undefined): string {
  const u = urls?.[0]?.url;
  return typeof u === "string" && u.length > 0 ? u : "";
}

type MePlayerJson = {
  is_playing?: boolean;
  progress_ms?: number;
  shuffle_state?: boolean;
  repeat_state?: string;
  timestamp?: number;
  device?: { id?: string; name?: string; type?: string } | null;
  context?: { type?: string; uri?: string | null } | null;
  item?: Record<string, unknown> | null;
};

function itemType(item: Record<string, unknown> | null | undefined): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const t = item.type;
  return typeof t === "string" ? t : undefined;
}

function parseTrackLikeItem(item: Record<string, unknown>): Omit<
  SpotifyCurrentPlayback,
  | "isPlaying"
  | "itemKind"
  | "shuffleState"
  | "repeatState"
  | "contextType"
  | "contextUri"
  | "contextName"
  | "deviceName"
  | "deviceType"
> {
  const id = typeof item.id === "string" ? item.id : "";
  const name = typeof item.name === "string" ? item.name : "Unknown";

  const artistList = Array.isArray(item.artists)
    ? (item.artists as { name?: string; id?: string }[])
    : [];
  const artistName = artistList
    .map((a) => (typeof a?.name === "string" ? a.name : ""))
    .filter(Boolean)
    .join(", ");
  const firstId = artistList[0]?.id;
  const artistId = typeof firstId === "string" && firstId.length > 0 ? firstId : null;

  const album = item.album && typeof item.album === "object" ? (item.album as Record<string, unknown>) : null;
  const albumName =
    album && typeof album.name === "string" ? album.name : "";
  const images =
    album && Array.isArray(album.images)
      ? (album.images as { url?: string }[])
      : undefined;

  const duration =
    typeof item.duration_ms === "number" && Number.isFinite(item.duration_ms)
      ? item.duration_ms
      : 0;

  return {
    trackId: id,
    trackName: name,
    artistName: artistName || "—",
    artistId,
    albumName: albumName || "—",
    imageUrl: pickImage(images),
    progressMs: 0,
    durationMs: duration,
  };
}

function parseEpisodeItem(item: Record<string, unknown>): Omit<
  SpotifyCurrentPlayback,
  | "isPlaying"
  | "itemKind"
  | "shuffleState"
  | "repeatState"
  | "contextType"
  | "contextUri"
  | "contextName"
  | "deviceName"
  | "deviceType"
> {
  const id = typeof item.id === "string" ? item.id : "";
  const name = typeof item.name === "string" ? item.name : "Unknown";
  const show =
    item.show && typeof item.show === "object" ? (item.show as Record<string, unknown>) : null;
  const showName = show && typeof show.name === "string" ? show.name : "Podcast";
  const publisher =
    show && typeof show.publisher === "string" ? show.publisher : "";
  const showImages =
    show && Array.isArray(show.images) ? (show.images as { url?: string }[]) : undefined;
  const epImages = Array.isArray(item.images) ? (item.images as { url?: string }[]) : undefined;
  const duration =
    typeof item.duration_ms === "number" && Number.isFinite(item.duration_ms)
      ? item.duration_ms
      : 0;

  return {
    trackId: id,
    trackName: name,
    artistName: showName,
    artistId: null,
    albumName: publisher || "—",
    imageUrl: pickImage(epImages) || pickImage(showImages),
    progressMs: 0,
    durationMs: duration,
  };
}

export function playlistIdFromContextUri(uri: string | null): string | null {
  if (!uri || typeof uri !== "string") return null;
  const m = uri.match(/^spotify:playlist:(.+)$/);
  return m?.[1] ?? null;
}

export type SpotifyPlaylistMeta = {
  name: string | null;
  imageUrl: string | null;
};

async function fetchSpotifyPlaylistMetaFromApi(
  accessToken: string,
  playlistId: string,
): Promise<SpotifyPlaylistMeta> {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?fields=name,images`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return { name: null, imageUrl: null };
  try {
    const j = (await res.json()) as {
      name?: string;
      images?: { url?: string }[];
    };
    const name =
      typeof j.name === "string" && j.name.length > 0 ? j.name : null;
    const imageUrl = pickImage(j.images);
    return { name, imageUrl: imageUrl || null };
  } catch {
    return { name: null, imageUrl: null };
  }
}

export async function fetchSpotifyPlaylistMeta(
  accessToken: string,
  playlistId: string,
  options?: { bypassCache?: boolean },
): Promise<SpotifyPlaylistMeta> {
  return cachedSpotifyRequest(
    `playlist-meta:${playlistId}`,
    SPOTIFY_CACHE_TTL.playlistMeta,
    () => fetchSpotifyPlaylistMetaFromApi(accessToken, playlistId),
    { bypass: options?.bypassCache },
  );
}

export async function fetchSpotifyPlaylistName(
  accessToken: string,
  playlistId: string,
): Promise<string | null> {
  const meta = await fetchSpotifyPlaylistMeta(accessToken, playlistId);
  return meta.name;
}

const memPlaybackByUser = new Map<
  string,
  { at: number; data: SpotifyCurrentPlayback | null }
>();
const MEM_PLAYBACK_MS = 2_000;

export type FetchCurrentPlaybackOptions = {
  /** Enables shared cache + throttle (strongly recommended for server routes). */
  userId?: string;
  bypassCache?: boolean;
};

async function fetchCurrentPlaybackFromApi(
  accessToken: string,
  userId?: string,
): Promise<SpotifyCurrentPlayback | null> {
  const run = async () => {
    // Circuit probe is owned by cachedSpotifyRequest (or the bypass caller).
    assertSpotifyCircuitAvailable();

    const res = await fetch(ME_PLAYER, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 204 || res.status === 202) {
    recordSpotifySuccess();
    return null;
  }
  if (res.status === 404) {
    recordSpotifySuccess();
    return null;
  }

  if (!res.ok) {
    const t = await res.text();
    // Circuit bookkeeping is owned by cachedSpotifyRequest / bypass caller.
    if (res.status !== 429) {
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

  const text = await res.text();
  if (!text) return null;

  let data: MePlayerJson;
  try {
    data = JSON.parse(text) as MePlayerJson;
  } catch {
    throw new Error("Spotify API 200: invalid JSON for /me/player");
  }

  const itemRaw = data.item;
  const item =
    itemRaw && typeof itemRaw === "object"
      ? (itemRaw as Record<string, unknown>)
      : null;
  if (!item) return null;

  const itype = itemType(item);
  const isEpisode = itype === "episode";
  const base = isEpisode ? parseEpisodeItem(item) : parseTrackLikeItem(item);

  const progressMs =
    typeof data.progress_ms === "number" && Number.isFinite(data.progress_ms)
      ? Math.max(0, data.progress_ms)
      : 0;

  const device = data.device;
  const deviceName =
    device && typeof device.name === "string" && device.name.length > 0
      ? device.name
      : "Unknown device";
  const deviceType =
    device && typeof device.type === "string" && device.type.length > 0
      ? device.type
      : "unknown";

  const ctx = data.context;
  const contextType =
    ctx && typeof ctx.type === "string" && ctx.type.length > 0 ? ctx.type : null;
  const contextUri =
    ctx && typeof ctx.uri === "string" && ctx.uri.length > 0 ? ctx.uri : null;

  const isPlaying = Boolean(data.is_playing);

  return {
    isPlaying,
    ...base,
    itemKind: (isEpisode ? "episode" : "track") as "track" | "episode",
    progressMs,
    shuffleState: Boolean(data.shuffle_state),
    repeatState: normalizeRepeat(data.repeat_state),
    contextType,
    contextUri,
    contextName: null,
    deviceName,
    deviceType,
  };
  };

  if (userId) {
    return withSpotifyUserThrottle(userId, run);
  }
  return run();
}

/**
 * GET /v1/me/player — full playback state or null when nothing is playing / no player.
 * Does not resolve playlist display name; use `fetchSpotifyPlaylistName` in the route.
 */
export async function fetchCurrentPlayback(
  accessToken: string,
  options?: FetchCurrentPlaybackOptions,
): Promise<SpotifyCurrentPlayback | null> {
  const userId = options?.userId?.trim();
  // Fresh transport polls must hit Spotify immediately — skip mem/DB cache and user throttle.
  if (!userId || options?.bypassCache) {
    assertSpotifyCircuitAvailable();
    if (!beginSpotifyHalfOpenProbe()) {
      throw new SpotifyApiError(503, "Spotify circuit open");
    }
    try {
      return await fetchCurrentPlaybackFromApi(
        accessToken,
        options?.bypassCache ? undefined : userId,
      );
    } catch (e) {
      if (e instanceof SpotifyApiError && e.status === 429) {
        recordSpotify429();
      } else {
        releaseSpotifyHalfOpenProbe();
      }
      throw e;
    }
  }

  const mem = memPlaybackByUser.get(userId);
  if (mem && Date.now() - mem.at < MEM_PLAYBACK_MS) {
    return mem.data;
  }

  const data = await cachedSpotifyRequest(
    `playback:me:${userId}`,
    SPOTIFY_CACHE_TTL.playback,
    () => fetchCurrentPlaybackFromApi(accessToken, userId),
    { bypass: options?.bypassCache },
  );

  memPlaybackByUser.set(userId, { at: Date.now(), data });
  return data;
}
