-- WAM Jams — buffers, sources, session ratings, summary (run after live-sessions-jukebox.sql)

-- Session settings
alter table live_sessions
  add column if not exists jams_enabled boolean not null default false,
  add column if not exists wam_controls_playback boolean not null default false,
  add column if not exists co_host_user_id uuid references auth.users (id) on delete set null,
  add column if not exists queue_mode text not null default 'transparent'
    check (queue_mode in ('transparent', 'surprise')),
  add column if not exists ranking_visibility text not null default 'end_only'
    check (ranking_visibility in ('full', 'masked', 'end_only')),
  add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  add column if not exists host_disconnected_at timestamptz,
  add column if not exists host_provider_token text,
  add column if not exists current_track_started_at timestamptz,
  add column if not exists ended_at timestamptz;

-- Manual queue jumps (max 1 pending per user enforced in API)
alter table live_queue
  add column if not exists is_manual boolean not null default false;

-- Per-user music source for Jams rotation
create table if not exists live_session_sources (
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  source_type text not null check (source_type in ('playlist', 'top_rated', 'none')),
  spotify_playlist_id text,
  playlist_name text,
  playlist_size integer,
  slots integer not null default 3 check (slots >= 1 and slots <= 5),
  flagged_as_bad_match boolean not null default false,
  playlist_track_pool jsonb not null default '[]'::jsonb,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Backfill columns when live_session_sources already existed (create table if not exists skips these)
alter table live_session_sources
  add column if not exists slots integer not null default 3,
  add column if not exists flagged_as_bad_match boolean not null default false,
  add column if not exists playlist_track_pool jsonb not null default '[]'::jsonb,
  add column if not exists playlist_size integer,
  add column if not exists playlist_name text,
  add column if not exists spotify_playlist_id text,
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Pre-queued buffer (3 tracks per participant)
create table if not exists live_queue_buffer (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  position integer not null check (position >= 0 and position <= 2),
  spotify_track_id text not null,
  track_name text not null,
  artist_name text,
  image_url text,
  created_at timestamptz not null default now(),
  unique (session_id, user_id, position)
);

create index if not exists live_queue_buffer_session_user_idx
  on live_queue_buffer (session_id, user_id, position);

-- Tracks blocked for remainder of session
create table if not exists live_track_blacklist (
  session_id uuid references live_sessions (id) on delete cascade not null,
  spotify_track_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (session_id, spotify_track_id)
);

-- Session-scoped ratings (separate from library `ratings`)
create table if not exists live_session_ratings (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  spotify_track_id text not null,
  score integer not null check (score >= 0 and score <= 100),
  mood_tag_id integer,
  is_retroactive boolean not null default false,
  rating_time_ms integer,
  submitted_at timestamptz not null default now(),
  unique (session_id, user_id, spotify_track_id, is_retroactive)
);

create index if not exists live_session_ratings_session_track_idx
  on live_session_ratings (session_id, spotify_track_id);

-- End-of-session summary
create table if not exists live_session_summary (
  session_id uuid primary key references live_sessions (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

-- RLS
alter table live_session_sources enable row level security;
alter table live_queue_buffer enable row level security;
alter table live_track_blacklist enable row level security;
alter table live_session_ratings enable row level security;
alter table live_session_summary enable row level security;

drop policy if exists "Read sources in active session" on live_session_sources;
create policy "Read sources in active session"
  on live_session_sources for select to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id and ls.is_active and ls.expires_at > now()
    )
  );

drop policy if exists "Users manage own source" on live_session_sources;
create policy "Users manage own source"
  on live_session_sources for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Read buffers in active session" on live_queue_buffer;
create policy "Read buffers in active session"
  on live_queue_buffer for select to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id and ls.is_active and ls.expires_at > now()
    )
  );

drop policy if exists "Read blacklist in active session" on live_track_blacklist;
create policy "Read blacklist in active session"
  on live_track_blacklist for select to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id and ls.is_active and ls.expires_at > now()
    )
  );

drop policy if exists "Read session ratings in active session" on live_session_ratings;
create policy "Read session ratings in active session"
  on live_session_ratings for select to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id and ls.is_active and ls.expires_at > now()
    )
  );

drop policy if exists "Users insert own session ratings" on live_session_ratings;
create policy "Users insert own session ratings"
  on live_session_ratings for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Read summary after session" on live_session_summary;
create policy "Read summary after session"
  on live_session_summary for select to authenticated
  using (true);

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_queue_buffer'
  ) then
    alter publication supabase_realtime add table live_queue_buffer;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_session_sources'
  ) then
    alter publication supabase_realtime add table live_session_sources;
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
