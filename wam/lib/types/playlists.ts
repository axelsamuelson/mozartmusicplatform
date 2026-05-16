export interface WamPlaylistRow {
  id: string;
  user_id: string;
  spotify_playlist_id: string;
  name: string;
  description: string | null;
  filter_genres: string[] | null;
  filter_mood_levels: number[] | null;
  filter_moments: string[] | null;
  filter_min_score: number;
  track_count: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}
