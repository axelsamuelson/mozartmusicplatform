-- Spotify Jam Overlay mode (run in Supabase SQL Editor).

alter table live_sessions
  add column if not exists mode text not null default 'wam_hosted';

alter table live_sessions
  drop constraint if exists live_sessions_mode_check;

alter table live_sessions
  add constraint live_sessions_mode_check
  check (mode in ('wam_hosted', 'spotify_jam_overlay'));

notify pgrst, 'reload schema';
