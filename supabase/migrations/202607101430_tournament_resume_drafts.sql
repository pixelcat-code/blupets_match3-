-- A tournament attempt owns a server-verified draft. Closing a tab must not
-- submit that draft: the player may resume it until the shared deadline. If
-- they never return, Cron finalizes the latest checkpoint as a partial run.

alter table public.tournament_runs
  add column if not exists draft_actions jsonb not null default '[]'::jsonb,
  add column if not exists draft_result jsonb not null default jsonb_build_object(
    'score', 0,
    'movesUsed', 0,
    'formKey', 'RUN_COMPLETE',
    'formName', 'Run Complete',
    'colorId', 'yellow',
    'partnerColorId', 'yellow',
    'vibe', null
  ),
  add column if not exists draft_action_count integer not null default 0,
  add column if not exists draft_saved_at timestamptz,
  add column if not exists draft_account_name text not null default 'Player',
  add column if not exists draft_avatar_url text;

alter table public.tournament_runs
  drop constraint if exists tournament_runs_draft_action_count_check;
alter table public.tournament_runs
  add constraint tournament_runs_draft_action_count_check
  check (draft_action_count between 0 and 500);

create or replace function public.finalize_expired_tournament_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  -- The draft result is written only by save-tournament-draft, which replays
  -- the action log before saving it. An unreturned player therefore receives
  -- their last server-confirmed partial score, never a client-only claim.
  with candidates as (
    select
      run.id,
      run.room_id,
      run.user_id,
      run.draft_result,
      run.draft_account_name,
      run.draft_avatar_url
    from tournament_runs run
    join tournament_rooms room on room.id = run.room_id
    where run.submitted_at is null
      and room.ends_at is not null
      and room.ends_at <= clock_timestamp()
  ), inserted as (
    insert into tournament_leaderboard_entries (
      room_id, user_id, account_name, avatar_url, score, moves_used,
      t4_color, t4_partner, t4_form_key, vibe, validation_mode
    )
    select
      room_id,
      user_id,
      draft_account_name,
      draft_avatar_url,
      greatest(0, coalesce((draft_result ->> 'score')::integer, 0)),
      greatest(0, coalesce((draft_result ->> 'movesUsed')::integer, 0)),
      coalesce(nullif(draft_result ->> 'colorId', ''), 'yellow'),
      coalesce(nullif(draft_result ->> 'partnerColorId', ''), 'yellow'),
      coalesce(nullif(draft_result ->> 'formKey', ''), 'RUN_COMPLETE'),
      nullif(draft_result ->> 'vibe', ''),
      'replay_verified_partial'
    from candidates
    on conflict (room_id, user_id) do nothing
    returning room_id, user_id
  )
  update tournament_runs run
     set submitted_at = clock_timestamp()
    from candidates
   where run.id = candidates.id
     and run.submitted_at is null;

  get diagnostics changed = row_count;

  update tournament_rooms
     set status = 'ended'
   where status = 'live'
     and ends_at is not null
     and ends_at <= clock_timestamp();

  return changed;
end;
$$;

revoke all on function public.finalize_expired_tournament_drafts() from public, anon, authenticated;
grant execute on function public.finalize_expired_tournament_drafts() to service_role;

-- Supabase Cron executes this transaction in Postgres every minute, so expiry
-- does not depend on a player reopening the Lobby or keeping a tab alive.
create extension if not exists pg_cron;
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'blupets-finalize-expired-tournament-drafts';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'blupets-finalize-expired-tournament-drafts',
    '* * * * *',
    'select public.finalize_expired_tournament_drafts();'
  );
end;
$$;
