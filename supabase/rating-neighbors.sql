-- Rating neighbors: nearest scores strictly below/above the current track.
-- Run in Supabase SQL Editor.

create index if not exists ratings_user_id_score_idx
  on ratings (user_id, score);

create or replace function get_rating_neighbors(p_track_id text)
returns table (
  direction text,
  track_id text,
  score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with current_rating as (
    select r.score
    from ratings r
    where r.user_id = auth.uid()
      and r.spotify_id = p_track_id
    limit 1
  ),
  below_neighbor as (
    select
      r.spotify_id as track_id,
      r.score
    from ratings r
    inner join cached_items ci on ci.spotify_id = r.spotify_id
    cross join current_rating c
    where r.user_id = auth.uid()
      and r.score < c.score
      and r.spotify_id is distinct from p_track_id
      and ci.type = 'track'
    order by r.score desc, r.updated_at desc nulls last
    limit 1
  ),
  above_neighbor as (
    select
      r.spotify_id as track_id,
      r.score
    from ratings r
    inner join cached_items ci on ci.spotify_id = r.spotify_id
    cross join current_rating c
    where r.user_id = auth.uid()
      and r.score > c.score
      and r.spotify_id is distinct from p_track_id
      and ci.type = 'track'
    order by r.score asc, r.updated_at desc nulls last
    limit 1
  )
  select 'below'::text as direction, b.track_id, b.score::integer
  from below_neighbor b
  union all
  select 'above'::text as direction, a.track_id, a.score::integer
  from above_neighbor a;
$$;

revoke all on function public.get_rating_neighbors(text) from public;
grant execute on function public.get_rating_neighbors(text) to authenticated;

comment on function public.get_rating_neighbors(text) is
  'Nearest own track ratings strictly below/above p_track_id for auth.uid(); RLS via security invoker.';
