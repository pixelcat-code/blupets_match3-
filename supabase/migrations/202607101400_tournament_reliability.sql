-- Tournament reliability: reserve a known slot before the host starts, and
-- make every Edge Function able to reconcile rooms that reached their deadline.

alter table public.tournament_rooms
  add column if not exists max_players integer not null default 50;

alter table public.tournament_rooms
  drop constraint if exists tournament_rooms_max_players_check;
alter table public.tournament_rooms
  add constraint tournament_rooms_max_players_check
  check (max_players between 2 and 200);

create table if not exists public.tournament_room_players (
  room_id uuid not null references public.tournament_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.tournament_room_players enable row level security;
revoke all on public.tournament_room_players from anon, authenticated;

-- Existing active runs count as a reservation when this is introduced.
insert into public.tournament_room_players (room_id, user_id)
select room_id, user_id from public.tournament_runs
on conflict (room_id, user_id) do nothing;

create or replace function public.close_expired_tournament_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update tournament_rooms
     set status = 'ended'
   where status = 'live'
     and ends_at is not null
     and ends_at <= clock_timestamp();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.reserve_tournament_room_slot(
  target_room_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_status text;
  room_ends_at timestamptz;
  room_limit integer;
  player_count integer;
begin
  -- Locking the room row serializes the count-and-insert, so two simultaneous
  -- joins cannot both take the final slot.
  select status, ends_at, max_players
    into room_status, room_ends_at, room_limit
    from tournament_rooms
   where id = target_room_id
   for update;

  if not found then return false; end if;
  if room_status = 'live' and room_ends_at is not null and room_ends_at <= clock_timestamp() then
    update tournament_rooms set status = 'ended' where id = target_room_id;
    return false;
  end if;
  if room_status = 'ended' then return false; end if;

  if exists (
    select 1 from tournament_room_players
     where room_id = target_room_id and user_id = target_user_id
  ) then
    return true;
  end if;

  select count(*) into player_count
    from tournament_room_players
   where room_id = target_room_id;
  if player_count >= room_limit then return false; end if;

  insert into tournament_room_players (room_id, user_id)
  values (target_room_id, target_user_id);
  return true;
end;
$$;

revoke all on function public.close_expired_tournament_rooms() from public, anon, authenticated;
revoke all on function public.reserve_tournament_room_slot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_expired_tournament_rooms() to service_role;
grant execute on function public.reserve_tournament_room_slot(uuid, uuid) to service_role;
