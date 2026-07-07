-- 1xBet supplemental stats (team stats, top performers, style of play,
-- heatmap), fetched once per match after it finishes. Null until then.
alter table public.matches add column onexbet_stats jsonb;
