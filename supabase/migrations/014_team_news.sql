-- Per-team news cache (Newsdata.io), not per-match — teams recur across many
-- matches/rounds, so one cached fetch is reused for all of them instead of
-- querying once per match. See lib/newsdata.ts for the TTL refresh logic.
create table public.team_news (
  team_name text primary key,
  articles jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);
