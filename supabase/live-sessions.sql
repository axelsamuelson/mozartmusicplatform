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
  submitted_at timestamptz default now(),
  unique (session_id, user_id)
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
