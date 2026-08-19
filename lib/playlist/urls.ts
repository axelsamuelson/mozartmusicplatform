export function spotifyPlaylistWebUrl(playlistId: string): string {
  return `https://open.spotify.com/playlist/${encodeURIComponent(playlistId)}`;
}

export function wamPlaylistRankHref(wamId: string): string {
  return `/playlists/${encodeURIComponent(wamId)}/rank`;
}

export function spotifyPlaylistRankHref(spotifyId: string): string {
  return `/playlists/spotify/${encodeURIComponent(spotifyId)}`;
}
