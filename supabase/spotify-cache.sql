-- Spotify API response cache (server-only via service role).
-- Run in Supabase SQL Editor.

create table if not exists spotify_cache (
  key          text primary key,
  data         jsonb not null,
  cached_at    timestamptz not null default now(),
  ttl_seconds  integer not null default 300
);

create index if not exists spotify_cache_cached_at_idx on spotify_cache (cached_at);

comment on table spotify_cache is 'Server-side Spotify API cache; no RLS — access via service role only.';

create or replace function cleanup_spotify_cache()
returns bigint
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from spotify_cache
    where cached_at + (ttl_seconds * interval '1 second') < now()
    returning 1
  )
  select count(*)::bigint from deleted;
$$;
