import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchTrackMetadataBatch } from "@/lib/spotify/batchTrackMetadata";
import { isSpotifyCircuitOpen } from "@/lib/spotify/rateLimiter";

export type TrackMetadataFields = {
  spotify_track_id: string;
  track_name: string | null;
  artist_name: string | null;
  image_url: string | null;
};

/** Resolve track display fields from cached_items, optional Spotify batch fallback. */
export async function enrichTracksFromCacheAndSpotify(
  supabase: SupabaseClient,
  trackIds: string[],
  accessToken?: string | null,
): Promise<Map<string, TrackMetadataFields>> {
  const unique = [...new Set(trackIds.filter(Boolean))];
  const out = new Map<string, TrackMetadataFields>();

  if (unique.length === 0) return out;

  const { data: cached } = await supabase
    .from("cached_items")
    .select("spotify_id, name, artist_name, image_url")
    .in("spotify_id", unique.slice(0, 200));

  for (const row of cached ?? []) {
    const id = row.spotify_id as string;
    out.set(id, {
      spotify_track_id: id,
      track_name: (row.name as string) ?? null,
      artist_name: (row.artist_name as string | null) ?? null,
      image_url: (row.image_url as string | null) ?? null,
    });
  }

  const missingIds = unique.filter((id) => !out.has(id) || !out.get(id)?.track_name);

  if (missingIds.length > 0 && accessToken && !isSpotifyCircuitOpen()) {
    const spotify = await fetchTrackMetadataBatch(accessToken, missingIds);
    for (const [id, meta] of spotify) {
      out.set(id, meta);
    }
  } else if (missingIds.length > 0 && !accessToken) {
    console.warn("[up-next] No host token, metadata may be incomplete");
  }

  for (const id of unique) {
    if (!out.has(id)) {
      out.set(id, {
        spotify_track_id: id,
        track_name: null,
        artist_name: null,
        image_url: null,
      });
    }
  }

  return out;
}
