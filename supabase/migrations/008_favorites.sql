-- User-chosen favorites, used to surface their team/competition first on
-- the home and matches pages.
alter table public.profiles add column favorite_team_name text;
alter table public.profiles add column favorite_league_id integer;
