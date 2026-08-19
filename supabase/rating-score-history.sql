-- Score history for library ratings (one row per score change).
-- Run once in Supabase SQL Editor.

create table if not exists rating_score_history (
  id uuid default gen_random_uuid() primary key,
  rating_id uuid not null references ratings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  spotify_id text not null,
  score integer not null check (score between 0 and 100),
  recorded_at timestamptz not null default now()
);

create index if not exists rating_score_history_user_spotify_idx
  on rating_score_history (user_id, spotify_id, recorded_at);

create index if not exists rating_score_history_rating_idx
  on rating_score_history (rating_id, recorded_at);

alter table rating_score_history enable row level security;

drop policy if exists "Users read own rating score history" on rating_score_history;
create policy "Users read own rating score history"
  on rating_score_history for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table rating_score_history to authenticated;

-- Seed current scores so the next change has a starting point.
insert into rating_score_history (rating_id, user_id, spotify_id, score, recorded_at)
select
  r.id,
  r.user_id,
  r.spotify_id,
  r.score,
  coalesce(r.updated_at, r.created_at, now())
from ratings r
where not exists (
  select 1 from rating_score_history h where h.rating_id = r.id
);

create or replace function log_rating_score_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into rating_score_history (rating_id, user_id, spotify_id, score, recorded_at)
    values (
      new.id,
      new.user_id,
      new.spotify_id,
      new.score,
      coalesce(new.created_at, now())
    );
    return new;
  end if;

  if new.score is distinct from old.score then
    insert into rating_score_history (rating_id, user_id, spotify_id, score)
    values (new.id, new.user_id, new.spotify_id, new.score);
  end if;

  return new;
end;
$$;

drop trigger if exists rating_score_history_ai on ratings;
create trigger rating_score_history_ai
  after insert on ratings
  for each row
  execute function log_rating_score_history();

drop trigger if exists rating_score_history_au on ratings;
create trigger rating_score_history_au
  after update of score on ratings
  for each row
  execute function log_rating_score_history();
