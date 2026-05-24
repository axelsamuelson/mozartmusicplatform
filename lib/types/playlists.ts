export type PlaylistSortOrder =
  | "recently_rated"
  | "score_desc"
  | "score_asc"
  | "title_asc"
  | "title_desc";

export interface WamPlaylistRow {
  id: string;
  user_id: string;
  spotify_playlist_id: string;
  name: string;
  description: string | null;
  filter_genres: string[] | null;
  /** @deprecated Legacy mood level filter */
  filter_mood_levels: number[] | null;
  filter_moments: string[] | null;
  filter_min_score: number;
  filter_vibes: string[] | null;
  filter_tempo_min: number | null;
  filter_tempo_max: number | null;
  filter_intensity_min: number | null;
  filter_intensity_max: number | null;
  filter_release_year_min: number | null;
  filter_release_year_max: number | null;
  sort_order: PlaylistSortOrder;
  track_count: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}
