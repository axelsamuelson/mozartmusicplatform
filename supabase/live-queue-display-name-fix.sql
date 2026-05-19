-- Fix: Could not find the 'display_name' column of 'live_queue' in the schema cache
-- Run once in Supabase SQL Editor, then reload the API schema (or wait ~1 min).

alter table live_queue
  add column if not exists display_name text;

alter table live_queue
  add column if not exists scores_applied boolean not null default false;

alter table live_scores
  add column if not exists display_name text;

alter table live_scores
  add column if not exists avg_score numeric(5, 2);

-- Notify PostgREST to refresh schema cache (Supabase)
notify pgrst, 'reload schema';
