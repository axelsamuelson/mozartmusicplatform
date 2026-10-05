import type { CachedItemPayload } from "@/lib/spotify/api";

export type RatingNeighborDirection = "below" | "above";

export type RatingNeighborRow = {
  direction: RatingNeighborDirection;
  track_id: string;
  score: number;
};

export type RatingNeighborItem = {
  track_id: string;
  score: number;
  name: string;
  artist_name: string | null;
  image_url: string | null;
};

export type RatingNeighborsResult = {
  below: RatingNeighborItem | null;
  above: RatingNeighborItem | null;
};

export function isRatingNeighborDirection(
  value: string,
): value is RatingNeighborDirection {
  return value === "below" || value === "above";
}

export function parseRatingNeighborRows(
  rows: unknown,
): RatingNeighborRow[] {
  if (!Array.isArray(rows)) return [];
  const out: RatingNeighborRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const direction = typeof r.direction === "string" ? r.direction : "";
    const trackId = typeof r.track_id === "string" ? r.track_id : "";
    const score = Number(r.score);
    if (!isRatingNeighborDirection(direction) || !trackId || !Number.isFinite(score)) {
      continue;
    }
    out.push({ direction, track_id: trackId, score });
  }
  return out;
}

export function neighborItemFromCache(
  trackId: string,
  score: number,
  cached: {
    name?: string | null;
    artist_name?: string | null;
    image_url?: string | null;
  } | null,
): RatingNeighborItem {
  return {
    track_id: trackId,
    score,
    name: cached?.name?.trim() || "Unknown track",
    artist_name: cached?.artist_name ?? null,
    image_url: cached?.image_url ?? null,
  };
}

export function neighborItemFromSpotifyPayload(
  trackId: string,
  score: number,
  payload: CachedItemPayload,
): RatingNeighborItem {
  return {
    track_id: trackId,
    score,
    name: payload.name?.trim() || "Unknown track",
    artist_name: payload.artist_name,
    image_url: payload.image_url,
  };
}
