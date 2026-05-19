-- WAM Live Sessions — collaborative real-time rating (run once in Supabase SQL Editor).
-- Also enable Realtime: Database → Publications → supabase_realtime → add these tables.

create table if not exists live_sessions (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  host_user_id uuid references auth.users (id) on delete cascade not null,
  spotify_track_id text,
  track_name text,
  artist_name text,
  image_url text,
  is_active boolean default true,
  anonymous_mode boolean not null default false,
  is_playing boolean default false,
  progress_ms integer default 0,
  duration_ms integer default 0,
  device_name text,
  playback_updated_at timestamptz default now(),
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '4 hours'
);

create table if not exists live_ratings (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  display_name text,
  score integer not null check (score between 0 and 100),
  mood_tag_id integer references mood_tags (id),
  genre_ids integer[] not null default '{}',
  comment text,
  spotify_track_id text,
  submitted_at timestamptz default now()
);

create index if not exists live_sessions_code_idx on live_sessions (code) where is_active = true;
create index if not exists live_sessions_host_idx on live_sessions (host_user_id);
create index if not exists live_ratings_session_idx on live_ratings (session_id);

alter table live_sessions enable row level security;
alter table live_ratings enable row level security;

drop policy if exists "Anyone can read active sessions" on live_sessions;
create policy "Anyone can read active sessions"
  on live_sessions for select
  to authenticated
  using (is_active = true and expires_at > now());

drop policy if exists "Host manages own session" on live_sessions;
create policy "Host manages own session"
  on live_sessions for all
  to authenticated
  using (auth.uid() = host_user_id)
  with check (auth.uid() = host_user_id);

drop policy if exists "Anyone can read live ratings" on live_ratings;
create policy "Anyone can read live ratings"
  on live_ratings for select
  to authenticated
  using (true);

drop policy if exists "Users manage own live ratings" on live_ratings;
create policy "Users manage own live ratings"
  on live_ratings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime (ignore error if already added)
do $$
begin
  alter publication supabase_realtime add table live_sessions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table live_ratings;
exception
  when duplicate_object then null;
end $$;

-- Idempotent upgrades when tables already existed (older schema)
alter table live_sessions
  add column if not exists is_playing boolean default false,
  add column if not exists progress_ms integer default 0,
  add column if not exists duration_ms integer default 0,
  add column if not exists device_name text,
  add column if not exists playback_updated_at timestamptz default now();

alter table live_ratings
  add column if not exists spotify_track_id text;

update live_ratings lr
set spotify_track_id = ls.spotify_track_id
from live_sessions ls
where lr.session_id = ls.id
  and lr.spotify_track_id is null
  and ls.spotify_track_id is not null;

alter table live_ratings
  drop constraint if exists live_ratings_session_id_user_id_key;

drop index if exists live_ratings_session_user_track_uidx;

create unique index if not exists live_ratings_session_user_track_uidx
  on live_ratings (session_id, user_id, spotify_track_id);

alter table live_sessions
  add column if not exists anonymous_mode boolean not null default false;

create table if not exists live_session_aliases (
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  alias text not null,
  created_at timestamptz default now(),
  primary key (session_id, user_id)
);

create unique index if not exists live_session_aliases_session_alias_uidx
  on live_session_aliases (session_id, alias);

alter table live_session_aliases enable row level security;

drop policy if exists "Read aliases for active sessions" on live_session_aliases;
create policy "Read aliases for active sessions"
  on live_session_aliases for select
  to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.is_active = true
        and ls.expires_at > now()
    )
  );

drop policy if exists "Users insert own alias" on live_session_aliases;
create policy "Users insert own alias"
  on live_session_aliases for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Jukebox (see live-sessions-jukebox.sql for full migration)
alter table live_sessions
  add column if not exists jukebox_enabled boolean not null default false,
  add column if not exists jukebox_ranking_mode text not null default 'points',
  add column if not exists hide_queue_names boolean not null default false,
  add column if not exists current_queue_id uuid,
  add column if not exists current_track_user_id uuid references auth.users (id) on delete set null;
