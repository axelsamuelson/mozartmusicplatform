-- Optional metadata for playback context (run once if playlist_tracks already exists).
alter table playlist_tracks add column if not exists name text;
alter table playlist_tracks add column if not exists image_url text;
