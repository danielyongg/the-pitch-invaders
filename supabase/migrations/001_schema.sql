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
