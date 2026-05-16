-- Optional: allow authenticated users to read reference tag tables via GET /api/tags.
-- Run in Supabase SQL editor if the API returns 500 due to RLS on these tables.

alter table genre_tags enable row level security;
alter table mood_tags enable row level security;
alter table moment_tags enable row level security;

create policy "genre_tags_select_authenticated"
  on genre_tags for select to authenticated using (true);

create policy "mood_tags_select_authenticated"
  on mood_tags for select to authenticated using (true);

create policy "moment_tags_select_authenticated"
  on moment_tags for select to authenticated using (true);
