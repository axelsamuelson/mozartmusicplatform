import type { ItemType } from "@/lib/spotify/api";

export type MomentSubcategory = "place" | "occasion" | "activity";

export interface GenreTagRow {
  id: number;
  name: string;
}

export interface MoodTagRow {
  id: number;
  level: number;
  name: string;
  description: string | null;
  color: string;
}

export interface MomentTagRow {
  id: number;
  name: string;
  subcategory: MomentSubcategory;
}

/** Cached Spotify row joined to a rating. */
export interface CachedItemSummary {
  spotify_id: string;
  type: ItemType;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  /** First credited artist on Spotify (tracks only); used to aggregate top artists from track scores. */
  primary_artist_id?: string | null;
  /** Calendar year from Spotify release_date (tracks: album year). */
  release_year?: number | null;
}

export interface RatingDetail {
  id: string;
  spotify_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  tempo: number | null;
  intensity: number | null;
  genres: GenreTagRow[];
  /** @deprecated Legacy mood tag — use tempo/intensity for new ratings. */
  mood: MoodTagRow | null;
  moments: MomentTagRow[];
  item: CachedItemSummary | null;
}

export interface DashboardStats {
  total_rated: number;
  avg_score: number;
  rated_this_month: number;
}
