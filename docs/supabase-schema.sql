-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Creates both tables and RLS policies needed for cloud sync.

-- ─── user_progress ───────────────────────────────────────────────────────────
-- One row per authenticated user. Upserted on every win and on sign-in load.

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

-- Users can only read and write their own row.
create policy "user_progress: own read"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "user_progress: own insert"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "user_progress: own update"
  on public.user_progress for update
  using (auth.uid() = user_id);


-- ─── leaderboard_entries ─────────────────────────────────────────────────────
-- One row per win. Anyone (including guests with the anon key) can read.
-- Only the row owner can insert.

create table if not exists public.leaderboard_entries (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users on delete set null,
  account_name text        not null default 'Player',
  score        integer     not null,
  moves_used   integer     not null,
  t4_color     text,
  t4_partner   text,
  t4_form_key  text,
  vibe         text,
  created_at   timestamptz not null default now()
);

alter table public.leaderboard_entries enable row level security;

-- Global read — guests see the board too.
create policy "leaderboard_entries: global read"
  on public.leaderboard_entries for select
  using (true);

-- Only authenticated users can insert their own entries.
create policy "leaderboard_entries: own insert"
  on public.leaderboard_entries for insert
  with check (auth.uid() = user_id);


-- ─── Optional: speed-run index ───────────────────────────────────────────────
-- Speeds up the "Speed Run" sort (moves_used ASC).
create index if not exists leaderboard_entries_moves_idx
  on public.leaderboard_entries (moves_used asc);
