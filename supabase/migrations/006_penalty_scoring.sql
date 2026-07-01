-- Allow scoring matches finished via AET/PEN, not just regulation FT.
-- For PEN matches, normal/extra time always ends in a draw (that's why it
-- went to penalties), so scoring blends the draw scoreline with who
-- actually advanced via the shootout.
create or replace function public.score_match_predictions(p_match_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_home_score integer;
  v_away_score integer;
  v_status text;
  v_home_pen integer;
  v_away_pen integer;
begin
  select home_score, away_score, status, home_penalty_score, away_penalty_score
  into v_home_score, v_away_score, v_status, v_home_pen, v_away_pen
  from public.matches
  where id = p_match_id and status in ('FT', 'AET', 'PEN');

  if not found then
    raise exception 'Match % not found or not finished', p_match_id;
  end if;

  if v_status = 'PEN' and v_home_pen is not null and v_away_pen is not null then
    update public.predictions
    set
      points_awarded = case
        when predicted_home = v_home_score and predicted_away = v_away_score then 3
        when predicted_home <> predicted_away then
          case
            when (predicted_home > predicted_away) = (v_home_pen > v_away_pen) then 2
            else 1
          end
        else 1 -- predicted a draw, wrong scoreline
      end,
      updated_at = now()
    where match_id = p_match_id;
  else
    update public.predictions
    set
      points_awarded = case
        when predicted_home = v_home_score and predicted_away = v_away_score then 3
        when sign(predicted_home - predicted_away) = sign(v_home_score - v_away_score) then 1
        else 0
      end,
      updated_at = now()
    where match_id = p_match_id;
  end if;

  -- Refresh leaderboard_cache for affected users
  insert into public.leaderboard_cache (user_id, username, avatar_url, total_points, exact_scores, correct_results, total_preds)
  select
    p.user_id,
    pr.username,
    pr.avatar_url,
    coalesce(sum(p.points_awarded), 0),
    count(*) filter (where p.points_awarded = 3),
    count(*) filter (where p.points_awarded >= 1),
    count(*)
  from public.predictions p
  join public.profiles pr on pr.id = p.user_id
  where p.user_id in (
    select distinct user_id from public.predictions where match_id = p_match_id
  )
  and p.points_awarded is not null
  group by p.user_id, pr.username, pr.avatar_url
  on conflict (user_id) do update set
    username        = excluded.username,
    avatar_url      = excluded.avatar_url,
    total_points    = excluded.total_points,
    exact_scores    = excluded.exact_scores,
    correct_results = excluded.correct_results,
    total_preds     = excluded.total_preds,
    updated_at      = now();
end;
$$;
