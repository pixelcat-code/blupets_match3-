create table if not exists public.tournament_rooms (
  id              uuid        primary key default gen_random_uuid(),
  code            text        not null unique,
  title           text        not null,
  creator_user_id uuid        references auth.users on delete set null,
  status          text        not null default 'lobby',
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  seed            bigint      not null,
  vibe_id         text        not null,
  rules           jsonb       not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.tournament_rooms enable row level security;

drop policy if exists "tournament_rooms: public read" on public.tournament_rooms;
create policy "tournament_rooms: public read"
  on public.tournament_rooms for select
  using (true);

create table if not exists public.tournament_runs (
  id              uuid        primary key default gen_random_uuid(),
  room_id         uuid        not null references public.tournament_rooms(id) on delete cascade,
  user_id         uuid        not null references auth.users on delete cascade,
  seed            bigint      not null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  unique (room_id, user_id)
);

alter table public.tournament_runs enable row level security;

create table if not exists public.tournament_leaderboard_entries (
  id              uuid        primary key default gen_random_uuid(),
  room_id         uuid        not null references public.tournament_rooms(id) on delete cascade,
  user_id         uuid        not null references auth.users on delete cascade,
  account_name    text        not null default 'Player',
  avatar_url      text,
  score           integer     not null,
  moves_used      integer     not null,
  t4_color        text,
  t4_partner      text,
  t4_form_key     text,
  vibe            text,
  validation_mode text        not null default 'replay_verified',
  created_at      timestamptz not null default now(),
  unique (room_id, user_id)
);

alter table public.tournament_leaderboard_entries enable row level security;

drop policy if exists "tournament_leaderboard_entries: public read" on public.tournament_leaderboard_entries;
create policy "tournament_leaderboard_entries: public read"
  on public.tournament_leaderboard_entries for select
  using (true);

alter table public.tournament_rooms
  drop constraint if exists tournament_rooms_status_check;
alter table public.tournament_rooms
  add constraint tournament_rooms_status_check
  check (status in ('draft', 'live', 'ended'));

alter table public.tournament_leaderboard_entries
  drop constraint if exists tournament_leaderboard_entries_validation_mode_check;
alter table public.tournament_leaderboard_entries
  add constraint tournament_leaderboard_entries_validation_mode_check
  check (validation_mode in ('replay_verified'));

create index if not exists tournament_rooms_code_idx
  on public.tournament_rooms (upper(code));

create index if not exists tournament_leaderboard_rank_idx
  on public.tournament_leaderboard_entries (room_id, score desc, moves_used asc, created_at asc);

create index if not exists tournament_rooms_creator_recent_idx
  on public.tournament_rooms (creator_user_id, created_at desc);

-- v2: lobby-driven start. Rooms are created in 'lobby' and flipped to 'live'
-- only when the host presses Start (which stamps started_at/ends_at).
alter table public.tournament_rooms
  add column if not exists started_at timestamptz;
alter table public.tournament_rooms
  add column if not exists duration_minutes integer not null default 30;
alter table public.tournament_rooms
  alter column ends_at drop not null;
alter table public.tournament_rooms
  alter column status set default 'lobby';

alter table public.tournament_rooms
  drop constraint if exists tournament_rooms_status_check;
alter table public.tournament_rooms
  add constraint tournament_rooms_status_check
  check (status in ('draft', 'lobby', 'live', 'ended'));

-- Abandons are still replay-verified, but only over a partial action log.
alter table public.tournament_leaderboard_entries
  drop constraint if exists tournament_leaderboard_entries_validation_mode_check;
alter table public.tournament_leaderboard_entries
  add constraint tournament_leaderboard_entries_validation_mode_check
  check (validation_mode in ('replay_verified', 'replay_verified_partial'));

-- Realtime: clients subscribe to room-start + verified finals.
alter publication supabase_realtime add table public.tournament_rooms;
alter publication supabase_realtime add table public.tournament_leaderboard_entries;
