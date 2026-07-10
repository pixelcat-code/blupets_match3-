-- Bound operational game history without touching permanent player progress.
-- user_progress, account_names, avatars, and tournament final standings are
-- intentionally outside this cleanup function.

create index if not exists leaderboard_entries_created_idx
  on public.leaderboard_entries (created_at);
create index if not exists game_runs_retention_idx
  on public.game_runs (created_at)
  where submitted_at is not null;

-- One public row per player replaces names, avatars, and collection JSON copied
-- into every leaderboard result.
create table if not exists public.player_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_name text not null default 'Player',
  normalized_name text unique,
  avatar_url text,
  collection_tiles jsonb not null default '{}'::jsonb,
  blupets_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint player_public_profiles_blupets_count_check check (blupets_count >= 0)
);

alter table public.player_public_profiles enable row level security;
revoke all on public.player_public_profiles from anon, authenticated;

insert into public.player_public_profiles (
  user_id, account_name, normalized_name, avatar_url,
  collection_tiles, blupets_count, updated_at
)
select
  progress.user_id,
  coalesce(latest.account_name, 'Player'),
  names.normalized_name,
  latest.avatar_url,
  coalesce(
    case when jsonb_typeof(progress.progress -> 'verifiedCollectionTiles') = 'object'
      then progress.progress -> 'verifiedCollectionTiles' else '{}'::jsonb end,
    '{}'::jsonb
  ) || coalesce(
    case when jsonb_typeof(progress.progress -> 'publicCollectionTiles') = 'object'
      then progress.progress -> 'publicCollectionTiles' else '{}'::jsonb end,
    '{}'::jsonb
  ),
  (
    select count(*)
    from jsonb_object_keys(
      coalesce(
        case when jsonb_typeof(progress.progress -> 'verifiedCollectionTiles') = 'object'
          then progress.progress -> 'verifiedCollectionTiles' else '{}'::jsonb end,
        '{}'::jsonb
      ) || coalesce(
        case when jsonb_typeof(progress.progress -> 'publicCollectionTiles') = 'object'
          then progress.progress -> 'publicCollectionTiles' else '{}'::jsonb end,
        '{}'::jsonb
      )
    )
  )::integer,
  progress.updated_at
from public.user_progress progress
left join public.account_names names on names.user_id = progress.user_id
left join lateral (
  select entry.account_name, entry.avatar_url
  from public.leaderboard_entries entry
  where entry.user_id = progress.user_id
  order by entry.created_at desc
  limit 1
) latest on true
on conflict (user_id) do update set
  account_name = excluded.account_name,
  normalized_name = coalesce(excluded.normalized_name, player_public_profiles.normalized_name),
  avatar_url = coalesce(excluded.avatar_url, player_public_profiles.avatar_url),
  collection_tiles = player_public_profiles.collection_tiles || excluded.collection_tiles,
  blupets_count = greatest(player_public_profiles.blupets_count, excluded.blupets_count),
  updated_at = greatest(player_public_profiles.updated_at, excluded.updated_at);

-- Public profiles need only an allowlisted collection snapshot, not direct
-- access to the private user_progress row. This RPC replaces one Edge Function.
create or replace function public.get_public_collection(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'collectionTiles',
    collection_tiles
  )
  from public.player_public_profiles
  where user_id = target_user_id;
$$;

revoke all on function public.get_public_collection(uuid) from public;
grant execute on function public.get_public_collection(uuid) to anon, authenticated, service_role;

