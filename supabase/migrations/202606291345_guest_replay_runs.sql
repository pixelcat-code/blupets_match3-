-- Server-issued seeds for runs that start before login.
-- The run is claimed only after the player signs in and submits the action log.

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_validation_mode_check;

alter table public.leaderboard_entries
  add constraint leaderboard_entries_validation_mode_check
  check (validation_mode in ('legacy', 'replay_verified', 'guest_plausibility', 'guest_replay_verified'));

create table if not exists public.guest_game_runs (
  id           uuid        primary key default gen_random_uuid(),
  seed         bigint      not null,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  claimed_by   uuid        references auth.users on delete set null
);

alter table public.guest_game_runs enable row level security;

revoke all on public.guest_game_runs from authenticated;
revoke all on public.guest_game_runs from anon;

create index if not exists guest_game_runs_created_idx
  on public.guest_game_runs (created_at desc);

delete from public.guest_game_runs
where submitted_at is null
  and created_at < now() - interval '30 minutes';
