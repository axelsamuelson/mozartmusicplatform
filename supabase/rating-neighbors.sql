-- Rating neighbors: nearest scores strictly below/above a given score.
-- Run in Supabase SQL Editor (replaces the previous single-arg version).

create index if not exists ratings_user_id_score_idx
  on ratings (user_id, score);

drop function if exists public.get_rating_neighbors(text);
drop function if exists public.get_rating_neighbors(text, integer);

create function public.get_rating_neighbors(p_track_id text, p_score integer)
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
  select
    n.direction,
    n.track_id,
    n.score
  from (
    (
      select
        'below'::text as direction,
        r.spotify_id as track_id,
        r.score::integer as score
      from ratings r
      inner join cached_items ci on ci.spotify_id = r.spotify_id
      where r.user_id = auth.uid()
        and r.spotify_id is distinct from p_track_id
        and ci.type = 'track'
        and r.score < p_score
      order by r.score desc, r.updated_at desc nulls last
      limit 1
    )
    union all
    (
      select
        'above'::text as direction,
        r.spotify_id as track_id,
        r.score::integer as score
      from ratings r
      inner join cached_items ci on ci.spotify_id = r.spotify_id
      where r.user_id = auth.uid()
        and r.spotify_id is distinct from p_track_id
        and ci.type = 'track'
        and r.score > p_score
      order by r.score asc, r.updated_at desc nulls last
      limit 1
    )
  ) as n
$$;

revoke all on function public.get_rating_neighbors(text, integer) from public;
grant execute on function public.get_rating_neighbors(text, integer) to authenticated;

comment on function public.get_rating_neighbors(text, integer) is
  'Nearest own track ratings strictly below/above p_score for auth.uid(); excludes p_track_id.';
