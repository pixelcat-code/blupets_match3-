-- Stress-test hardening beyond Ready: expire abandoned lobbies, keep the
-- durable roster renderable while players are offline, and lease one attempt
-- to one browser tab/device at a time.

alter table public.tournament_rooms
  add column if not exists lobby_expires_at timestamptz;

update public.tournament_rooms
   set lobby_expires_at = created_at + interval '6 hours'
 where lobby_expires_at is null;

alter table public.tournament_rooms
  alter column lobby_expires_at set default (clock_timestamp() + interval '6 hours'),
  alter column lobby_expires_at set not null;

update public.tournament_rooms
   set status = 'ended'
 where status = 'lobby'
   and lobby_expires_at <= clock_timestamp();

alter table public.tournament_room_players
  add column if not exists account_name text not null default 'Player',
  add column if not exists avatar_url text;

alter table public.tournament_runs
  add column if not exists client_session_id uuid,
  add column if not exists client_session_seen_at timestamptz;

create index if not exists tournament_runs_active_session_idx
  on public.tournament_runs (client_session_seen_at)
  where submitted_at is null;

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
   where (status = 'live' and ends_at is not null and ends_at <= clock_timestamp())
      or (status = 'lobby' and lobby_expires_at <= clock_timestamp());
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
  room_lobby_expires_at timestamptz;
  room_limit integer;
  player_count integer;
  existing_removed_at timestamptz;
begin
  select status, ends_at, lobby_expires_at, max_players
    into room_status, room_ends_at, room_lobby_expires_at, room_limit
    from tournament_rooms
   where id = target_room_id
   for update;

  if not found then return false; end if;
  if (room_status = 'live' and room_ends_at is not null and room_ends_at <= clock_timestamp())
     or (room_status = 'lobby' and room_lobby_expires_at <= clock_timestamp()) then
    update tournament_rooms set status = 'ended' where id = target_room_id;
    return false;
  end if;
  if room_status <> 'lobby' then return false; end if;

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
         duration_minutes, max_players, vibe_id, rules, lobby_expires_at
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
    'accountName', account_name,
    'avatarUrl', avatar_url,
    'ready', ready_at is not null,
    'readyUpdatedAt', ready_updated_at,
    'removedAt', removed_at
  ) order by joined_at), '[]'::jsonb)
    into player_rows
    from tournament_room_players
   where room_id = room_row.id;

  return jsonb_build_object(
    'serverNow', statement_timestamp(),
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
      'rules', room_row.rules,
      'lobby_expires_at', room_row.lobby_expires_at
    ),
    'entries', entry_rows,
    'players', player_rows,
    'playerRank', viewer_rank
  );
end;
$$;

revoke all on function public.close_expired_tournament_rooms() from public, anon, authenticated;
revoke all on function public.reserve_tournament_room_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fetch_tournament_leaderboard_snapshot(text, integer) from public, anon;
grant execute on function public.close_expired_tournament_rooms() to service_role;
grant execute on function public.reserve_tournament_room_slot(uuid, uuid) to service_role;
grant execute on function public.fetch_tournament_leaderboard_snapshot(text, integer) to authenticated, service_role;
