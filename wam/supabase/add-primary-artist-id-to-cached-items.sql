-- Primary artist Spotify id for tracks (used for profile "top artists" from track scores).
-- Run once on your Supabase project.

alter table cached_items
  add column if not exists primary_artist_id text;

comment on column cached_items.primary_artist_id is
  'Spotify artist id for the track''s first credited artist; filled when the track is fetched via the item API.';
