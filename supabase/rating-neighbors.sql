-- Rating neighbors: nearest scores strictly below/above the current track.
-- Run in Supabase SQL Editor.

create index if not exists ratings_user_id_score_idx
  on ratings (user_id, score);

drop function if exists public.get_rating_neighbors(text);

create function public.get_rating_neighbors(p_track_id text)
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
        and r.score < (
          select cr.score
          from ratings cr
          where cr.user_id = auth.uid()
            and cr.spotify_id = p_track_id
          limit 1
        )
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
        and r.score > (
          select cr.score
          from ratings cr
          where cr.user_id = auth.uid()
            and cr.spotify_id = p_track_id
          limit 1
        )
      order by r.score asc, r.updated_at desc nulls last
      limit 1
    )
  ) as n
$$;

revoke all on function public.get_rating_neighbors(text) from public;
grant execute on function public.get_rating_neighbors(text) to authenticated;

comment on function public.get_rating_neighbors(text) is
  'Nearest own track ratings strictly below/above p_track_id for auth.uid(); RLS via security invoker.';
