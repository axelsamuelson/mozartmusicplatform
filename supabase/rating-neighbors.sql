-- Rating neighbors with vibe-aware ranking.
-- Run in Supabase SQL Editor (replaces previous get_rating_neighbors).
--
-- Ranking (below / above separately):
--   0 = exact tempo + exact intensity + shared genre
--   1 = near tempo/intensity (|Δ| ≤ 1 on 1–10 scale) + shared genre
--   2 = score-only fallback (nearest score)
-- Vibe tiers apply only when the current track has tempo, intensity, and ≥1 genre.

create index if not exists ratings_user_id_score_idx
  on ratings (user_id, score);

create index if not exists ratings_user_id_tempo_intensity_idx
  on ratings (user_id, tempo, intensity);

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
  with current_vibe as (
    select
      r.tempo,
      r.intensity,
      coalesce(
        (
          select array_agg(rg.genre_tag_id order by rg.genre_tag_id)
          from rating_genres rg
          where rg.rating_id = r.id
        ),
        '{}'::integer[]
      ) as genre_ids
    from ratings r
    where r.user_id = auth.uid()
      and r.spotify_id = p_track_id
    limit 1
  ),
  ranked as (
    select
      case when r.score < p_score then 'below' else 'above' end as direction,
      r.spotify_id as track_id,
      r.score::integer as score,
      r.updated_at,
      case
        when
          cv.tempo is not null
          and cv.intensity is not null
          and coalesce(array_length(cv.genre_ids, 1), 0) > 0
          and r.tempo is not distinct from cv.tempo
          and r.intensity is not distinct from cv.intensity
          and exists (
            select 1
            from rating_genres rg
            where rg.rating_id = r.id
              and rg.genre_tag_id = any (cv.genre_ids)
          )
        then 0
        when
          cv.tempo is not null
          and cv.intensity is not null
          and coalesce(array_length(cv.genre_ids, 1), 0) > 0
          and r.tempo is not null
          and r.intensity is not null
          and abs(r.tempo - cv.tempo) <= 1
          and abs(r.intensity - cv.intensity) <= 1
          and exists (
            select 1
            from rating_genres rg
            where rg.rating_id = r.id
              and rg.genre_tag_id = any (cv.genre_ids)
          )
        then 1
        else 2
      end as vibe_tier
    from ratings r
    inner join cached_items ci on ci.spotify_id = r.spotify_id
    left join current_vibe cv on true
    where r.user_id = auth.uid()
      and r.spotify_id is distinct from p_track_id
      and ci.type = 'track'
      and r.score <> p_score
  )
  select
    n.direction,
    n.track_id,
    n.score
  from (
    (
      select
        rd.direction,
        rd.track_id,
        rd.score
      from ranked rd
      where rd.direction = 'below'
      order by rd.vibe_tier asc, rd.score desc, rd.updated_at desc nulls last
      limit 1
    )
    union all
    (
      select
        rd.direction,
        rd.track_id,
        rd.score
      from ranked rd
      where rd.direction = 'above'
      order by rd.vibe_tier asc, rd.score asc, rd.updated_at desc nulls last
      limit 1
    )
  ) as n
$$;

revoke all on function public.get_rating_neighbors(text, integer) from public;
grant execute on function public.get_rating_neighbors(text, integer) to authenticated;

comment on function public.get_rating_neighbors(text, integer) is
  'Neighbors below/above p_score; prefer exact then near (Δ≤1) tempo/intensity + shared genre, else nearest score.';
