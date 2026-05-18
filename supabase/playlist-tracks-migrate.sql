-- Fix playlist_tracks schema when the table exists but column names differ.
-- Run once in Supabase → SQL Editor if you see:
--   column playlist_tracks.playlist_id does not exist

-- Legacy name used in some early schemas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlist_tracks'
      AND column_name = 'spotify_playlist_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlist_tracks'
      AND column_name = 'playlist_id'
  ) THEN
    ALTER TABLE public.playlist_tracks
      RENAME COLUMN spotify_playlist_id TO playlist_id;
  END IF;
END $$;

ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS playlist_id text;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS total_tracks integer NOT NULL DEFAULT 0;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS track_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.playlist_tracks ADD COLUMN IF NOT EXISTS image_url text;

-- Primary key (safe if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'playlist_tracks_pkey'
      AND conrelid = 'public.playlist_tracks'::regclass
  ) THEN
    ALTER TABLE public.playlist_tracks
      ADD PRIMARY KEY (user_id, playlist_id);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'playlist_tracks PK not added — check existing keys: %', SQLERRM;
END $$;
