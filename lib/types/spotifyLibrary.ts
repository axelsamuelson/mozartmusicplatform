/** List row from GET /api/spotify/my-playlists. */
export interface SpotifyPlaylistListItem {
  id: string;
  name: string;
  image_url: string | null;
  owner: string;
  /** From Spotify `items.total` (or legacy `tracks.total`) on the playlist object. */
  total_tracks: number;
  /** Present when playlist_tracks cache matches Spotify total_tracks. */
  rated_count: number | null;
  unrated_count: number | null;
  rated_percent: number | null;
  /** True when stats are missing or Spotify track count differs from cache. */
  needs_sync: boolean;
  /** True when no `playlist_tracks` row — only these auto-sync on page load. */
  missing_tracks_cache: boolean;
}

/** POST /api/spotify/sync-playlist-tracks */
export interface SpotifyPlaylistStatsPayload {
  rated_count: number;
  unrated_count: number;
  rated_percent: number;
  total_tracks: number;
}
