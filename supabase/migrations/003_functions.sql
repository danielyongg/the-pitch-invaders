-- =====================
-- Trigger: auto-create profile on signup
-- =====================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  _username text;
begin
  -- Use username from metadata if provided (email signup), else derive from email
  _username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );

  -- Ensure uniqueness by appending random suffix if needed
  if exists (select 1 from public.profiles where username = _username) then
    _username := _username || '_' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    _username,
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Init leaderboard entry
  insert into public.leaderboard_cache (user_id, username, avatar_url)
  values (new.id, _username, new.raw_user_meta_data->>'avatar_url');

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================
-- Function: score all predictions for a finished match
-- =====================
create or replace function public.score_match_predictions(p_match_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_home_score integer;
  v_away_score integer;
begin
  -- Get actual result
  select home_score, away_score
  into v_home_score, v_away_score
  from public.matches
  where id = p_match_id and status = 'FT';

  if not found then
    raise exception 'Match % not found or not finished', p_match_id;
  end if;

  -- Update points for all predictions on this match
  update public.predictions
  set
    points_awarded = case
      when predicted_home = v_home_score and predicted_away = v_away_score then 3
      when
        sign(predicted_home - predicted_away) = sign(v_home_score - v_away_score)
        then 1
      else 0
    end,
    updated_at = now()
  where match_id = p_match_id;

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

-- =====================
-- Helper: updated_at auto-update trigger
-- =====================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger matches_updated_at before update on public.matches
  for each row execute procedure public.set_updated_at();

create trigger predictions_updated_at before update on public.predictions
  for each row execute procedure public.set_updated_at();
