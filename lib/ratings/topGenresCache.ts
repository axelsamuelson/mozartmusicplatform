/** In-memory cache for /api/tags/top-genres (per browser tab). */

const TTL_MS = 5 * 60_000;

type Entry = {
  at: number;
  ids: number[];
};

let cached: Entry | null = null;
let inflight: Promise<number[]> | null = null;

export function peekTopGenreIds(): number[] | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) return null;
  return cached.ids;
}

export function invalidateTopGenreIdsCache(): void {
  cached = null;
}

export async function loadTopGenreIdsCached(
  signal?: AbortSignal,
): Promise<number[]> {
  const hit = peekTopGenreIds();
  if (hit) return hit;
  if (inflight) return inflight;

  inflight = fetch("/api/tags/top-genres", { cache: "no-store", signal })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as {
        top_genre_ids?: number[];
      };
      if (!res.ok) return [];
      const ids = (body.top_genre_ids ?? []).filter((id): id is number =>
        Number.isInteger(id),
      );
      cached = { at: Date.now(), ids };
      return ids;
    })
    .catch(() => [])
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
