-- Live session playback sync — safe to re-run on existing databases.
-- Run this if live_sessions / live_ratings already exist from an older migration.

-- Playback state on sessions (host sync → participants)
alter table live_sessions
  add column if not exists is_playing boolean default false,
  add column if not exists progress_ms integer default 0,
  add column if not exists duration_ms integer default 0,
  add column if not exists device_name text,
  add column if not exists playback_updated_at timestamptz default now();

-- Per-track ratings (one row per user per track per session)
alter table live_ratings
  add column if not exists spotify_track_id text;

-- Backfill track id from session for any legacy rows
update live_ratings lr
set spotify_track_id = ls.spotify_track_id
from live_sessions ls
where lr.session_id = ls.id
  and lr.spotify_track_id is null
  and ls.spotify_track_id is not null;

-- Replace old unique(session_id, user_id) with per-track uniqueness
alter table live_ratings
  drop constraint if exists live_ratings_session_id_user_id_key;

drop index if exists live_ratings_session_user_track_uidx;

create unique index if not exists live_ratings_session_user_track_uidx
  on live_ratings (session_id, user_id, spotify_track_id);
