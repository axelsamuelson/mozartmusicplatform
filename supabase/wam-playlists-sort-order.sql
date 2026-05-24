-- Playlist track order when syncing to Spotify
alter table wam_playlists
  add column if not exists sort_order text not null default 'recently_rated';
