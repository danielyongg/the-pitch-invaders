-- plm_member_read queried private_league_members from within its own USING
-- clause, so Postgres re-evaluates the same RLS policy for the subquery ad
-- infinitum. Move the membership check into a SECURITY DEFINER function so
-- it runs with RLS bypassed.
create or replace function public.is_private_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.private_league_members
    where league_id = p_league_id and user_id = auth.uid()
  )
$$;

drop policy if exists "plm_member_read" on public.private_league_members;

create policy "plm_member_read" on public.private_league_members
  for select using (public.is_private_league_member(league_id));
