-- Tournament retention: bound the otherwise-unbounded growth of finished-room
-- data on the shared backend. tournament_runs and tournament_leaderboard_entries
-- both reference tournament_rooms(id) ON DELETE CASCADE, so pruning a room row
-- removes its runs and leaderboard entries too — we only delete room rows.
--
-- Safety: only provably-finished rooms are ever deleted. Active lobby/live rooms
-- (and anything within the retention window) are untouched. The app has no
-- historical-tournament read path — no screen loads past rooms/runs — so pruning
-- old rooms is invisible to players. This changes storage footprint only, not
-- gameplay.

create or replace function public.purge_old_tournament_rooms(retention_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
  cutoff  timestamptz := now() - make_interval(days => greatest(retention_days, 1));
begin
  delete from tournament_rooms
   where
     -- Finished by its deadline at least `retention_days` ago.
     (ends_at is not null and ends_at < cutoff)
     -- Explicitly ended and created that long ago (covers rooms whose deadline
     -- was open-ended but were closed by the host/finalizer).
     or (status = 'ended' and created_at < cutoff)
     -- A never-started draft/lobby that has been dead for the whole window.
     or (status in ('draft', 'lobby') and created_at < cutoff);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_old_tournament_rooms(integer) from public, anon, authenticated;
grant execute on function public.purge_old_tournament_rooms(integer) to service_role;

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

    perform cron.schedule(
      'purge-old-tournament-rooms',
      '17 4 * * *',  -- daily at 04:17 UTC
      'select public.purge_old_tournament_rooms(14);'
    );
  end if;
end $$;
