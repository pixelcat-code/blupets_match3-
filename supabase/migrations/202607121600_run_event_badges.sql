-- Replace the unused capsule-event/server-capsule experiment with the final
-- product rule: one random event badge for each normal authenticated,
-- replay-verified game run. Tournament and guest runs use different tables and
-- can never satisfy this schema or RPC.

-- Remove obsolete event/capsule functions before their table argument types.
drop function if exists public.open_event_capsules(uuid, uuid, integer, double precision[]);
drop function if exists public.grant_event_capsules(uuid, integer, text, text, timestamptz);
drop function if exists public.fetch_event_snapshot(uuid, integer);
drop function if exists public.capture_event_winners(uuid);
drop function if exists public.finish_event(uuid, text);
drop function if exists public.archive_event(uuid, text);
drop function if exists public.activate_event(uuid);
drop function if exists public.replace_event(uuid, uuid);
drop function if exists public.refresh_event_lifecycle();

drop function if exists public.finalize_capsule_open(uuid, uuid, jsonb, jsonb, double precision[]);
drop function if exists public.reserve_capsule_open(uuid, uuid, integer, bigint);
drop function if exists public.exchange_capsule_shards(uuid, uuid, integer);
drop function if exists public.grant_capsules_to_wallet(uuid, integer, text, text, timestamptz);
drop function if exists public.fetch_capsule_state(uuid);
drop function if exists public.sync_shadow_capsule_wallet(uuid, jsonb);
drop function if exists public.bootstrap_capsule_wallet(uuid, jsonb);
drop function if exists public.set_server_capsules_enabled(boolean);
drop function if exists public.set_server_capsules_mode(text);
drop function if exists public.capsule_wallet_json(public.capsule_wallets);

-- Remove all unused capsule ledgers and the old capsule-driven event model.
drop table if exists public.event_drops;
drop table if exists public.event_open_requests;
drop table if exists public.capsule_event_lots;
drop table if exists public.player_event_progress;
drop table if exists public.event_item_definitions;
drop table if exists public.capsule_open_requests;
drop table if exists public.capsule_exchange_requests;
drop table if exists public.capsule_grants;
drop table if exists public.capsule_wallets;
drop table if exists public.capsule_system_settings;

-- No event content was launched. Keep the rebuilt infrastructure content-free.
delete from public.events;
alter table public.events alter column event_type set default 'run_badge_collection';
alter table public.events alter column ranking_strategy set default 'badge_rank_counts_lexicographic';
alter table public.events drop column if exists drop_strategy;

create table public.event_badge_definitions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  badge_key   text not null,
  name        text not null,
  rank_order  integer not null check (rank_order > 0),
  drop_weight numeric not null check (drop_weight > 0),
  asset_url   text,
  enabled     boolean not null default true,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (event_id, badge_key)
);

create index event_badge_definitions_event_rank_idx
  on public.event_badge_definitions (event_id, rank_order desc, badge_key);

create table public.event_run_badge_awards (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete restrict,
  user_id     uuid not null references auth.users(id) on delete cascade,
  run_id      uuid not null references public.game_runs(id) on delete restrict,
  badge_id    uuid not null references public.event_badge_definitions(id) on delete restrict,
  rank_order  integer not null check (rank_order > 0),
  awarded_at  timestamptz not null default now(),
  unique (run_id),
  unique (event_id, user_id, run_id)
);

create index event_run_badge_awards_user_idx
  on public.event_run_badge_awards (event_id, user_id, awarded_at desc);

