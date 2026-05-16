/** List row from GET /api/spotify/my-playlists (fast; no per-playlist track scan). */
export interface SpotifyPlaylistListItem {
  id: string;
  name: string;
  image_url: string | null;
  owner: string;
  /** From Spotify `tracks.total` on the playlist object. */
  total_tracks: number;
}

/** GET /api/spotify/playlist-stats?id=… */
export interface SpotifyPlaylistStatsPayload {
  rated_count: number;
  unrated_count: number;
  rated_percent: number;
  /** Total used for stats (from paginated playlist items / Spotify `total`). */
  total_tracks: number;
}

/** @deprecated Use SpotifyPlaylistListItem + SpotifyPlaylistStatsPayload for progressive load. */
export interface SpotifyLibraryPlaylistRow {
  id: string;
  name: string;
  image_url: string | null;
  owner: string;
  total_tracks: number;
  rated_count: number;
  unrated_count: number;
  rated_percent: number;
}
