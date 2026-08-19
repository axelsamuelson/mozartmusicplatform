import type { SupabaseClient } from "@supabase/supabase-js";

/** Spotify track IDs the user has rated (only items cached as `track`). */
export async function loadUserRatedTrackSpotifyIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("ratings")
    .select("spotify_id, cached_items!inner(type)")
    .eq("user_id", userId)
    .eq("cached_items.type", "track");

  if (error) {
    throw new Error(error.message);
  }

  const trackRated = new Set<string>();
  for (const row of data ?? []) {
    const id = row.spotify_id as string;
    if (typeof id === "string" && id.length > 0) {
      trackRated.add(id);
    }
  }
  return trackRated;
}
