-- Single-group ("round") per-player gross scores.
-- Mirrors event_hole_scores but keyed to rounds/players instead of events.
-- Run this in the Supabase SQL editor before deploying the score-entry build.

create table if not exists public.round_hole_scores (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.rounds(id)  on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  hole        integer not null check (hole between 1 and 18),
  score       integer not null check (score between 1 and 20),
  par         integer not null default 4 check (par between 3 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (player_id, hole)          -- required for the upsert onConflict
);

create index if not exists round_hole_scores_round_id_idx
  on public.round_hole_scores (round_id);

alter table public.round_hole_scores enable row level security;

-- The app talks to Supabase as an anonymous user, the same as wolf_results /
-- skins_results / poker_results. Match those tables' policies. If they are
-- fully open, the equivalent here is:
create policy "round_hole_scores read"   on public.round_hole_scores
  for select using (true);
create policy "round_hole_scores write"  on public.round_hole_scores
  for insert with check (true);
create policy "round_hole_scores update" on public.round_hole_scores
  for update using (true) with check (true);
create policy "round_hole_scores delete" on public.round_hole_scores
  for delete using (true);

-- Optional: let live viewers get realtime score updates (not required today,
-- the round screen updates locally on save).
-- alter publication supabase_realtime add table public.round_hole_scores;
