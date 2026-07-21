-- supabase/migrations/017_basketball_predictions.sql
-- Adds NBA basketball predictions alongside the existing football
-- predictions, sharing one leaderboard. See
-- docs/superpowers/specs/2026-07-21-basketball-predictions-design.md.

-- matches.sport: discriminator; existing rows are all football.
alter table public.matches add column sport text not null default 'football';
alter table public.matches add constraint matches_sport_check check (sport in ('football', 'basketball'));

-- One-time odds snapshot (abs(spread) from ESPN's pickcenter), frozen before
-- kickoff — same pattern as pregame_summary/onexbet_stats, since the market
-- moves/disappears after that.
alter table public.matches add column odds_spread numeric;

-- Football predictions are a score guess (predicted_home/predicted_away);
-- basketball predictions are a winner-side + margin-bucket guess. A row only
-- ever populates the pair matching its match's sport — enforced at the
-- application level, not a cross-table CHECK/trigger (judged not worth the
-- complexity for now, see design spec).
alter table public.predictions alter column predicted_home drop not null;
alter table public.predictions alter column predicted_away drop not null;
alter table public.predictions add column predicted_winner_side text;
alter table public.predictions add column predicted_margin_bucket text;
alter table public.predictions add constraint predictions_winner_side_check
  check (predicted_winner_side is null or predicted_winner_side in ('home', 'away'));
alter table public.predictions add constraint predictions_margin_bucket_check
  check (predicted_margin_bucket is null or predicted_margin_bucket in ('more', 'exact', 'less'));

-- score_match_predictions: add a basketball branch ahead of the existing
-- football/PEN branches (both unchanged from migration 016). Basketball
-- scoring: winner_correct = predicted side matches actual winner;
-- margin_correct = predicted bucket ('more'/'exact'/'less') matches
-- abs(home_score - away_score) vs. round(coalesce(odds_spread, 5)). Both
-- correct = 3, winner only = 2, margin only = 1, neither = 0 — same 0-3
-- scale as football so the combined leaderboard stays fair.
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
  v_sport text;
  v_odds_spread numeric;
  v_threshold numeric;
  v_actual_margin integer;
  v_actual_winner text;
begin
  select home_score, away_score, status, home_penalty_score, away_penalty_score, sport, odds_spread
  into v_home_score, v_away_score, v_status, v_home_pen, v_away_pen, v_sport, v_odds_spread
  from public.matches
  where id = p_match_id and status in ('FT', 'AET', 'PEN');

  if not found then
    raise exception 'Match % not found or not finished', p_match_id;
  end if;

  if v_sport = 'basketball' then
    v_threshold := round(coalesce(v_odds_spread, 5));
    v_actual_margin := abs(v_home_score - v_away_score);
    v_actual_winner := case when v_home_score > v_away_score then 'home' else 'away' end;

    update public.predictions
    set
      points_awarded = case
        when predicted_winner_side = v_actual_winner
         and (
           (predicted_margin_bucket = 'more' and v_actual_margin > v_threshold) or
           (predicted_margin_bucket = 'exact' and v_actual_margin = v_threshold) or
           (predicted_margin_bucket = 'less' and v_actual_margin < v_threshold)
         )
        then 3
        when predicted_winner_side = v_actual_winner then 2
        when (predicted_margin_bucket = 'more' and v_actual_margin > v_threshold) or
             (predicted_margin_bucket = 'exact' and v_actual_margin = v_threshold) or
             (predicted_margin_bucket = 'less' and v_actual_margin < v_threshold)
        then 1
        else 0
      end,
      updated_at = now()
    where match_id = p_match_id;
  elsif v_status = 'PEN' and v_home_pen is not null and v_away_pen is not null then
    update public.predictions
    set
      points_awarded = case
        when predicted_home = v_home_score and predicted_away = v_away_score then 3
        when predicted_home = predicted_away then 2 -- predicted a draw, wrong exact score
        when (predicted_home > predicted_away) = (v_home_pen > v_away_pen) then 1 -- predicted the shootout winner
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

  -- Refresh leaderboard_cache for affected users (unchanged, sport-agnostic —
  -- sums points_awarded regardless of which sport earned them).
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
