alter table wam_playlists
  add column if not exists filter_release_year_min smallint,
  add column if not exists filter_release_year_max smallint;
