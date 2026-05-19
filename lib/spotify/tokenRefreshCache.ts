/** In-process cache so concurrent requests share one Spotify refresh. */

type CachedAccess = {
  accessToken: string;
  expiresAtSec: number;
};

const accessByUser = new Map<string, CachedAccess>();
const refreshInflight = new Map<string, Promise<string>>();
const lastPersistMsByUser = new Map<string, number>();

const TOKEN_EXPIRY_BUFFER_SEC = 120;
/** Min interval between supabase.auth.updateUser for Spotify metadata. */
export const SPOTIFY_METADATA_PERSIST_MIN_MS = 60_000;

export function getCachedSpotifyAccess(userId: string): string | null {
  const hit = accessByUser.get(userId);
  if (!hit) return null;
  if (hit.expiresAtSec <= Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_BUFFER_SEC) {
    accessByUser.delete(userId);
    return null;
  }
  return hit.accessToken;
}

export function setCachedSpotifyAccess(
  userId: string,
  accessToken: string,
  expiresInSec: number,
): void {
  accessByUser.set(userId, {
    accessToken,
    expiresAtSec: Math.floor(Date.now() / 1000) + expiresInSec,
  });
}

export function getInflightSpotifyRefresh(
  userId: string,
): Promise<string> | undefined {
  return refreshInflight.get(userId);
}

export function setInflightSpotifyRefresh(
  userId: string,
  promise: Promise<string>,
): void {
  refreshInflight.set(userId, promise);
  void promise.finally(() => {
    if (refreshInflight.get(userId) === promise) {
      refreshInflight.delete(userId);
    }
  });
}

export function shouldPersistSpotifyMetadata(userId: string): boolean {
  const last = lastPersistMsByUser.get(userId) ?? 0;
  return Date.now() - last >= SPOTIFY_METADATA_PERSIST_MIN_MS;
}

export function markSpotifyMetadataPersisted(userId: string): void {
  lastPersistMsByUser.set(userId, Date.now());
}
