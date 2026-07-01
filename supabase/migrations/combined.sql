-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

-- Matches (populated by Edge Function from API-Football)
create table public.matches (
  id                uuid primary key default gen_random_uuid(),
  api_football_id   integer unique not null,
  league_id         integer not null,
  season            integer not null,
  home_team_id      integer not null,
  away_team_id      integer not null,
  home_team_name    text not null,
  away_team_name    text not null,
  home_team_logo    text,
  away_team_logo    text,
  kickoff_time      timestamptz not null,
  status            text not null default 'NS',
  home_score        integer,
  away_score        integer,
  round             text,
  venue             text,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

create index matches_kickoff_idx on public.matches(kickoff_time);
create index matches_league_idx on public.matches(league_id);
create index matches_status_idx on public.matches(status);

-- Predictions (one per user per match)
create table public.predictions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  match_id        uuid not null references public.matches(id) on delete cascade,
  predicted_home  integer not null,
  predicted_away  integer not null,
  points_awarded  integer,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null,
  unique(user_id, match_id)
);

create index predictions_user_idx on public.predictions(user_id);
create index predictions_match_idx on public.predictions(match_id);

-- Private Leagues
create table public.private_leagues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text unique not null default upper(substr(md5(random()::text), 1, 8)),
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz default now() not null
);

-- Private League Members
create table public.private_league_members (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.private_leagues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz default now() not null,
  unique(league_id, user_id)
);

create index plm_league_idx on public.private_league_members(league_id);
create index plm_user_idx on public.private_league_members(user_id);

-- Leaderboard Cache
create table public.leaderboard_cache (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  username        text not null,
  avatar_url      text,
  total_points    integer not null default 0,
  exact_scores    integer not null default 0,
  correct_results integer not null default 0,
  total_preds     integer not null default 0,
  updated_at      timestamptz default now() not null
);

create index leaderboard_points_idx on public.leaderboard_cache(total_points desc);
-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.private_leagues enable row level security;
alter table public.private_league_members enable row level security;
alter table public.leaderboard_cache enable row level security;

-- =====================
-- PROFILES
-- =====================
create policy "profiles_public_read" on public.profiles
  for select using (true);

create policy "profiles_own_update" on public.profiles
  for update using (auth.uid() = id);

-- =====================
-- MATCHES
-- =====================
create policy "matches_public_read" on public.matches
  for select using (true);

-- Only service role can insert/update matches (Edge Functions use service role key)

-- =====================
-- PREDICTIONS
-- =====================

-- Users can read their own predictions
create policy "predictions_own_read" on public.predictions
  for select using (auth.uid() = user_id);

-- After kickoff, any authenticated user can read predictions for that match
create policy "predictions_post_kickoff_read" on public.predictions
  for select using (
    auth.role() = 'authenticated' and
    (select kickoff_time from public.matches where id = match_id) <= now()
  );

-- Insert: only before kickoff
create policy "predictions_insert_before_kickoff" on public.predictions
  for insert with check (
    auth.uid() = user_id and
    (select kickoff_time from public.matches where id = match_id) > now()
  );

-- Update: only before kickoff, only own prediction
create policy "predictions_update_before_kickoff" on public.predictions
  for update using (
    auth.uid() = user_id and
    (select kickoff_time from public.matches where id = match_id) > now()
  );

-- =====================
-- PRIVATE LEAGUES
-- =====================
create policy "private_leagues_member_read" on public.private_leagues
  for select using (
    -- Creator can always read
    auth.uid() = created_by or
    -- Members can read
    exists (
      select 1 from public.private_league_members
      where league_id = id and user_id = auth.uid()
    )
  );

create policy "private_leagues_create" on public.private_leagues
  for insert with check (auth.uid() = created_by);

create policy "private_leagues_creator_update" on public.private_leagues
  for update using (auth.uid() = created_by);

-- Special: authenticated users can SELECT a league by invite_code to join
create policy "private_leagues_lookup_by_code" on public.private_leagues
  for select using (auth.role() = 'authenticated');

-- =====================
-- PRIVATE LEAGUE MEMBERS
-- =====================
create policy "plm_member_read" on public.private_league_members
  for select using (
    exists (
      select 1 from public.private_league_members m2
      where m2.league_id = league_id and m2.user_id = auth.uid()
    )
  );

create policy "plm_self_insert" on public.private_league_members
  for insert with check (auth.uid() = user_id);

create policy "plm_self_delete" on public.private_league_members
  for delete using (auth.uid() = user_id);

-- =====================
-- LEADERBOARD CACHE
-- =====================
create policy "leaderboard_public_read" on public.leaderboard_cache
  for select using (true);
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
