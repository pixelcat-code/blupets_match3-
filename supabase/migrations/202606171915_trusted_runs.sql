-- Trusted replay-based leaderboard support.
-- Browser clients must not insert/update progress, run seeds, or leaderboard rows.

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

create policy "user_progress: own read"
  on public.user_progress for select
  using (auth.uid() = user_id);

create table if not exists public.game_runs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users on delete cascade,
  seed         bigint      not null,
  action_count integer     not null default 0,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz
);

alter table public.game_runs enable row level security;

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
  created_at   timestamptz not null default now()
);

alter table public.leaderboard_entries
  add column if not exists avatar_url text;

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries: global read" on public.leaderboard_entries;
drop policy if exists "leaderboard_entries: own insert" on public.leaderboard_entries;

create policy "leaderboard_entries: global read"
  on public.leaderboard_entries for select
  using (true);

create index if not exists leaderboard_entries_moves_idx
  on public.leaderboard_entries (moves_used asc);
