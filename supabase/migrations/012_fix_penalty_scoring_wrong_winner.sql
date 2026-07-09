-- 006_penalty_scoring.sql awarded 1 point to a decisive (non-draw)
-- prediction on a PEN match even when the predicted winner didn't match who
-- actually won the shootout — e.g. predicting a 1-2 away win when the home
-- side won on penalties still scored 1 point, when it should score 0 (same
-- as a wrong-winner prediction on a normal FT match). Only a *draw*
-- prediction on a PEN match should get the 1-point "right that it stayed
-- level, wrong exact score" consolation.
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
        when predicted_home <> predicted_away and (predicted_home > predicted_away) = (v_home_pen > v_away_pen) then 2
        when predicted_home = predicted_away then 1 -- predicted a draw, wrong exact score
        else 0 -- predicted a decisive result, wrong winner
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

-- Re-score every already-finished PEN match with the corrected function so
-- past predictions (like the one that surfaced this bug) get corrected too.
do $$
declare
  m record;
begin
  for m in select id from public.matches where status = 'PEN' loop
    perform public.score_match_predictions(m.id);
  end loop;
end;
$$;
