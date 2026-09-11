-- Team matchplay ("deciding lunch") for single-group rounds.
-- One row per hole while the match is live; rows stop once the match is
-- mathematically closed out (e.g. 3&2). Fully derived from round_hole_scores
-- + the team pairing stored on the round's `matchplay` round_games row.
-- Run this in the Supabase SQL editor before deploying.

create table if not exists public.matchplay_results (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.rounds(id) on delete cascade,
  hole           integer not null check (hole between 1 and 18),
  hole_winner    text not null check (hole_winner in ('team1', 'team2', 'halved')),
  team_one_score integer,
  team_two_score integer,
  lead_team      text check (lead_team in ('team1', 'team2')),
  lead_amount    integer not null default 0,
  decided        boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (round_id, hole)
);

create index if not exists matchplay_results_round_id_idx
  on public.matchplay_results (round_id);

alter table public.matchplay_results enable row level security;

-- Match the open policies on wolf_results / skins_results / poker_results.
create policy "matchplay_results read"   on public.matchplay_results
  for select using (true);
create policy "matchplay_results insert" on public.matchplay_results
  for insert with check (true);
create policy "matchplay_results update" on public.matchplay_results
  for update using (true) with check (true);
create policy "matchplay_results delete" on public.matchplay_results
  for delete using (true);

-- Live viewers subscribe to inserts/deletes on this table.
alter publication supabase_realtime add table public.matchplay_results;
