-- Penalty shootout score, populated when status = 'PEN'
alter table public.matches add column home_penalty_score integer;
alter table public.matches add column away_penalty_score integer;
