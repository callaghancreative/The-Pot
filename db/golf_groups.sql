-- Golf Groups — named, persistent rosters of golfers (e.g. "Saturday
-- Morning Group") used to filter season standings down to a subset of
-- players, distinct from Saved Groups (which just prefill a round's
-- players and are capped at 2-4 members). A golf group has no member
-- cap, and any member — not just whoever created it — can see it and
-- view its standings; only the creator can rename membership.
--
-- Run this in the Supabase SQL editor before deploying.

create table if not exists public.golf_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.golf_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.golf_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  unique (group_id, profile_id)
);

create index if not exists golf_group_members_group_id_idx
  on public.golf_group_members (group_id);
create index if not exists golf_group_members_profile_id_idx
  on public.golf_group_members (profile_id);

alter table public.golf_groups enable row level security;
alter table public.golf_group_members enable row level security;

-- Same open-policy convention as the rest of THE POT's tables (access is
-- controlled by knowing a code / being linked to a profile, not by RLS).
create policy "golf_groups read"   on public.golf_groups
  for select using (true);
create policy "golf_groups insert" on public.golf_groups
  for insert with check (true);
create policy "golf_groups update" on public.golf_groups
  for update using (true) with check (true);
create policy "golf_groups delete" on public.golf_groups
  for delete using (true);

create policy "golf_group_members read"   on public.golf_group_members
  for select using (true);
create policy "golf_group_members insert" on public.golf_group_members
  for insert with check (true);
create policy "golf_group_members update" on public.golf_group_members
  for update using (true) with check (true);
create policy "golf_group_members delete" on public.golf_group_members
  for delete using (true);
