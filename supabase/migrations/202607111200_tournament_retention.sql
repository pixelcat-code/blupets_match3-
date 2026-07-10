-- Keep permanent, compact tournament history while bounding the large replay
-- payloads. Final standings and their room metadata are never removed. A run is
-- pruned only after a durable leaderboard entry proves its result was saved.

create or replace function public.compact_verified_tournament_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The leaderboard insert happens only after a server replay (or the verified
  -- draft finalizer). Once that durable summary exists, the growing action log
  -- is no longer needed for recovery. Keep a compact result snapshot and run
  -- metadata for idempotent retries and short-term auditing.
  update tournament_runs
     set draft_actions = '[]'::jsonb,
         draft_action_count = 0,
         draft_result = jsonb_build_object(
           'score', new.score,
           'movesUsed', new.moves_used,
           'formKey', coalesce(new.t4_form_key, 'RUN_COMPLETE'),
           'colorId', coalesce(new.t4_color, 'yellow'),
           'partnerColorId', coalesce(new.t4_partner, new.t4_color, 'yellow'),
           'vibe', new.vibe
         )
   where room_id = new.room_id
     and user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.compact_verified_tournament_run()
  from public, anon, authenticated;
grant execute on function public.compact_verified_tournament_run()
  to service_role;

drop trigger if exists compact_verified_tournament_run
  on public.tournament_leaderboard_entries;
create trigger compact_verified_tournament_run
after insert on public.tournament_leaderboard_entries
for each row execute function public.compact_verified_tournament_run();

create or replace function public.purge_old_tournament_data(retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_runs integer := 0;
  removed_players integer := 0;
  removed_empty_rooms integer := 0;
  cutoff  timestamptz := now() - make_interval(days => greatest(retention_days, 1));
begin
  delete from tournament_runs run
   where run.created_at < cutoff
     and exists (
       select 1
         from tournament_leaderboard_entries entry
        where entry.room_id = run.room_id
          and entry.user_id = run.user_id
     );
  get diagnostics removed_runs = row_count;

  -- Ready/removal state is operational lobby data, not a tournament result.
  -- Once every old attempt has a durable final entry, discard the old roster.
  delete from tournament_room_players player
   using tournament_rooms room
   where player.room_id = room.id
     and coalesce(room.ends_at, room.created_at) < cutoff
     and (
       room.status in ('draft', 'lobby', 'ended')
       or room.ends_at < clock_timestamp()
     )
     and not exists (
       select 1
         from tournament_runs run
        where run.room_id = room.id
          and run.submitted_at is null
     );
  get diagnostics removed_players = row_count;

  -- Only abandoned rooms which never contained an attempt or a result can be
  -- removed. Any room with player data or standings remains as history.
  delete from tournament_rooms room
   where room.created_at < cutoff
     and room.status in ('draft', 'lobby')
     and not exists (
       select 1 from tournament_runs run where run.room_id = room.id
     )
     and not exists (
       select 1 from tournament_leaderboard_entries entry where entry.room_id = room.id
     );
  get diagnostics removed_empty_rooms = row_count;

  return jsonb_build_object(
    'removedRuns', removed_runs,
    'removedPlayers', removed_players,
    'removedEmptyRooms', removed_empty_rooms
  );
end;
$$;

revoke all on function public.purge_old_tournament_data(integer) from public, anon, authenticated;
grant execute on function public.purge_old_tournament_data(integer) to service_role;

-- Schedule a daily off-peak run via pg_cron when the extension is available.
-- Wrapped in a guard so this migration still applies on environments where
-- pg_cron is not enabled (e.g. a bare local `supabase db reset`).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Idempotent: drop a prior definition so re-applying this migration does
    -- not stack duplicate schedules.
    if exists (select 1 from cron.job where jobname = 'purge-old-tournament-rooms') then
      perform cron.unschedule('purge-old-tournament-rooms');
    end if;
    if exists (select 1 from cron.job where jobname = 'purge-old-tournament-data') then
      perform cron.unschedule('purge-old-tournament-data');
    end if;

    perform cron.schedule(
      'purge-old-tournament-data',
      '17 4 * * *',  -- daily at 04:17 UTC
      'select public.purge_old_tournament_data(30);'
    );
  end if;
end $$;
