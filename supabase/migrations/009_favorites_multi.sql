-- Favorites become multi-select: one team/competition was too limiting.
alter table public.profiles rename column favorite_team_name to favorite_team_names_old;
alter table public.profiles rename column favorite_league_id to favorite_league_ids_old;

alter table public.profiles add column favorite_team_names text[] not null default '{}';
alter table public.profiles add column favorite_league_ids integer[] not null default '{}';

update public.profiles
set favorite_team_names = case when favorite_team_names_old is not null then array[favorite_team_names_old] else '{}' end,
    favorite_league_ids = case when favorite_league_ids_old is not null then array[favorite_league_ids_old] else '{}' end;

alter table public.profiles drop column favorite_team_names_old;
alter table public.profiles drop column favorite_league_ids_old;
