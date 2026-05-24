-- Playlist filters: tempo / intensity (replaces mood levels for new playlists)
alter table wam_playlists
  add column if not exists filter_vibes text[],
  add column if not exists filter_tempo_min smallint,
  add column if not exists filter_tempo_max smallint,
  add column if not exists filter_intensity_min smallint,
  add column if not exists filter_intensity_max smallint;
