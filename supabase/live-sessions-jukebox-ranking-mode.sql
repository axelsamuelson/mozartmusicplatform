-- Jukebox ranking mode + avg_score column (run after live-sessions-jukebox.sql).

alter table live_sessions
  add column if not exists jukebox_ranking_mode text not null default 'points';

alter table live_sessions
  drop constraint if exists live_sessions_jukebox_ranking_mode_check;

alter table live_sessions
  add constraint live_sessions_jukebox_ranking_mode_check
  check (jukebox_ranking_mode in ('points', 'average'));

-- Rename legacy column if present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_scores'
      and column_name = 'average_rating'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_scores'
      and column_name = 'avg_score'
  ) then
    alter table live_scores rename column average_rating to avg_score;
  end if;
end $$;

alter table live_scores
  add column if not exists avg_score numeric(5, 2);

-- Fix schema cache error when live_queue was created without display_name
alter table live_queue
  add column if not exists display_name text,
  add column if not exists scores_applied boolean not null default false;

alter table live_scores
  add column if not exists display_name text;
