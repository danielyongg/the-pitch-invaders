-- Push score/status updates to browsers instantly instead of waiting for
-- the next client poll (see LivePoller.tsx's postgres_changes subscription).
alter publication supabase_realtime add table public.matches;
