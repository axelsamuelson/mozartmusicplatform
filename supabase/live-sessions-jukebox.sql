-- WAM Live Sessions — Jukebox mode (run in Supabase SQL Editor after live-sessions.sql).

alter table live_sessions
  add column if not exists jukebox_enabled boolean not null default false,
  add column if not exists current_queue_id uuid,
  add column if not exists current_track_user_id uuid references auth.users (id) on delete set null;

create table if not exists live_queue (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  display_name text,
  spotify_track_id text not null,
  track_name text not null,
  artist_name text,
  image_url text,
  position integer not null default 1,
  queued_at timestamptz default now(),
  played_at timestamptz,
  scores_applied boolean not null default false
);

create index if not exists live_queue_session_position_idx
  on live_queue (session_id, position)
  where played_at is null;

create index if not exists live_queue_session_user_pending_idx
  on live_queue (session_id, user_id)
  where played_at is null;

create table if not exists live_scores (
  session_id uuid references live_sessions (id) on delete cascade not null,
  user_id uuid references auth.users (id) on delete cascade not null,
  display_name text,
  points integer not null default 0 check (points >= 0),
  tracks_played integer not null default 0 check (tracks_played >= 0),
  avg_score numeric(5, 2),
  primary key (session_id, user_id)
);

create index if not exists live_scores_session_points_idx
  on live_scores (session_id, points desc);

alter table live_queue enable row level security;
alter table live_scores enable row level security;

drop policy if exists "Read queue for active sessions" on live_queue;
create policy "Read queue for active sessions"
  on live_queue for select
  to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.is_active = true
        and ls.expires_at > now()
    )
  );

drop policy if exists "Users insert own queue items" on live_queue;
create policy "Users insert own queue items"
  on live_queue for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own queue items" on live_queue;
create policy "Users update own queue items"
  on live_queue for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Host updates queue in session" on live_queue;
create policy "Host updates queue in session"
  on live_queue for update
  to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.host_user_id = auth.uid()
    )
  );

drop policy if exists "Users delete own unplayed queue items" on live_queue;
create policy "Users delete own unplayed queue items"
  on live_queue for delete
  to authenticated
  using (auth.uid() = user_id and played_at is null);

drop policy if exists "Read scores for active sessions" on live_scores;
create policy "Read scores for active sessions"
  on live_scores for select
  to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.is_active = true
        and ls.expires_at > now()
    )
  );

drop policy if exists "Users read and write own scores" on live_scores;
create policy "Users read and write own scores"
  on live_scores for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Host may update any score row when advancing the queue (finalize points).
drop policy if exists "Host updates scores in session" on live_scores;
create policy "Host updates scores in session"
  on live_scores for update
  to authenticated
  using (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.host_user_id = auth.uid()
    )
  );

drop policy if exists "Host inserts scores in session" on live_scores;
create policy "Host inserts scores in session"
  on live_scores for insert
  to authenticated
  with check (
    exists (
      select 1 from live_sessions ls
      where ls.id = session_id
        and ls.host_user_id = auth.uid()
    )
  );

do $$
begin
  alter publication supabase_realtime add table live_queue;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table live_scores;
exception
  when duplicate_object then null;
end $$;

alter table live_sessions
  add column if not exists jukebox_ranking_mode text not null default 'points';

alter table live_sessions
  drop constraint if exists live_sessions_jukebox_ranking_mode_check;

alter table live_sessions
  add constraint live_sessions_jukebox_ranking_mode_check
  check (jukebox_ranking_mode in ('points', 'average'));

-- Idempotent column upgrades when live_queue / live_scores already existed
alter table live_queue
  add column if not exists display_name text,
  add column if not exists scores_applied boolean not null default false;

alter table live_scores
  add column if not exists display_name text,
  add column if not exists points integer not null default 0,
  add column if not exists tracks_played integer not null default 0,
  add column if not exists avg_score numeric(5, 2);

alter table live_sessions
  add column if not exists hide_queue_names boolean not null default false;
