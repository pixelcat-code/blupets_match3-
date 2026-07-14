-- Stress-test follow-up: Ready is durable DB state, while Presence is only
-- connection state. Serialize Ready and Start through the room row so a late
-- duplicate click can never race the host's authoritative start check.

alter table public.tournament_room_players
  add column if not exists ready_updated_at timestamptz not null default clock_timestamp();

update public.tournament_room_players
   set ready_updated_at = coalesce(ready_at, joined_at, clock_timestamp());

create or replace function public.set_tournament_ready_state(
  target_code text,
  target_user_id uuid,
  target_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row record;
  player_row record;
  ready_count integer;
  total_count integer;
begin
  select id, creator_user_id, status
    into room_row
    from tournament_rooms
   where upper(code) = upper(regexp_replace(coalesce(target_code, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1
   for update;

  if not found then raise exception 'room_not_found'; end if;
  if room_row.status <> 'lobby' then raise exception 'room_already_started'; end if;
  if room_row.creator_user_id = target_user_id then raise exception 'host_has_no_ready_state'; end if;

  select ready_at, ready_updated_at, removed_at
    into player_row
    from tournament_room_players
   where room_id = room_row.id
     and user_id = target_user_id
   for update;

  if not found or player_row.removed_at is not null then
    raise exception 'not_registered_for_room';
  end if;

  -- Repeating the same intent is a true no-op. This makes retries idempotent
  -- and keeps the timestamp stable so stale broadcasts can be discarded.
  if ((player_row.ready_at is not null) is distinct from target_ready) then
    update tournament_room_players
       set ready_at = case when target_ready then clock_timestamp() else null end,
           ready_updated_at = clock_timestamp()
     where room_id = room_row.id
       and user_id = target_user_id
     returning ready_at, ready_updated_at, removed_at into player_row;
  end if;

  select
    count(*) filter (where ready_at is not null),
    count(*)
    into ready_count, total_count
    from tournament_room_players
   where room_id = room_row.id
     and removed_at is null
     and user_id <> room_row.creator_user_id;

  return jsonb_build_object(
    'ready', player_row.ready_at is not null,
    'readyUpdatedAt', player_row.ready_updated_at,
    'readyCount', ready_count,
    'totalCount', total_count
  );
end;
$$;

create or replace function public.start_tournament_room_atomic(
  target_code text,
  target_host_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row record;
  ready_count integer;
  total_count integer;
  started_at_value timestamptz := clock_timestamp();
  ends_at_value timestamptz;
begin
  select id, code, title, creator_user_id, status, duration_minutes,
         max_players, vibe_id, rules
    into room_row
    from tournament_rooms
   where upper(code) = upper(regexp_replace(coalesce(target_code, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1
   for update;

  if not found then raise exception 'room_not_found'; end if;
  if room_row.creator_user_id <> target_host_id then raise exception 'not_host'; end if;
  if room_row.status <> 'lobby' then raise exception 'already_started'; end if;

  select
    count(*) filter (where ready_at is not null),
    count(*)
    into ready_count, total_count
    from tournament_room_players
   where room_id = room_row.id
     and removed_at is null
     and user_id <> target_host_id;

  if ready_count <> total_count then raise exception 'players_not_ready'; end if;

  ends_at_value := started_at_value + make_interval(mins => greatest(1, room_row.duration_minutes));
  update tournament_rooms
     set status = 'live',
         started_at = started_at_value,
         starts_at = started_at_value,
         ends_at = ends_at_value
   where id = room_row.id;

  return jsonb_build_object(
    'serverNow', clock_timestamp(),
    'room', jsonb_build_object(
      'id', room_row.id,
      'code', room_row.code,
      'title', room_row.title,
      'creator_user_id', room_row.creator_user_id,
      'status', 'live',
      'started_at', started_at_value,
      'ends_at', ends_at_value,
      'duration_minutes', room_row.duration_minutes,
      'max_players', room_row.max_players,
      'vibe_id', room_row.vibe_id,
      'rules', room_row.rules
    ),
    'readyCount', ready_count,
    'totalCount', total_count
  );
end;
$$;

-- A removed reservation must not silently become active again when an old tab
-- reopens the lobby.
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
  existing_removed_at timestamptz;
begin
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

  select removed_at into existing_removed_at
    from tournament_room_players
   where room_id = target_room_id and user_id = target_user_id;
  if found then return existing_removed_at is null; end if;

  select count(*) into player_count
    from tournament_room_players
   where room_id = target_room_id
     and removed_at is null;
  if player_count >= room_limit then return false; end if;

  insert into tournament_room_players (room_id, user_id)
  values (target_room_id, target_user_id);
  return true;
end;
$$;

create or replace function public.fetch_tournament_leaderboard_snapshot(
  target_code text,
  result_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  room_row record;
  safe_limit integer := greatest(10, least(coalesce(result_limit, 100), 200));
  entry_rows jsonb := '[]'::jsonb;
  player_rows jsonb := '[]'::jsonb;
  viewer_rank integer;
begin
  if viewer_id is null then raise exception 'unauthorized'; end if;

  select id, code, title, creator_user_id, status, started_at, ends_at,
         duration_minutes, max_players, vibe_id, rules
    into room_row
    from tournament_rooms
   where upper(code) = upper(regexp_replace(coalesce(target_code, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1;

  if not found then raise exception 'room_not_found'; end if;
  if room_row.creator_user_id is distinct from viewer_id and not exists (
    select 1 from tournament_room_players player
     where player.room_id = room_row.id
       and player.user_id = viewer_id
       and player.removed_at is null
  ) then
    raise exception 'not_registered_for_room';
  end if;

  with ranked as (
    select row_number() over (order by score desc, moves_used asc, created_at asc)::integer as rank,
           user_id, account_name, avatar_url, score, moves_used, created_at
      from tournament_leaderboard_entries
     where room_id = room_row.id
  ), limited as (
    select * from ranked order by rank limit safe_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', rank,
      'userId', user_id,
      'accountName', account_name,
      'avatarUrl', avatar_url,
      'score', score,
      'movesUsed', moves_used,
      'submittedAt', created_at,
      'isPlayer', user_id = viewer_id
    ) order by rank), '[]'::jsonb),
    max(rank) filter (where user_id = viewer_id)
    into entry_rows, viewer_rank
    from limited;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', user_id,
    'ready', ready_at is not null,
    'readyUpdatedAt', ready_updated_at,
    'removedAt', removed_at
  )), '[]'::jsonb)
    into player_rows
    from tournament_room_players
   where room_id = room_row.id;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', room_row.id,
      'code', room_row.code,
      'title', room_row.title,
      'creator_user_id', room_row.creator_user_id,
      'status', room_row.status,
      'started_at', room_row.started_at,
      'ends_at', room_row.ends_at,
      'duration_minutes', room_row.duration_minutes,
      'max_players', room_row.max_players,
      'vibe_id', room_row.vibe_id,
      'rules', room_row.rules
    ),
    'entries', entry_rows,
    'players', player_rows,
    'playerRank', viewer_rank
  );
end;
$$;

revoke all on function public.set_tournament_ready_state(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.start_tournament_room_atomic(text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_tournament_room_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fetch_tournament_leaderboard_snapshot(text, integer) from public, anon;
grant execute on function public.set_tournament_ready_state(text, uuid, boolean) to service_role;
grant execute on function public.start_tournament_room_atomic(text, uuid) to service_role;
grant execute on function public.reserve_tournament_room_slot(uuid, uuid) to service_role;
grant execute on function public.fetch_tournament_leaderboard_snapshot(text, integer) to authenticated, service_role;
