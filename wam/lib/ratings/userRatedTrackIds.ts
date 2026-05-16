import type { SupabaseClient } from "@supabase/supabase-js";

const IN_CHUNK = 200;

/** Spotify track IDs the user has rated (only items cached as `track`). */
export async function loadUserRatedTrackSpotifyIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data: ratingsRows, error: ratingsError } = await supabase
    .from("ratings")
    .select("spotify_id")
    .eq("user_id", userId);

  if (ratingsError) {
    throw new Error(ratingsError.message);
  }

  const spotifyIds = [
    ...new Set(
      (ratingsRows ?? [])
        .map((r) => r.spotify_id as string)
        .filter((id) => typeof id === "string" && id.length > 0),
    ),
  ];

  if (spotifyIds.length === 0) {
    return new Set();
  }

  const trackRated = new Set<string>();

  for (let i = 0; i < spotifyIds.length; i += IN_CHUNK) {
    const batch = spotifyIds.slice(i, i + IN_CHUNK);
    const { data: cachedRows, error: cachedError } = await supabase
      .from("cached_items")
      .select("spotify_id, type")
      .in("spotify_id", batch);

    if (cachedError) {
      throw new Error(cachedError.message);
    }

    for (const row of cachedRows ?? []) {
      if (row.type === "track") {
        trackRated.add(row.spotify_id as string);
      }
    }
  }

  return trackRated;
}
