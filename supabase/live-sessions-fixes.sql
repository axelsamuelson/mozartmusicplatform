-- WAM Sessions fixes: advance lock, host token expiry, source sync status
-- Run after live-sessions-jams.sql

alter table live_sessions
  add column if not exists advance_lock_at timestamptz,
  add column if not exists host_token_expires_at timestamptz,
  add column if not exists host_provider_refresh_token text;

alter table live_session_sources
  add column if not exists playlist_sync_status text not null default 'ready'
    check (playlist_sync_status in ('ready', 'loading', 'error'));

notify pgrst, 'reload schema';
