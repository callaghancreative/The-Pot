-- 3-Putt Poker "reveal at the end" mode.
--
-- When a round's poker game settings has revealMode: 'end', card and fine
-- counts still show on both the host and viewer screens as the round is
-- played, but hands stay face down until the round is finished. Then a
-- showdown stage spotlights players one at a time, in the order they were
-- entered at setup, physically flipping each player's cards face up before
-- moving on — ending with a winner announcement and the payment summary.
--
-- poker_reveal_step counts taps, two per player (one flips their cards,
-- one moves the spotlight to the next player on deck) — see
-- getPokerRevealTotalSteps in App.jsx.
--
-- The host and viewer already share a realtime subscription on UPDATE
-- events for the rounds table (see the live-round-* channel in App.jsx),
-- so no new subscription is needed — bumping this column is enough for
-- every viewer's screen to flip the next card in sync.
--
-- Run this in the Supabase SQL editor before deploying the reveal-mode build.

alter table public.rounds
  add column if not exists poker_reveal_step integer not null default 0;
