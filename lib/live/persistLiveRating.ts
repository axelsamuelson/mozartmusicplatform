import type { SupabaseClient } from "@supabase/supabase-js";

import { syncWamPlaylistsForRating } from "@/lib/playlist/syncWamPlaylist";
import { fetchRatingById } from "@/lib/ratings/normalize";
import { replaceRatingTags } from "@/lib/ratings/replaceRatingTags";
import type { LiveSessionRow } from "@/lib/types/live";
import type { RatingDetail } from "@/lib/types/ratings";

export type PersistLiveRatingInput = {
  score: number;
  tempo: number | null;
  intensity: number | null;
  genre_ids: number[];
  moment_ids: number[];
  comment: string | null;
  display_name: string;
};

/** Mirror live rating into cached_items + ratings (personal library). */
export async function persistLiveRatingToLibrary(
  supabase: SupabaseClient,
  userId: string,
  session: LiveSessionRow,
  input: PersistLiveRatingInput,
  options?: {
    previousScore?: number;
    previousRating?: RatingDetail | null;
  },
): Promise<void> {
  const spotifyId = session.spotify_track_id;
  if (!spotifyId) return;

  const now = new Date().toISOString();
  await supabase.from("cached_items").upsert(
    {
      spotify_id: spotifyId,
      type: "track",
      name: session.track_name ?? "Unknown track",
      artist_name: session.artist_name,
      image_url: session.image_url,
      preview_url: null,
      genres: null,
      cached_at: now,
    },
    { onConflict: "spotify_id" },
  );

  const { data: existing } = await supabase
    .from("ratings")
    .select("id, score")
    .eq("user_id", userId)
    .eq("spotify_id", spotifyId)
    .maybeSingle();

  const previousRating =
    options?.previousRating ??
    (existing?.id
      ? await fetchRatingById(supabase, existing.id as string)
      : null);

  let ratingId: string;
  if (existing?.id) {
    ratingId = existing.id as string;
    await supabase
      .from("ratings")
      .update({
        score: input.score,
        comment: input.comment === "" ? null : input.comment,
        tempo: input.tempo,
        intensity: input.intensity,
      })
      .eq("id", ratingId);
  } else {
    const { data: inserted } = await supabase
      .from("ratings")
      .insert({
        user_id: userId,
        spotify_id: spotifyId,
        score: input.score,
        comment: input.comment === "" ? null : input.comment,
        tempo: input.tempo,
        intensity: input.intensity,
      })
      .select("id")
      .single();
    if (!inserted?.id) return;
    ratingId = inserted.id as string;
  }

  const tags = await replaceRatingTags(
    supabase,
    ratingId,
    input.genre_ids,
    input.moment_ids,
  );
  if (tags.error) {
    throw new Error(tags.error);
  }

  const full = await fetchRatingById(supabase, ratingId);
  if (full) {
    await syncWamPlaylistsForRating(supabase, userId, full, {
      previousRating,
      previousScore: options?.previousScore,
    });
  }
}