-- High-frequency tournament standings are a read-only snapshot. Keeping this
-- in Postgres avoids charging one Edge Function invocation for every safety
-- refresh while preserving membership checks and keeping the room seed hidden.
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
  if viewer_id is null then
    raise exception 'unauthorized';
  end if;

  select id, code, title, creator_user_id, status, started_at, ends_at,
         duration_minutes, vibe_id, rules
    into room_row
    from tournament_rooms
   where upper(code) = upper(regexp_replace(coalesce(target_code, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1;

  if not found then raise exception 'room_not_found'; end if;
  if room_row.creator_user_id is distinct from viewer_id and not exists (
    select 1
      from tournament_room_players player
     where player.room_id = room_row.id
       and player.user_id = viewer_id
       and player.removed_at is null
  ) then
    raise exception 'not_registered_for_room';
  end if;

  with ranked as (
    select
      row_number() over (order by score desc, moves_used asc, created_at asc)::integer as rank,
      user_id, account_name, avatar_url, score, moves_used, created_at
    from tournament_leaderboard_entries
    where room_id = room_row.id
  ), limited as (
    select * from ranked order by rank limit safe_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
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
      'vibe_id', room_row.vibe_id,
      'rules', room_row.rules
    ),
    'entries', entry_rows,
    'players', player_rows,
    'playerRank', viewer_rank
  );
end;
$$;

revoke all on function public.fetch_tournament_leaderboard_snapshot(text, integer) from public, anon;
grant execute on function public.fetch_tournament_leaderboard_snapshot(text, integer)
  to authenticated, service_role;

create or replace function public.fetch_global_leaderboard(result_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with best_score as (
    select distinct on (entry.user_id)
      entry.user_id, entry.score, entry.moves_used, entry.t4_color,
      entry.t4_partner, entry.t4_form_key, entry.vibe, entry.created_at
    from leaderboard_entries entry
    where entry.user_id is not null
    order by entry.user_id, entry.score desc, entry.moves_used asc, entry.created_at asc
  ), candidates as (
    (select best.user_id
       from best_score best
       order by best.score desc
       limit greatest(10, least(coalesce(result_limit, 100), 500)) * 5)
    union
    (select profile.user_id
       from player_public_profiles profile
       order by profile.blupets_count desc
       limit greatest(10, least(coalesce(result_limit, 100), 500)) * 5)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', best.user_id,
    'accountName', profile.account_name,
    'avatarUrl', profile.avatar_url,
    'score', best.score,
    'movesUsed', best.moves_used,
    'blupetsCount', profile.blupets_count,
    'familyBadges', '{}'::jsonb,
    'collectionTrusted', true,
    't4Color', best.t4_color,
    't4Partner', best.t4_partner,
    't4FormKey', best.t4_form_key,
    'vibe', best.vibe,
    'timestamp', extract(epoch from best.created_at) * 1000
  )), '[]'::jsonb)
  from candidates candidate
  join best_score best on best.user_id = candidate.user_id
  join player_public_profiles profile on profile.user_id = candidate.user_id;
$$;

revoke all on function public.fetch_global_leaderboard(integer) from public;
grant execute on function public.fetch_global_leaderboard(integer) to anon, authenticated, service_role;

create or replace function public.fetch_public_user_entries(target_user_id uuid, result_limit integer default 500)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'score', entry.score,
    'movesUsed', entry.moves_used,
    'blupetsCount', profile.blupets_count,
    'familyBadges', '{}'::jsonb,
    't4Color', entry.t4_color,
    't4Partner', entry.t4_partner,
    't4FormKey', entry.t4_form_key,
    'collectionTiles', profile.collection_tiles,
    'collectionTrusted', true,
    'timestamp', extract(epoch from entry.created_at) * 1000
  ) order by entry.created_at desc), '[]'::jsonb)
  from (
    select *
    from leaderboard_entries
    where user_id = target_user_id
    order by created_at desc
    limit greatest(1, least(coalesce(result_limit, 500), 500))
  ) entry
  left join player_public_profiles profile on profile.user_id = target_user_id;
$$;

revoke all on function public.fetch_public_user_entries(uuid, integer) from public;
grant execute on function public.fetch_public_user_entries(uuid, integer) to anon, authenticated, service_role;

create or replace function public.purge_expired_operational_data(retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := clock_timestamp() - make_interval(days => greatest(retention_days, 7));
  stale_run_cutoff timestamptz := clock_timestamp() - interval '1 day';
  removed_leaderboard integer := 0;
  removed_runs integer := 0;
  removed_guest_runs integer := 0;
begin
  -- Keep recent history plus each account's lifetime best score and latest
  -- result. The public profile keeps collection rank separately; user_progress keeps aggregate wins,
  -- runs, forms, best score, quests, capsules, and collection permanently.
  with ranked as (
    select
      id,
      user_id,
      created_at,
      row_number() over (
        partition by user_id
        order by score desc, moves_used asc, created_at asc
      ) as score_rank,
      row_number() over (
        partition by user_id
        order by created_at desc
      ) as latest_rank
    from public.leaderboard_entries
    where user_id is not null
  ), removable as (
    select id
      from ranked
     where created_at < cutoff
       and score_rank > 1
       and latest_rank > 1
    union all
    select id
      from public.leaderboard_entries
     where user_id is null
       and created_at < cutoff
  )
  delete from public.leaderboard_entries entry
   using removable
   where entry.id = removable.id;
  get diagnostics removed_leaderboard = row_count;

  -- Submitted seeds are retained for idempotent retry/debugging during the
  -- history window. Abandoned, never-submitted seeds expire after one day.
  delete from public.game_runs
   where (submitted_at is not null and created_at < cutoff)
      or (submitted_at is null and created_at < stale_run_cutoff);
  get diagnostics removed_runs = row_count;

  -- Guest seeds are valid for only 30 minutes; one day leaves ample recovery
  -- margin without allowing anonymous seed rows to accumulate.
  delete from public.guest_game_runs
   where created_at < stale_run_cutoff;
  get diagnostics removed_guest_runs = row_count;

  return jsonb_build_object(
    'removedLeaderboardEntries', removed_leaderboard,
    'removedRuns', removed_runs,
    'removedGuestRuns', removed_guest_runs
  );
end;
$$;

revoke all on function public.purge_expired_operational_data(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_operational_data(integer)
  to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'purge-expired-operational-data') then
      perform cron.unschedule('purge-expired-operational-data');
    end if;
    perform cron.schedule(
      'purge-expired-operational-data',
      '43 4 * * *',
      'select public.purge_expired_operational_data(30);'
    );
  end if;
end $$;
