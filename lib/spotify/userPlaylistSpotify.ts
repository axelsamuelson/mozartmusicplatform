/** Spotify Web API calls with a user OAuth access token (e.g. provider_token). */

import { parseRetryAfterSec, SpotifyApiError } from "@/lib/spotify/errors";
import { assertSpotifyCircuitAvailable } from "@/lib/spotify/rateLimiter";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SpotifyJsonRetryOptions = {
  maxAttempts?: number;
  /** Upper bound for exponential backoff between retries (ms). Default 8000. */
  maxBackoffMs?: number;
  /** Upper bound when honoring Spotify `Retry-After` (ms). Default 60000. */
  maxRetryAfterMs?: number;
  /** Per-request timeout to Spotify (ms). Default 18000. Omit with 0. */
  fetchTimeoutMs?: number;
  /** Retry on HTTP 429. Default true; set false for write ops that Spotify rate-limits hard. */
  retryOn429?: boolean;
};

async function spotifyJsonWithRetry<T>(
  accessToken: string,
  url: string,
  init: RequestInit | undefined,
  options: SpotifyJsonRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const maxBackoffMs = options.maxBackoffMs ?? 8000;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 60_000;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? 18_000;
  const retryOn429 = options.retryOn429 ?? true;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutSignal =
      fetchTimeoutMs > 0 &&
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(fetchTimeoutMs)
        : undefined;

    const isCreatePlaylist =
      url.includes("/v1/me/playlists") && init?.method === "POST";
    if (isCreatePlaylist) {
      console.log("[Spotify] request", {
        attempt,
        method: init?.method ?? "GET",
        url,
        body:
          typeof init?.body === "string"
            ? init.body
            : init?.body
              ? String(init.body)
              : null,
      });
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers as Record<string, string>),
        },
        signal:
          timeoutSignal && init?.signal && typeof AbortSignal.any === "function"
            ? AbortSignal.any([timeoutSignal, init.signal])
            : (timeoutSignal ?? init?.signal),
        cache: "no-store",
      });
    } catch (e) {
      const isAbort =
        e instanceof Error &&
        (e.name === "AbortError" || e.name === "TimeoutError");
      lastError = new Error(
        isAbort
          ? "Spotify API timeout: request took too long"
          : e instanceof Error
            ? e.message
            : "Spotify request failed",
      );
      if (attempt >= maxAttempts) {
        throw lastError;
      }
      await sleep(Math.min(maxBackoffMs, 400 * 2 ** (attempt - 1)));
      continue;
    }

    if (res.ok) {
      if (isCreatePlaylist) {
        console.log("[Spotify] response ok", { attempt, status: res.status });
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    const t = await res.text();
    if (isCreatePlaylist) {
      console.log("[Spotify] response", {
        attempt,
        status: res.status,
        retryAfter: res.headers.get("Retry-After"),
        body: t.slice(0, 500),
      });
    }
    lastError = new SpotifyApiError(
      res.status,
      t,
      res.status === 429
        ? parseRetryAfterSec(res.headers.get("Retry-After"))
        : undefined,
    );

    const retryable =
      res.status === 503 || (res.status === 429 && retryOn429);
    if (!retryable || attempt >= maxAttempts) {
      throw lastError;
    }

    let waitMs = Math.min(maxBackoffMs, 500 * 2 ** (attempt - 1));
    const retryAfterSec = parseRetryAfterSec(
      res.headers.get("Retry-After"),
      30,
    );
    waitMs = Math.min(maxRetryAfterMs, Math.max(waitMs, retryAfterSec * 1000));
    await sleep(waitMs);
  }

  throw lastError ?? new Error("Spotify request failed");
}

async function spotifyJson<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers as Record<string, string>),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Spotify API ${res.status}: ${t.slice(0, 400)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getSpotifyCurrentUserId(accessToken: string): Promise<string> {
  assertSpotifyCircuitAvailable();
  const me = await spotifyJson<{ id: string }>(
    accessToken,
    "https://api.spotify.com/v1/me",
  );
  return me.id;
}

/** Create an empty playlist for the current user (requires playlist-modify-* scopes). */
export async function createSpotifyPlaylist(
  accessToken: string,
  name: string,
  description?: string | null,
): Promise<{ id: string }> {
  assertSpotifyCircuitAvailable();
  return spotifyJsonWithRetry<{ id: string }>(
    accessToken,
    "https://api.spotify.com/v1/me/playlists",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description ?? undefined,
        public: false,
      }),
    },
    {
      maxAttempts: 2,
      retryOn429: false,
      maxBackoffMs: 1500,
      fetchTimeoutMs: 8_000,
    },
  );
}

/** Custom JPEG cover (max 256 KB). Requires `ugc-image-upload` scope. */
export async function uploadSpotifyPlaylistCover(
  accessToken: string,
  playlistId: string,
  jpeg: Buffer,
): Promise<void> {
  assertSpotifyCircuitAvailable();
  if (jpeg.byteLength > 256_000) {
    throw new Error("Playlist cover exceeds Spotify’s 256 KB limit");
  }
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/images`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
      },
      body: jpeg.toString("base64"),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      `Spotify cover upload failed: ${res.status} ${t.slice(0, 200)}`,
    );
  }
}

/** Replace entire playlist track list (0–N tracks). Batches when >100 URIs. */
export async function replacePlaylistTracks(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  assertSpotifyCircuitAvailable();
  /** Use `/items` — `/tracks` is deprecated and often returns 403 in dev mode. */
  const base = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`;

  if (uris.length === 0) {
    const res = await fetch(base, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [] }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Spotify clear tracks failed: ${res.status}`);
    }
    return;
  }

  const first = uris.slice(0, 100);
  const res1 = await fetch(base, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: first }),
    cache: "no-store",
  });
  if (!res1.ok) {
    const t = await res1.text();
    throw new Error(`Spotify replace tracks failed: ${res1.status} ${t.slice(0, 200)}`);
  }

  let offset = 100;
  while (offset < uris.length) {
    const batch = uris.slice(offset, offset + 100);
    const res = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: batch }),
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Spotify add tracks failed: ${res.status} ${t.slice(0, 200)}`);
    }
    offset += 100;
  }
}

/** Remove playlist from the current user’s library (WAM-created playlists). */
export async function unfollowSpotifyPlaylist(
  accessToken: string,
  playlistId: string,
): Promise<void> {
  assertSpotifyCircuitAvailable();
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/followers`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`Spotify unfollow playlist failed: ${res.status} ${t.slice(0, 200)}`);
  }
}
