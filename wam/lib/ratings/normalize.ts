import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItemType } from "@/lib/spotify/api";
import type {
  CachedItemSummary,
  MomentTagRow,
  MoodTagRow,
  RatingDetail,
} from "@/lib/types/ratings";

export const RATING_SELECT = `
  id,
  spotify_id,
  score,
  comment,
  created_at,
  updated_at,
  cached_items (
    spotify_id,
    type,
    name,
    artist_name,
    image_url,
    primary_artist_id,
    preview_url,
    genres
  ),
  rating_genres (
    genre_tag_id,
    genre_tags ( id, name )
  ),
  rating_moods (
    mood_tag_id,
    mood_tags ( id, level, name, description, color )
  ),
  rating_moments (
    moment_tag_id,
    moment_tags ( id, name, subcategory )
  )
`;

export function parseCachedItem(row: Record<string, unknown>): CachedItemSummary | null {
  const raw = row.cached_items as unknown;
  const ci = (Array.isArray(raw) ? raw[0] : raw) as
    | {
        spotify_id?: string;
        type?: string;
        name?: string;
        artist_name?: string | null;
        image_url?: string | null;
      }
    | null
    | undefined;
  if (!ci || typeof ci !== "object") return null;
  const t = ci.type;
  if (t !== "track" && t !== "album" && t !== "artist") return null;
  if (!ci.spotify_id || !ci.name) return null;
  const primary =
    typeof (ci as { primary_artist_id?: unknown }).primary_artist_id === "string"
      ? (ci as { primary_artist_id: string }).primary_artist_id.trim() || null
      : null;
  return {
    spotify_id: ci.spotify_id,
    type: t as ItemType,
    name: ci.name,
    artist_name: ci.artist_name ?? null,
    image_url: ci.image_url ?? null,
    primary_artist_id: t === "track" ? primary : null,
  };
}

export function normalizeRating(row: Record<string, unknown>): RatingDetail {
  const rg = row.rating_genres as
    | Array<{ genre_tags: { id: number; name: string } | null }>
    | null
    | undefined;
  const genres = (rg ?? [])
    .map((x) => x.genre_tags)
    .filter((g): g is { id: number; name: string } => Boolean(g));

  let mood: MoodTagRow | null = null;
  const rm = row.rating_moods as
    | { mood_tags: MoodTagRow | null }
    | Array<{ mood_tags: MoodTagRow | null }>
    | null
    | undefined;
  if (Array.isArray(rm)) {
    const first = rm[0];
    mood = first?.mood_tags ?? null;
  } else if (rm && typeof rm === "object" && "mood_tags" in rm) {
    mood = rm.mood_tags ?? null;
  }

  const rmo = row.rating_moments as
    | Array<{ moment_tags: MomentTagRow | null }>
    | null
    | undefined;
  const moments = (rmo ?? [])
    .map((x) => x.moment_tags)
    .filter((m): m is MomentTagRow => Boolean(m));

  return {
    id: row.id as string,
    spotify_id: row.spotify_id as string,
    score: row.score as number,
    comment: (row.comment as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    genres,
    mood,
    moments,
    item: parseCachedItem(row),
  };
}

export async function fetchRatingById(
  supabase: SupabaseClient,
  ratingId: string,
): Promise<RatingDetail | null> {
  const { data, error } = await supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("id", ratingId)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeRating(data as Record<string, unknown>);
}

export async function loadAllUserRatings(
  supabase: SupabaseClient,
  userId: string,
): Promise<RatingDetail[]> {
  const { data, error } = await supabase
    .from("ratings")
    .select(RATING_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    normalizeRating(row as Record<string, unknown>),
  );
}
