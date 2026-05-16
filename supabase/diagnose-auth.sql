-- Run in Supabase SQL Editor to verify auth is not broken by app migrations.
-- "Error getting user profile from external provider" comes from Spotify API (/me),
-- not from playlist_tracks — but this script checks for DB issues during signup.

-- 1) playlist_tracks exists and is isolated from auth schema
select
  'playlist_tracks' as check_name,
  exists(
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'playlist_tracks'
  ) as ok;

-- 2) No triggers on auth.users from public schema (would run on every signup)
select
  t.tgname as trigger_name,
  n.nspname as schema_name,
  p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal;

-- 3) Common signup trigger on public.profiles (if present)
select
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname in ('profiles', 'users')
  and not t.tgisinternal;

-- 4) profiles table + nullable columns (failed insert would be "Database error", not Spotify)
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- 5) Recent auth users (if any signups succeeded recently)
select id, email, created_at, last_sign_in_at
from auth.users
order by created_at desc
limit 5;
