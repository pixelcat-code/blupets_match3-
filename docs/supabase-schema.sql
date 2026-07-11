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

-- Own read only. Public profiles use the get_public_collection RPC, which
-- returns only an allowlisted JSON snapshot.
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

alter table public.user_progress
  add column if not exists last_run_id uuid references public.game_runs(id) on delete set null;


-- ─── leaderboard_entries ─────────────────────────────────────────────────────
-- One row per win. Anyone (including guests with the anon key) can read.
-- Trusted backend code should insert validated rows.

create table if not exists public.leaderboard_entries (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users on delete set null,
  score        integer     not null,
  moves_used   integer     not null,
  t4_color     text,
  t4_partner   text,
  t4_form_key  text,
  vibe         text,
  validation_mode text      not null default 'legacy',
  run_id       uuid        unique references public.game_runs(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.leaderboard_entries
  add column if not exists validation_mode text not null default 'legacy';
alter table public.leaderboard_entries
  add column if not exists run_id uuid unique references public.game_runs(id) on delete set null;
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

create table if not exists public.player_public_profiles (
  user_id          uuid primary key references auth.users on delete cascade,
  account_name     text not null default 'Player',
  normalized_name  text unique,
  avatar_url        text,
  collection_tiles jsonb not null default '{}',
  blupets_count     integer not null default 0,
  updated_at        timestamptz not null default now()
);

-- `collection_tiles` is authoritative. The sortable count is always derived
-- by Postgres, never trusted from an Edge Function or browser snapshot.
create or replace function public.collection_tiles_count(tiles jsonb)
returns integer
language sql
immutable
parallel safe
set search_path = public
as $$
  select count(*)::integer
  from jsonb_object_keys(
    case when jsonb_typeof(tiles) = 'object' then tiles else '{}'::jsonb end
  );
$$;

revoke all on function public.collection_tiles_count(jsonb) from public, anon, authenticated;
grant execute on function public.collection_tiles_count(jsonb) to service_role;

create or replace function public.set_player_public_profile_collection_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.collection_tiles := case
    when jsonb_typeof(new.collection_tiles) = 'object' then new.collection_tiles
    else '{}'::jsonb
  end;
  new.blupets_count := public.collection_tiles_count(new.collection_tiles);
  return new;
end;
$$;

revoke all on function public.set_player_public_profile_collection_count() from public, anon, authenticated;

drop trigger if exists player_public_profiles_collection_count on public.player_public_profiles;
create trigger player_public_profiles_collection_count
before insert or update of collection_tiles, blupets_count
on public.player_public_profiles
for each row execute function public.set_player_public_profile_collection_count();

create or replace function public.merge_player_public_collection(
  target_user_id uuid,
  incoming_tiles jsonb,
  incoming_account_name text,
  incoming_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_tiles jsonb := case
    when jsonb_typeof(incoming_tiles) = 'object' then incoming_tiles
    else '{}'::jsonb
  end;
  safe_name text := left(coalesce(nullif(trim(incoming_account_name), ''), 'Player'), 128);
  existing player_public_profiles%rowtype;
  merged_tiles jsonb;
begin
  select * into existing from player_public_profiles where user_id = target_user_id;
  if found
     and existing.collection_tiles @> safe_tiles
     and existing.account_name = safe_name
     and (incoming_avatar_url is null or existing.avatar_url = incoming_avatar_url) then
    return existing.collection_tiles;
  end if;
  insert into player_public_profiles (user_id, account_name, avatar_url, collection_tiles, updated_at)
  values (target_user_id, safe_name, incoming_avatar_url, safe_tiles, clock_timestamp())
  on conflict (user_id) do update set
    account_name = excluded.account_name,
    avatar_url = coalesce(excluded.avatar_url, player_public_profiles.avatar_url),
    collection_tiles = player_public_profiles.collection_tiles || excluded.collection_tiles,
    updated_at = clock_timestamp()
  returning collection_tiles into merged_tiles;
  return merged_tiles;
end;
$$;

revoke all on function public.merge_player_public_collection(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.merge_player_public_collection(uuid, jsonb, text, text)
  to service_role;


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
