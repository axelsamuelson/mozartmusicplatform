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
  tempo,
  intensity,
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
    genres,
    release_year
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

/** Enough for playlist matching, ranks, and profile aggregates — no comments or artwork extras. */
export const RATING_SELECT_SLIM = `
  id,
  spotify_id,
  score,
  tempo,
  intensity,
  created_at,
  updated_at,
  cached_items (
    spotify_id,
    type,
    name,
    artist_name,
    image_url,
    primary_artist_id,
    release_year
  ),
  rating_genres (
    genre_tags ( id, name )
  ),
  rating_moods (
    mood_tags ( id, level, name )
  ),
  rating_moments (
    moment_tags ( id, name, subcategory )
  )
`;

const RATINGS_PAGE = 1000;
const IN_CHUNK = 200;

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
  const releaseYearRaw = (ci as { release_year?: unknown }).release_year;
  const release_year =
    typeof releaseYearRaw === "number" && Number.isFinite(releaseYearRaw)
      ? Math.round(releaseYearRaw)
      : null;
  return {
    spotify_id: ci.spotify_id,
    type: t as ItemType,
    name: ci.name,
    artist_name: ci.artist_name ?? null,
    image_url: ci.image_url ?? null,
    primary_artist_id: t === "track" ? primary : null,
    release_year,
  };
}

function coerceMood(raw: MoodTagRow | null | undefined): MoodTagRow | null {
  if (!raw || typeof raw.id !== "number" || typeof raw.level !== "number") return null;
  return {
    id: raw.id,
    level: raw.level,
    name: typeof raw.name === "string" ? raw.name : "",
    description: raw.description ?? null,
    color: typeof raw.color === "string" ? raw.color : "",
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
    mood = coerceMood(first?.mood_tags);
  } else if (rm && typeof rm === "object" && "mood_tags" in rm) {
    mood = coerceMood(rm.mood_tags);
  }

  const rmo = row.rating_moments as
    | Array<{ moment_tags: MomentTagRow | null }>
    | null
    | undefined;
  const moments = (rmo ?? [])
    .map((x) => x.moment_tags)
    .filter((m): m is MomentTagRow => Boolean(m));

  const tempoRaw = row.tempo;
  const intensityRaw = row.intensity;
  const tempo =
    typeof tempoRaw === "number" && tempoRaw >= 1 && tempoRaw <= 10
      ? tempoRaw
      : null;
  const intensity =
    typeof intensityRaw === "number" && intensityRaw >= 1 && intensityRaw <= 10
      ? intensityRaw
      : null;

  return {
    id: row.id as string,
    spotify_id: row.spotify_id as string,
    score: row.score as number,
    comment: (row.comment as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    tempo,
    intensity,
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

async function loadRatingsPages(
  supabase: SupabaseClient,
  userId: string,
  select: string,
  itemType?: ItemType,
): Promise<RatingDetail[]> {
  const out: RatingDetail[] = [];
  for (let from = 0; ; from += RATINGS_PAGE) {
    let query = supabase
      .from("ratings")
      .select(select)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .range(from, from + RATINGS_PAGE - 1);
    if (itemType) {
      query = query.eq("cached_items.type", itemType);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      out.push(normalizeRating(row as unknown as Record<string, unknown>));
    }
    if (rows.length < RATINGS_PAGE) break;
  }
  return out;
}

/** Full rating rows (comments, mood copy). Prefer slim for matching/ranks. */
export async function loadAllUserRatings(
  supabase: SupabaseClient,
  userId: string,
  itemType?: ItemType,
): Promise<RatingDetail[]> {
  return loadRatingsPages(supabase, userId, RATING_SELECT, itemType);
}

/** Track/album/artist matching, ranks, and profile aggregates. */
export async function loadAllUserRatingsSlim(
  supabase: SupabaseClient,
  userId: string,
  itemType?: ItemType,
): Promise<RatingDetail[]> {
  return loadRatingsPages(supabase, userId, RATING_SELECT_SLIM, itemType);
}

export async function loadUserRatingsBySpotifyIds(
  supabase: SupabaseClient,
  userId: string,
  spotifyIds: string[],
): Promise<RatingDetail[]> {
  const ids = [...new Set(spotifyIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return [];

  const out: RatingDetail[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("ratings")
      .select(RATING_SELECT_SLIM)
      .eq("user_id", userId)
      .in("spotify_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      out.push(normalizeRating(row as Record<string, unknown>));
    }
  }
  return out;
}
