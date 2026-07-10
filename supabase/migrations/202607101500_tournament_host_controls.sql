-- Host removal is persistent for the current lobby: a removed player cannot
-- reclaim a slot simply by refreshing their tab before the tournament starts.
alter table public.tournament_room_players
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists ready_at timestamptz;

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
  was_removed timestamptz;
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

  select removed_at into was_removed
    from tournament_room_players
   where room_id = target_room_id and user_id = target_user_id;
  if found then
    return was_removed is null;
  end if;

  -- New slots are available only before the host starts the room. This closes
  -- the small race where a join request and the host's Start crossed paths.
  if room_status <> 'lobby' then return false; end if;

  select count(*) into player_count
    from tournament_room_players
   where room_id = target_room_id and removed_at is null;
  if player_count >= room_limit then return false; end if;

  insert into tournament_room_players (room_id, user_id)
  values (target_room_id, target_user_id);
  return true;
end;
$$;

revoke all on function public.reserve_tournament_room_slot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_tournament_room_slot(uuid, uuid) to service_role;
