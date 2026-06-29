-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Creates read-only tables and RLS policies for browser clients.
--
-- Do not allow browser clients to write progress or leaderboard rows directly:
-- public clients can forge score, moves, forms, and progress. Trusted writes
-- must go through a server or Supabase Edge Function that validates a run.

-- ─── user_progress ───────────────────────────────────────────────────────────
-- One row per authenticated user. Reserved for trusted backend writes.

create table if not exists public.user_progress (
  user_id          uuid        references auth.users on delete cascade primary key,
  wins             integer     not null default 0,
  runs             integer     not null default 0,
  best_score       integer     not null default 0,
  fewest_moves_win integer,
  forms            jsonb       not null default '{}',
  progress         jsonb       not null default '{}',
  updated_at       timestamptz not null default now()
);

alter table public.user_progress
  add column if not exists progress jsonb not null default '{}';

alter table public.user_progress enable row level security;

drop policy if exists "user_progress: own read" on public.user_progress;
drop policy if exists "user_progress: global read" on public.user_progress;
drop policy if exists "user_progress: own insert" on public.user_progress;
drop policy if exists "user_progress: own update" on public.user_progress;

-- Own read only. Public profiles must use get-public-collection, which returns
-- only server-derived collection fields through an allowlisted response.
create policy "user_progress: own read"
  on public.user_progress for select
  using (auth.uid() = user_id);

-- ─── game_runs ───────────────────────────────────────────────────────────────
-- Server-issued run seeds. Rows are created and submitted only by Edge Functions
-- using service-role credentials; browser clients do not get direct access.

create table if not exists public.game_runs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users on delete cascade,
  seed         bigint      not null,
  action_count integer     not null default 0,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz
);

alter table public.game_runs enable row level security;


-- ─── leaderboard_entries ─────────────────────────────────────────────────────
-- One row per win. Anyone (including guests with the anon key) can read.
-- Trusted backend code should insert validated rows.

create table if not exists public.leaderboard_entries (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users on delete set null,
  account_name text        not null default 'Player',
  avatar_url   text,
  score        integer     not null,
  moves_used   integer     not null,
  blupets_count integer    not null default 0,
  t4_color     text,
  t4_partner   text,
  t4_form_key  text,
  vibe         text,
  family_badges jsonb      not null default '{}',
  validation_mode text      not null default 'legacy',
  created_at   timestamptz not null default now()
);

-- For existing deployments: add the per-family unlocked-tile snapshot column.
alter table public.leaderboard_entries
  add column if not exists family_badges jsonb not null default '{}';
alter table public.leaderboard_entries
  add column if not exists blupets_count integer not null default 0;
alter table public.leaderboard_entries
  add column if not exists collection_tiles jsonb default null;
alter table public.leaderboard_entries
  add column if not exists validation_mode text not null default 'legacy';
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_validation_mode_check;
alter table public.leaderboard_entries
  add constraint leaderboard_entries_validation_mode_check
  check (validation_mode in ('legacy', 'replay_verified', 'guest_plausibility', 'guest_replay_verified'));

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries: global read" on public.leaderboard_entries;
drop policy if exists "leaderboard_entries: own insert" on public.leaderboard_entries;

-- Global read — guests see the board too.
create policy "leaderboard_entries: global read"
  on public.leaderboard_entries for select
  using (true);


-- ─── Optional: leaderboard sort indexes ──────────────────────────────────────
create index if not exists leaderboard_entries_score_idx
  on public.leaderboard_entries (score desc);

create index if not exists leaderboard_entries_blupets_idx
  on public.leaderboard_entries (blupets_count desc, score desc);


-- ─── guest_game_runs ────────────────────────────────────────────────────────
-- Server-issued seeds for runs that start before login. Claimed after sign-in.

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