create table public.player_event_badge_progress (
  event_id          uuid not null references public.events(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  badge_counts      jsonb not null default '{}'::jsonb,
  rank_counts       jsonb not null default '{}'::jsonb,
  ranking_vector    integer[] not null default '{}'::integer[],
  total_badges      integer not null default 0 check (total_badges >= 0),
  reached_vector_at timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index player_event_badge_progress_ranking_idx
  on public.player_event_badge_progress (event_id, ranking_vector desc, reached_vector_at asc);

alter table public.event_badge_definitions enable row level security;
alter table public.event_run_badge_awards enable row level security;
alter table public.player_event_badge_progress enable row level security;

create policy "event badges: authenticated visible read"
  on public.event_badge_definitions for select to authenticated
  using (exists (
    select 1 from public.events event
    where event.id = event_id and event.status in ('active', 'results')
  ));

create policy "event run badge awards: own read"
  on public.event_run_badge_awards for select to authenticated
  using (auth.uid() = user_id);

create policy "event badge progress: own read"
  on public.player_event_badge_progress for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.capture_event_winners(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from event_winner_snapshots where event_id = target_event_id;
  insert into event_winner_snapshots (
    event_id, user_id, final_rank, ranking_vector, account_name, avatar_url
  )
  select progress.event_id, progress.user_id,
    row_number() over (order by progress.ranking_vector desc, progress.reached_vector_at asc)::integer,
    progress.ranking_vector,
    coalesce(profile.account_name, 'Player'), profile.avatar_url
  from player_event_badge_progress progress
  left join player_public_profiles profile on profile.user_id = progress.user_id
  where progress.event_id = target_event_id
  order by progress.ranking_vector desc, progress.reached_vector_at asc
  limit 3;
end;
$$;

revoke all on function public.capture_event_winners(uuid) from public, anon, authenticated;
grant execute on function public.capture_event_winners(uuid) to service_role;

create or replace function public.refresh_event_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := clock_timestamp();
  transitioned_event_id uuid;
begin
  update events
  set status = 'results',
      ended_at = coalesce(ended_at, now_at),
      ended_reason = coalesce(ended_reason, 'scheduled'),
      results_until = coalesce(results_until, now_at + interval '7 days'),
      updated_at = now_at
  where status = 'active' and ends_at <= now_at
  returning id into transitioned_event_id;

  if transitioned_event_id is not null then
    perform capture_event_winners(transitioned_event_id);
  end if;

  update events
  set status = 'archived',
      archived_at = coalesce(archived_at, now_at),
      archived_reason = coalesce(archived_reason, 'expired'),
      updated_at = now_at
  where status = 'results' and results_until <= now_at;
end;
$$;

create or replace function public.finish_event(target_event_id uuid, finish_reason text default 'manual')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare now_at timestamptz := clock_timestamp();
begin
  update events set
    status = 'results', ends_at = least(coalesce(ends_at, now_at), now_at),
    ended_at = now_at,
    ended_reason = case when finish_reason = 'scheduled' then 'scheduled' else 'manual' end,
    results_until = now_at + interval '7 days', updated_at = now_at
  where id = target_event_id and status = 'active';
  if not found then raise exception 'event_not_active'; end if;
  perform capture_event_winners(target_event_id);
end;
$$;

revoke all on function public.finish_event(uuid, text) from public, anon, authenticated;
grant execute on function public.finish_event(uuid, text) to service_role;

create or replace function public.archive_event(target_event_id uuid, archive_reason text default 'manual')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events set
    status = 'archived', archived_at = clock_timestamp(),
    archived_reason = case when archive_reason in ('expired', 'replaced') then archive_reason else 'manual' end,
    updated_at = clock_timestamp()
  where id = target_event_id and status = 'results';
  if not found then raise exception 'event_not_in_results'; end if;
end;
$$;

revoke all on function public.archive_event(uuid, text) from public, anon, authenticated;
grant execute on function public.archive_event(uuid, text) to service_role;

create or replace function public.activate_event(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target events%rowtype;
begin
  perform refresh_event_lifecycle();
  if exists (select 1 from events where status in ('active', 'results') and id <> target_event_id) then
    raise exception 'foreground_event_exists';
  end if;
  select * into target from events where id = target_event_id for update;
  if not found or target.status not in ('draft', 'scheduled') then raise exception 'event_not_activatable'; end if;
  if target.ends_at is null or target.ends_at <= clock_timestamp() then raise exception 'event_end_required'; end if;
  if not exists (select 1 from event_badge_definitions where event_id = target_event_id and enabled) then
    raise exception 'event_badges_not_configured';
  end if;
  update events set
    event_type = 'run_badge_collection', ranking_strategy = 'badge_rank_counts_lexicographic',
    status = 'active', starts_at = clock_timestamp(),
    results_until = target.ends_at + interval '7 days', updated_at = clock_timestamp()
  where id = target_event_id;
end;
$$;

revoke all on function public.activate_event(uuid) from public, anon, authenticated;
grant execute on function public.activate_event(uuid) to service_role;

create or replace function public.replace_event(old_event_id uuid, new_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform archive_event(old_event_id, 'replaced');
  update events set replaced_by_event_id = new_event_id where id = old_event_id;
  perform activate_event(new_event_id);
end;
$$;

revoke all on function public.replace_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.replace_event(uuid, uuid) to service_role;

create or replace function public.award_event_badge_for_run(
  target_user_id uuid,
  target_run_id uuid,
  run_started_at timestamptz,
  award_roll double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_event events%rowtype;
  existing_award event_run_badge_awards%rowtype;
  chosen_badge event_badge_definitions%rowtype;
  current_progress player_event_badge_progress%rowtype;
  badge_counts jsonb := '{}'::jsonb;
  rank_counts jsonb := '{}'::jsonb;
  ranking_vector integer[] := '{}'::integer[];
  total_weight numeric;
  roll_target numeric;
  running_weight numeric := 0;
  now_at timestamptz := clock_timestamp();
begin
  if award_roll < 0 or award_roll >= 1 then raise exception 'invalid_event_badge_roll'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_run_id::text || ':event-badge', 0));

  select * into existing_award from event_run_badge_awards where run_id = target_run_id;
  if found then
    if existing_award.user_id <> target_user_id then raise exception 'run_owner_mismatch'; end if;
    select * into chosen_badge from event_badge_definitions where id = existing_award.badge_id;
    return jsonb_build_object(
      'eventId', existing_award.event_id, 'badgeKey', chosen_badge.badge_key,
      'name', chosen_badge.name, 'rankOrder', chosen_badge.rank_order,
      'assetUrl', chosen_badge.asset_url, 'awardedAt', existing_award.awarded_at,
      'idempotent', true
    );
  end if;

  if not exists (
    select 1 from game_runs run
    where run.id = target_run_id and run.user_id = target_user_id
      and run.created_at = run_started_at and run.submitted_at is not null
  ) then raise exception 'verified_normal_run_required'; end if;

  perform refresh_event_lifecycle();
  select * into active_event from events
  where status = 'active' and starts_at <= run_started_at and ends_at > now_at
  limit 1;
  if not found then return null; end if;

  select sum(drop_weight) into total_weight from event_badge_definitions
  where event_id = active_event.id and enabled;
  if coalesce(total_weight, 0) <= 0 then raise exception 'event_badges_not_configured'; end if;

  roll_target := award_roll * total_weight;
  for chosen_badge in
    select * from event_badge_definitions
    where event_id = active_event.id and enabled
    order by rank_order, badge_key
  loop
    running_weight := running_weight + chosen_badge.drop_weight;
    exit when roll_target < running_weight;
  end loop;

  select * into current_progress from player_event_badge_progress
  where event_id = active_event.id and user_id = target_user_id for update;
  if found then
    badge_counts := current_progress.badge_counts;
    rank_counts := current_progress.rank_counts;
  end if;

  badge_counts := jsonb_set(
    badge_counts, array[chosen_badge.badge_key],
    to_jsonb(coalesce((badge_counts ->> chosen_badge.badge_key)::integer, 0) + 1), true
  );
  rank_counts := jsonb_set(
    rank_counts, array[chosen_badge.rank_order::text],
    to_jsonb(coalesce((rank_counts ->> chosen_badge.rank_order::text)::integer, 0) + 1), true
  );
  select coalesce(array_agg(
    coalesce((rank_counts ->> ranks.rank_order::text)::integer, 0)
    order by ranks.rank_order desc
  ), '{}'::integer[]) into ranking_vector
  from (
    select distinct rank_order from event_badge_definitions
    where event_id = active_event.id and enabled
  ) ranks;

  insert into event_run_badge_awards (event_id, user_id, run_id, badge_id, rank_order, awarded_at)
  values (active_event.id, target_user_id, target_run_id, chosen_badge.id, chosen_badge.rank_order, now_at);

  insert into player_event_badge_progress (
    event_id, user_id, badge_counts, rank_counts, ranking_vector,
    total_badges, reached_vector_at, updated_at
  ) values (
    active_event.id, target_user_id, badge_counts, rank_counts, ranking_vector,
    1, now_at, now_at
  )
  on conflict (event_id, user_id) do update set
    badge_counts = excluded.badge_counts,
    rank_counts = excluded.rank_counts,
    ranking_vector = excluded.ranking_vector,
    total_badges = player_event_badge_progress.total_badges + 1,
    reached_vector_at = now_at,
    updated_at = now_at;

  return jsonb_build_object(
    'eventId', active_event.id, 'badgeKey', chosen_badge.badge_key,
    'name', chosen_badge.name, 'rankOrder', chosen_badge.rank_order,
    'assetUrl', chosen_badge.asset_url, 'awardedAt', now_at,
    'rankingVector', ranking_vector, 'idempotent', false
  );
end;
$$;

revoke all on function public.award_event_badge_for_run(uuid, uuid, timestamptz, double precision)
  from public, anon, authenticated;
grant execute on function public.award_event_badge_for_run(uuid, uuid, timestamptz, double precision)
  to service_role;

create or replace function public.fetch_event_snapshot(target_user_id uuid, result_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare foreground events%rowtype;
declare payload jsonb;
begin
  select * into foreground from events
  where status in ('active', 'results')
  order by case status when 'active' then 0 else 1 end, updated_at desc limit 1;
  if not found then return null; end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', foreground.id, 'slug', foreground.slug,
      'eventType', foreground.event_type, 'rulesVersion', foreground.rules_version,
      'status', foreground.status, 'startsAt', foreground.starts_at,
      'endsAt', foreground.ends_at, 'resultsUntil', foreground.results_until,
      'title', foreground.title, 'description', foreground.description,
      'heroAsset', foreground.hero_asset,
      'rankingStrategy', foreground.ranking_strategy, 'config', foreground.config
    ),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', badge.badge_key, 'name', badge.name, 'rankOrder', badge.rank_order,
        'weight', badge.drop_weight, 'assetUrl', badge.asset_url, 'metadata', badge.metadata
      ) order by badge.rank_order desc, badge.badge_key)
      from event_badge_definitions badge where badge.event_id = foreground.id and badge.enabled
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_build_object(
        'badgeCounts', progress.badge_counts, 'rankCounts', progress.rank_counts,
        'rankingVector', progress.ranking_vector, 'totalBadges', progress.total_badges,
        'reachedVectorAt', progress.reached_vector_at
      ) from player_event_badge_progress progress
      where progress.event_id = foreground.id and progress.user_id = target_user_id
    ), jsonb_build_object(
      'badgeCounts', '{}'::jsonb, 'rankCounts', '{}'::jsonb,
      'rankingVector', '[]'::jsonb, 'totalBadges', 0
    )),
    'leaderboard', coalesce((
      select jsonb_agg(row_payload order by final_order) from (
        select jsonb_build_object(
          'rank', row_number() over (order by progress.ranking_vector desc, progress.reached_vector_at asc),
          'userId', progress.user_id, 'accountName', coalesce(profile.account_name, 'Player'),
          'avatarUrl', profile.avatar_url, 'rankingVector', progress.ranking_vector,
          'totalBadges', progress.total_badges, 'reachedVectorAt', progress.reached_vector_at
        ) row_payload,
        row_number() over (order by progress.ranking_vector desc, progress.reached_vector_at asc) final_order
        from player_event_badge_progress progress
        left join player_public_profiles profile on profile.user_id = progress.user_id
        where progress.event_id = foreground.id
        order by progress.ranking_vector desc, progress.reached_vector_at asc
        limit greatest(1, least(coalesce(result_limit, 100), 500))
      ) ranked
    ), '[]'::jsonb),
    'winners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', winner.final_rank, 'userId', winner.user_id,
        'accountName', winner.account_name, 'avatarUrl', winner.avatar_url,
        'rankingVector', winner.ranking_vector
      ) order by winner.final_rank)
      from event_winner_snapshots winner where winner.event_id = foreground.id
    ), '[]'::jsonb)
  ) into payload;
  return payload;
end;
$$;

revoke all on function public.fetch_event_snapshot(uuid, integer) from public, anon, authenticated;
grant execute on function public.fetch_event_snapshot(uuid, integer) to service_role;
