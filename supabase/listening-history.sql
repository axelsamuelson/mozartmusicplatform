-- Listening history captured from currently-playing (any Spotify device, incl. iPhone).
-- Run once in Supabase SQL Editor.

create table if not exists listening_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  spotify_id text not null,
  name text not null,
  artist_name text,
  artist_id text,
  image_url text,
  played_at timestamptz not null default now(),
  unique (user_id, spotify_id)
);

create index if not exists listening_history_user_played_idx
  on listening_history (user_id, played_at desc);

alter table listening_history enable row level security;

drop policy if exists "Users read own listening history" on listening_history;
create policy "Users read own listening history"
  on listening_history for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users upsert own listening history" on listening_history;
create policy "Users upsert own listening history"
  on listening_history for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own listening history" on listening_history;
create policy "Users update own listening history"
  on listening_history for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table listening_history to authenticated;
