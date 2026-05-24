-- Tempo & intensity on ratings (replaces mood scale for new ratings).
-- Run in Supabase SQL Editor.

alter table ratings
  add column if not exists tempo smallint check (tempo between 1 and 10),
  add column if not exists intensity smallint check (intensity between 1 and 10);

alter table live_ratings
  add column if not exists tempo smallint check (tempo between 1 and 10),
  add column if not exists intensity smallint check (intensity between 1 and 10);

alter table live_session_ratings
  add column if not exists tempo smallint check (tempo between 1 and 10),
  add column if not exists intensity smallint check (intensity between 1 and 10);
