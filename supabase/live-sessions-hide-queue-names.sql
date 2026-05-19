-- Hide who queued each track in the Jukebox queue list.

alter table live_sessions
  add column if not exists hide_queue_names boolean not null default false;
