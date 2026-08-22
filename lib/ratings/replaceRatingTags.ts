import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Replace genre/moment tags for a rating without leaving an empty wipe
 * if the insert fails (restore previous rows on failure).
 */
export async function replaceRatingTags(
  supabase: SupabaseClient,
  ratingId: string,
  genreIds: number[],
  momentIds: number[],
): Promise<{ error: string | null }> {
  const [{ data: prevGenres }, { data: prevMoments }] = await Promise.all([
    supabase
      .from("rating_genres")
      .select("genre_tag_id")
      .eq("rating_id", ratingId),
    supabase
      .from("rating_moments")
      .select("moment_tag_id")
      .eq("rating_id", ratingId),
  ]);

  const previousGenreRows = (prevGenres ?? []).map((r) => ({
    rating_id: ratingId,
    genre_tag_id: r.genre_tag_id as number,
  }));
  const previousMomentRows = (prevMoments ?? []).map((r) => ({
    rating_id: ratingId,
    moment_tag_id: r.moment_tag_id as number,
  }));

  const [{ error: delG }, { error: delMom }] = await Promise.all([
    supabase.from("rating_genres").delete().eq("rating_id", ratingId),
    supabase.from("rating_moments").delete().eq("rating_id", ratingId),
  ]);
  if (delG) return { error: delG.message };
  if (delMom) return { error: delMom.message };

  const restorePrevious = async () => {
    if (previousGenreRows.length) {
      await supabase.from("rating_genres").insert(previousGenreRows);
    }
    if (previousMomentRows.length) {
      await supabase.from("rating_moments").insert(previousMomentRows);
    }
  };

  try {
    if (genreIds.length) {
      const { error } = await supabase.from("rating_genres").insert(
        genreIds.map((genre_tag_id) => ({ rating_id: ratingId, genre_tag_id })),
      );
      if (error) {
        await restorePrevious();
        return { error: error.message };
      }
    }
    if (momentIds.length) {
      const { error } = await supabase.from("rating_moments").insert(
        momentIds.map((moment_tag_id) => ({
          rating_id: ratingId,
          moment_tag_id,
        })),
      );
      if (error) {
        await restorePrevious();
        return { error: error.message };
      }
    }
  } catch (e) {
    await restorePrevious();
    return {
      error: e instanceof Error ? e.message : "Failed to write rating tags",
    };
  }

  return { error: null };
}
