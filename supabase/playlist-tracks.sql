-- Cached Spotify playlist track IDs per user (for library stats without re-fetching).
-- Run once in Supabase SQL editor.

create table if not exists playlist_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  playlist_id text not null,
  total_tracks integer not null default 0,
  track_ids text[] not null default '{}',
  last_synced_at timestamptz not null default now(),
  primary key (user_id, playlist_id)
);

create index if not exists playlist_tracks_user_id_idx on playlist_tracks (user_id);

alter table playlist_tracks enable row level security;

drop policy if exists "Users manage own playlist_tracks" on playlist_tracks;
create policy "Users manage own playlist_tracks"
  on playlist_tracks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
