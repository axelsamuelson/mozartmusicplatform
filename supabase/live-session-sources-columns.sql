-- Patch live_session_sources when table existed before full Jams migration.
-- Run in Supabase SQL editor if you see:
--   Could not find the 'flagged_as_bad_match' column of 'live_session_sources'

alter table live_session_sources
  add column if not exists slots integer not null default 3,
  add column if not exists flagged_as_bad_match boolean not null default false,
  add column if not exists playlist_track_pool jsonb not null default '[]'::jsonb,
  add column if not exists playlist_size integer,
  add column if not exists playlist_name text,
  add column if not exists spotify_playlist_id text,
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Optional: enforce slot range if missing
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_session_sources_slots_check'
  ) then
    alter table live_session_sources
      add constraint live_session_sources_slots_check
      check (slots >= 1 and slots <= 5);
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
