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
