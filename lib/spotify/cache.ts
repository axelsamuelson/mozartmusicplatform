import { createAdminClient } from "@/lib/supabase/admin";
import { SpotifyHttpError } from "@/lib/spotify/api";
import { SpotifyApiError } from "@/lib/spotify/errors";
import {
  beginSpotifyHalfOpenProbe,
  isSpotify429Error,
  recordSpotify429,
  recordSpotifySuccess,
  shouldBlockSpotifyRequests,
  SPOTIFY_CIRCUIT_OPEN_ERROR,
} from "@/lib/spotify/rateLimiter";

/** Recommended TTLs (seconds) per data type. */
export const SPOTIFY_CACHE_TTL = {
  /** Short TTL — coalesce Player poll + host live sync on same user. */
  playback: 15,
  search: 300,
  item: 86_400,
  playlistMeta: 3600,
  playlistTracks: 86_400,
  userPlaylists: 120,
} as const;

type SpotifyCacheRow = {
  key: string;
  data: unknown;
  cached_at: string;
  ttl_seconds: number;
};

export type CachedSpotifyRequestOptions = {
  /** Skip cache read/write and always call fetcher (e.g. force sync). */
  bypass?: boolean;
};

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function logCache(event: "HIT" | "MISS" | "STALE" | "CIRCUIT", key: string): void {
  if (isDev()) {
    console.log(`[spotify-cache] ${event} ${key}`);
  }
}

function isFresh(row: SpotifyCacheRow): boolean {
  const cachedMs = new Date(row.cached_at).getTime();
  if (!Number.isFinite(cachedMs)) return false;
  return Date.now() < cachedMs + row.ttl_seconds * 1000;
}

async function readCacheRow(key: string): Promise<SpotifyCacheRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("spotify_cache")
    .select("key, data, cached_at, ttl_seconds")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`spotify_cache read failed: ${error.message}`);
  }
  if (!data) return null;
  return data as SpotifyCacheRow;
}

async function writeCacheRow(
  key: string,
  data: unknown,
  ttlSeconds: number,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("spotify_cache").upsert(
    {
      key,
      data,
      cached_at: new Date().toISOString(),
      ttl_seconds: ttlSeconds,
    },
    { onConflict: "key" },
  );
  if (error) {
    throw new Error(`spotify_cache write failed: ${error.message}`);
  }
}

/** Stale cache entry (ignores TTL). */
export async function getStaleSpotifyCache<T>(key: string): Promise<T | null> {
  const row = await readCacheRow(key);
  if (!row) return null;
  return row.data as T;
}

/**
 * Read-through cache backed by `spotify_cache`.
 * On 429 or circuit-open: returns stale data when available.
 */
export async function cachedSpotifyRequest<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  options?: CachedSpotifyRequestOptions,
): Promise<T> {
  const existing = await readCacheRow(key);

  if (!options?.bypass && existing && isFresh(existing)) {
    logCache("HIT", key);
    return existing.data as T;
  }

  if (shouldBlockSpotifyRequests()) {
    if (existing) {
      logCache("CIRCUIT", `${key} (stale)`);
      return existing.data as T;
    }
    throw new Error(SPOTIFY_CIRCUIT_OPEN_ERROR);
  }

  const canProbe = beginSpotifyHalfOpenProbe();
  if (!canProbe) {
    if (existing) {
      logCache("CIRCUIT", `${key} (stale-half-open)`);
      return existing.data as T;
    }
    throw new Error(SPOTIFY_CIRCUIT_OPEN_ERROR);
  }

  try {
    logCache("MISS", options?.bypass ? `${key} (bypass)` : key);
    const data = await fetcher();
    recordSpotifySuccess();
    if (ttlSeconds > 0) {
      await writeCacheRow(key, data, ttlSeconds);
    }
    return data;
  } catch (error) {
    if (isSpotify429Error(error)) {
      recordSpotify429();
      if (existing) {
        logCache("STALE", `${key} (429)`);
        return existing.data as T;
      }
    }
    throw error;
  }
}

export async function cleanupExpiredSpotifyCache(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cleanup_spotify_cache");
  if (error) {
    throw new Error(`cleanup_spotify_cache failed: ${error.message}`);
  }
  return typeof data === "number" ? data : Number(data) || 0;
}

/** Re-export for routes that catch Spotify errors consistently. */
export { SpotifyApiError, SpotifyHttpError };
