-- Release year from Spotify (track album / album release_date)
alter table cached_items
  add column if not exists release_year smallint;
