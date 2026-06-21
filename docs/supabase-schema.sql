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
  updated_at       timestamptz not null default now()
);

alter table public.user_progress enable row level security;

drop policy if exists "user_progress: own read" on public.user_progress;
drop policy if exists "user_progress: own insert" on public.user_progress;
drop policy if exists "user_progress: own update" on public.user_progress;

-- Browser clients may only read their own row. No direct insert/update policy is
-- created here; writes require trusted server-side validation.
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
  t4_color     text,
  t4_partner   text,
  t4_form_key  text,
  vibe         text,
  family_badges jsonb      not null default '{}',
  created_at   timestamptz not null default now()
);

-- For existing deployments: add the per-family unlocked-tile snapshot column.
alter table public.leaderboard_entries
  add column if not exists family_badges jsonb not null default '{}';

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries: global read" on public.leaderboard_entries;
drop policy if exists "leaderboard_entries: own insert" on public.leaderboard_entries;

-- Global read — guests see the board too.
create policy "leaderboard_entries: global read"
  on public.leaderboard_entries for select
  using (true);


-- ─── Optional: speed-run index ───────────────────────────────────────────────
-- Speeds up the "Speed Run" sort (moves_used ASC).
create index if not exists leaderboard_entries_moves_idx
  on public.leaderboard_entries (moves_used asc);
