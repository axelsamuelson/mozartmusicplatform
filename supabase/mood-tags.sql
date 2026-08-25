-- Core mood tags (required before live-sessions.sql).
-- Source: wam-spec.md — run once in Supabase SQL Editor.

create table if not exists mood_tags (
  id          serial primary key,
  level       integer not null unique check (level between 1 and 5),
  name        text not null,
  description text,
  color       text not null
);

insert into mood_tags (level, name, description, color) values
  (1, 'Dreamy',    'Slow, introspective, sleepy',   '#818cf8'),
  (2, 'Chill',     'Relaxed, easy-going',            '#34d399'),
  (3, 'Neutral',   'Balanced, background listening', '#94a3b8'),
  (4, 'Energetic', 'Upbeat, motivating',             '#fb923c'),
  (5, 'Hype',      'Intense, peak energy',           '#f43f5e')
on conflict (level) do nothing;

alter table mood_tags enable row level security;

drop policy if exists "mood_tags_select_authenticated" on mood_tags;
create policy "mood_tags_select_authenticated"
  on mood_tags for select to authenticated using (true);

notify pgrst, 'reload schema';
