-- Rule-based pre-match preview (World Cup only for now), filled once by
-- sync-live's pre-match loop. Null until generated or if generation isn't
-- possible for that match (see lib/pregame-summary.ts).
alter table public.matches add column pregame_summary text;
