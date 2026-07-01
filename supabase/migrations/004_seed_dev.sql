-- Seed data untuk development (jalankan hanya di environment dev)
-- Insert beberapa match contoh untuk testing UI

insert into public.matches (
  api_football_id, league_id, season,
  home_team_id, away_team_id,
  home_team_name, away_team_name,
  home_team_logo, away_team_logo,
  kickoff_time, status, round
) values
(900001, 39, 2025, 33, 40,
 'Manchester United', 'Liverpool',
 'https://media.api-sports.io/football/teams/33.png',
 'https://media.api-sports.io/football/teams/40.png',
 (now() + interval '1 day')::timestamptz, 'NS', 'Round 38'),

(900002, 140, 2025, 541, 529,
 'Real Madrid', 'Barcelona',
 'https://media.api-sports.io/football/teams/541.png',
 'https://media.api-sports.io/football/teams/529.png',
 (now() + interval '1 day 2 hours')::timestamptz, 'NS', 'Round 38'),

(900003, 78, 2025, 157, 165,
 'Bayern Munich', 'Borussia Dortmund',
 'https://media.api-sports.io/football/teams/157.png',
 'https://media.api-sports.io/football/teams/165.png',
 (now() + interval '2 days')::timestamptz, 'NS', 'Round 34'),

(900004, 135, 2025, 489, 496,
 'AC Milan', 'Juventus',
 'https://media.api-sports.io/football/teams/489.png',
 'https://media.api-sports.io/football/teams/496.png',
 (now() - interval '2 hours')::timestamptz, 'NS', 'Round 38')

on conflict (api_football_id) do nothing;

-- Mark the AC Milan match as finished with a result
update public.matches
set status = 'FT', home_score = 2, away_score = 1
where api_football_id = 900004;
