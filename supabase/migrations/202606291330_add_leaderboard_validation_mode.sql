-- Track how each leaderboard row was accepted.
-- Signed-in runs are replay-verified from a server-issued seed.
-- Guest-promoted runs remain allowed, but are only plausibility-checked.

alter table public.leaderboard_entries
  add column if not exists validation_mode text not null default 'legacy';

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_validation_mode_check;

alter table public.leaderboard_entries
  add constraint leaderboard_entries_validation_mode_check
  check (validation_mode in ('legacy', 'replay_verified', 'guest_plausibility'));
