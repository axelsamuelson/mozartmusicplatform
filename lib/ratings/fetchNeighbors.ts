import { createClient } from "@/lib/supabase/client";
import {
  neighborItemFromCache,
  parseRatingNeighborRows,
  type RatingNeighborItem,
  type RatingNeighborsResult,
} from "@/lib/ratings/neighbors";

type CachedMeta = {
  name: string;
  artist_name: string | null;
  image_url: string | null;
};

type ItemApiBody = {
  item?: {
    spotify_id?: string;
    name?: string;
    artist_name?: string | null;
    image_url?: string | null;
  };
  error?: string;
};

async function loadCachedMeta(
  supabase: ReturnType<typeof createClient>,
  trackIds: string[],
): Promise<Map<string, CachedMeta>> {
  const map = new Map<string, CachedMeta>();
  if (trackIds.length === 0) return map;

  const { data } = await supabase
    .from("cached_items")
    .select("spotify_id, name, artist_name, image_url")
    .in("spotify_id", trackIds);

  for (const row of data ?? []) {
    const id = row.spotify_id as string;
    if (!id) continue;
    map.set(id, {
      name: (row.name as string) ?? "",
      artist_name: (row.artist_name as string | null) ?? null,
      image_url: (row.image_url as string | null) ?? null,
    });
  }
  return map;
}

async function fetchMetaViaItemApi(
  trackId: string,
  signal?: AbortSignal,
): Promise<CachedMeta | null> {
  const res = await fetch(
    `/api/spotify/item/${encodeURIComponent(trackId)}?type=track`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as ItemApiBody;
  const item = body.item;
  if (!item?.name?.trim()) return null;
  return {
    name: item.name,
    artist_name: item.artist_name ?? null,
    image_url: item.image_url ?? null,
  };
}

/**
 * One RPC (`get_rating_neighbors`) from the browser client, then metadata
 * from `cached_items` with `/api/spotify/item` (cachedSpotifyRequest) fallback.
 */
export async function fetchRatingNeighbors(
  spotifyId: string,
  signal?: AbortSignal,
): Promise<RatingNeighborsResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_rating_neighbors", {
    p_track_id: spotifyId,
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (error) {
    throw new Error(error.message);
  }

  const rows = parseRatingNeighborRows(data);
  const trackIds = [...new Set(rows.map((r) => r.track_id))];
  const cached = await loadCachedMeta(supabase, trackIds);

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const result: RatingNeighborsResult = { below: null, above: null };

  await Promise.all(
    rows.map(async (row) => {
      let meta = cached.get(row.track_id) ?? null;
      if (!meta?.name?.trim()) {
        meta = await fetchMetaViaItemApi(row.track_id, signal);
      }
      const item: RatingNeighborItem = neighborItemFromCache(
        row.track_id,
        row.score,
        meta,
      );
      if (row.direction === "below") result.below = item;
      else result.above = item;
    }),
  );

  return result;
}
