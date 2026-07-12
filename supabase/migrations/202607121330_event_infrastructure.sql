-- Generic, content-free event infrastructure.
--
-- This migration deliberately does not create an event or event items. Until a
-- service-role operator inserts and activates a configured event, every public
-- snapshot returns no event and the existing game remains unchanged.

create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  event_type            text not null default 'capsule_collection',
  rules_version         integer not null default 1 check (rules_version > 0),
  status                text not null default 'draft'
                        check (status in ('draft', 'scheduled', 'active', 'results', 'archived')),
  starts_at             timestamptz,
  ends_at               timestamptz,
  results_until         timestamptz,
  title                 text,
  description           text,
  hero_asset            text,
  drop_strategy         text not null default 'guaranteed_item',
  ranking_strategy      text not null default 'rank_counts_lexicographic',
  config                jsonb not null default '{}'::jsonb,
  ended_at              timestamptz,
  ended_reason          text check (ended_reason is null or ended_reason in ('scheduled', 'manual')),
  archived_at           timestamptz,
  archived_reason       text check (archived_reason is null or archived_reason in ('expired', 'manual', 'replaced')),
  replaced_by_event_id  uuid references public.events(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  check (starts_at is null or ends_at is null or ends_at > starts_at),
  check (ends_at is null or results_until is null or results_until >= ends_at)
);

-- A results screen occupies the same foreground slot as an active event. The
-- operator may archive it early (or atomically replace it) to launch the next.
create unique index if not exists events_single_foreground_idx
  on public.events ((true))
  where status in ('active', 'results');

create index if not exists events_status_time_idx
  on public.events (status, starts_at, ends_at);

create table if not exists public.event_item_definitions (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  item_key      text not null,
  name          text not null,
  rank_order    integer not null,
  drop_weight   numeric not null check (drop_weight > 0),
  asset_url     text,
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (event_id, item_key)
);

create index if not exists event_item_definitions_event_rank_idx
  on public.event_item_definitions (event_id, rank_order desc, item_key);

-- Only event eligibility is ledgered here during the infrastructure phase.
-- Existing ordinary capsule balances remain untouched until the explicit
-- server-authoritative capsule cutover before an event launch.
create table if not exists public.capsule_event_lots (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete restrict,
  user_id       uuid not null references auth.users(id) on delete cascade,
  source_type   text not null,
  source_id     text not null,
  amount        integer not null check (amount > 0),
  remaining     integer not null check (remaining >= 0 and remaining <= amount),
  earned_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (event_id, user_id, source_type, source_id)
);

create index if not exists capsule_event_lots_spend_idx
  on public.capsule_event_lots (event_id, user_id, earned_at, id)
  where remaining > 0;

create table if not exists public.player_event_progress (
  event_id          uuid not null references public.events(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  item_counts       jsonb not null default '{}'::jsonb,
  rank_counts       jsonb not null default '{}'::jsonb,
  ranking_vector    integer[] not null default '{}'::integer[],
  total_items       integer not null default 0 check (total_items >= 0),
  reached_vector_at timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists player_event_progress_ranking_idx
  on public.player_event_progress (event_id, ranking_vector desc, reached_vector_at asc);

create table if not exists public.event_open_requests (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete restrict,
  user_id         uuid not null references auth.users(id) on delete cascade,
  requested_count integer not null check (requested_count between 1 and 50),
  consumed_count  integer not null check (consumed_count between 0 and requested_count),
  results         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (event_id, user_id, id)
);

create table if not exists public.event_drops (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete restrict,
  user_id         uuid not null references auth.users(id) on delete cascade,
  request_id      uuid not null references public.event_open_requests(id) on delete restrict,
  request_position integer not null check (request_position > 0),
  event_item_id   uuid not null references public.event_item_definitions(id) on delete restrict,
  rank_order      integer not null,
  created_at      timestamptz not null default now(),
  unique (request_id, request_position)
);

create table if not exists public.event_winner_snapshots (
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  final_rank      integer not null check (final_rank > 0),
  ranking_vector  integer[] not null,
  account_name    text not null default 'Player',
  avatar_url      text,
  captured_at     timestamptz not null default now(),
  primary key (event_id, user_id),
  unique (event_id, final_rank)
);

alter table public.events enable row level security;
alter table public.event_item_definitions enable row level security;
alter table public.capsule_event_lots enable row level security;
alter table public.player_event_progress enable row level security;
alter table public.event_open_requests enable row level security;
alter table public.event_drops enable row level security;
alter table public.event_winner_snapshots enable row level security;

drop policy if exists "events: authenticated visible read" on public.events;
create policy "events: authenticated visible read"
  on public.events for select to authenticated
  using (status in ('scheduled', 'active', 'results'));

drop policy if exists "event items: authenticated visible read" on public.event_item_definitions;
create policy "event items: authenticated visible read"
  on public.event_item_definitions for select to authenticated
  using (exists (
    select 1 from public.events event
    where event.id = event_id and event.status in ('scheduled', 'active', 'results')
  ));

drop policy if exists "event progress: own read" on public.player_event_progress;
create policy "event progress: own read"
  on public.player_event_progress for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "event lots: own read" on public.capsule_event_lots;
create policy "event lots: own read"
  on public.capsule_event_lots for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "event drops: own read" on public.event_drops;
create policy "event drops: own read"
  on public.event_drops for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "event winners: authenticated read" on public.event_winner_snapshots;
create policy "event winners: authenticated read"
  on public.event_winner_snapshots for select to authenticated
  using (true);

-- Lifecycle refresh is invoked by trusted Edge Functions before reads/writes.
create or replace function public.refresh_event_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := clock_timestamp();
begin
  update events
  set status = 'results',
      ended_at = coalesce(ended_at, now_at),
      ended_reason = coalesce(ended_reason, 'scheduled'),
      results_until = coalesce(results_until, now_at + interval '7 days'),
      updated_at = now_at
  where status = 'active' and ends_at <= now_at;

  update events
  set status = 'archived',
      archived_at = coalesce(archived_at, now_at),
      archived_reason = coalesce(archived_reason, 'expired'),
      updated_at = now_at
  where status = 'results' and results_until <= now_at;
end;
$$;

revoke all on function public.refresh_event_lifecycle() from public, anon, authenticated;
grant execute on function public.refresh_event_lifecycle() to service_role;

create or replace function public.grant_event_capsules(
  target_user_id uuid,
  grant_amount integer,
  grant_source_type text,
  grant_source_id text,
  grant_earned_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_event events%rowtype;
  lot capsule_event_lots%rowtype;
begin
  if grant_amount <= 0 or grant_amount > 10000 then
    raise exception 'invalid_grant_amount';
  end if;
  if nullif(trim(grant_source_type), '') is null or nullif(trim(grant_source_id), '') is null then
    raise exception 'invalid_grant_source';
  end if;

  perform refresh_event_lifecycle();
  select * into active_event from events
  where status = 'active'
    and grant_earned_at >= starts_at
    and grant_earned_at < ends_at
  limit 1;

  if not found then
    return jsonb_build_object('eligible', false, 'amount', 0, 'eventId', null);
  end if;

  insert into capsule_event_lots (
    event_id, user_id, source_type, source_id, amount, remaining, earned_at
  ) values (
    active_event.id, target_user_id, left(grant_source_type, 64), left(grant_source_id, 160),
    grant_amount, grant_amount, grant_earned_at
  )
  on conflict (event_id, user_id, source_type, source_id) do update
    set source_id = capsule_event_lots.source_id
  returning * into lot;

  return jsonb_build_object(
    'eligible', true,
    'eventId', active_event.id,
    'lotId', lot.id,
    'amount', lot.amount,
    'remaining', lot.remaining
  );
end;
$$;

revoke all on function public.grant_event_capsules(uuid, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_event_capsules(uuid, integer, text, text, timestamptz)
  to service_role;

-- Consume current-event lots oldest-first. Existing/pre-event capsules are not
-- represented here and therefore can never produce an event item.
create or replace function public.open_event_capsules(
  target_user_id uuid,
  opening_request_id uuid,
  requested_count integer,
  random_rolls double precision[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_event events%rowtype;
  existing_request event_open_requests%rowtype;
  lot capsule_event_lots%rowtype;
  chosen_item event_item_definitions%rowtype;
  total_weight numeric;
  roll_target numeric;
  running_weight numeric;
  available integer;
  consumed integer := 0;
  take_count integer;
  position integer;
  results jsonb := '[]'::jsonb;
  item_counts jsonb := '{}'::jsonb;
  rank_counts jsonb := '{}'::jsonb;
  ranking_vector integer[] := '{}'::integer[];
  current_progress player_event_progress%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  if requested_count < 1 or requested_count > 50 then
    raise exception 'invalid_open_count';
  end if;
  if coalesce(array_length(random_rolls, 1), 0) < requested_count then
    raise exception 'insufficient_random_rolls';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || opening_request_id::text, 0));
  select * into existing_request from event_open_requests where id = opening_request_id;
  if found then
    if existing_request.user_id <> target_user_id then
      raise exception 'request_owner_mismatch';
    end if;
    return jsonb_build_object(
      'eventId', existing_request.event_id,
      'consumedCount', existing_request.consumed_count,
      'results', existing_request.results,
      'idempotent', true
    );
  end if;

  perform refresh_event_lifecycle();
  select * into active_event from events where status = 'active' limit 1;
  if not found then
    return jsonb_build_object('eventId', null, 'consumedCount', 0, 'results', results);
  end if;

  select sum(drop_weight) into total_weight
  from event_item_definitions
  where event_id = active_event.id and enabled;
  if coalesce(total_weight, 0) <= 0 then
    raise exception 'event_items_not_configured';
  end if;

  select coalesce(sum(remaining), 0)::integer into available
  from capsule_event_lots
  where event_id = active_event.id and user_id = target_user_id and remaining > 0;
  consumed := least(requested_count, available);

  -- Lock and spend eligible lots event-first, oldest-first.
  take_count := consumed;
  for lot in
    select * from capsule_event_lots
    where event_id = active_event.id and user_id = target_user_id and remaining > 0
    order by earned_at, id
    for update
  loop
    exit when take_count <= 0;
    position := least(take_count, lot.remaining);
    update capsule_event_lots set remaining = remaining - position where id = lot.id;
    take_count := take_count - position;
  end loop;

  select * into current_progress from player_event_progress
  where event_id = active_event.id and user_id = target_user_id
  for update;
  if found then
    item_counts := current_progress.item_counts;
    rank_counts := current_progress.rank_counts;
  end if;

  for position in 1..consumed loop
    roll_target := greatest(0, least(0.999999999999, random_rolls[position])) * total_weight;
    running_weight := 0;
    chosen_item := null;
    for chosen_item in
      select * from event_item_definitions
      where event_id = active_event.id and enabled
      order by rank_order, item_key
    loop
      running_weight := running_weight + chosen_item.drop_weight;
      exit when roll_target < running_weight;
    end loop;

    item_counts := jsonb_set(
      item_counts,
      array[chosen_item.item_key],
      to_jsonb(coalesce((item_counts ->> chosen_item.item_key)::integer, 0) + 1),
      true
    );
    rank_counts := jsonb_set(
      rank_counts,
      array[chosen_item.rank_order::text],
      to_jsonb(coalesce((rank_counts ->> chosen_item.rank_order::text)::integer, 0) + 1),
      true
    );
    results := results || jsonb_build_array(jsonb_build_object(
      'itemKey', chosen_item.item_key,
      'name', chosen_item.name,
      'rankOrder', chosen_item.rank_order,
      'assetUrl', chosen_item.asset_url,
      'position', position
    ));
  end loop;

  if consumed > 0 then
    select coalesce(array_agg(
      coalesce((rank_counts ->> ranks.rank_order::text)::integer, 0)
      order by ranks.rank_order desc
    ), '{}'::integer[])
    into ranking_vector
    from (
      select distinct rank_order from event_item_definitions
      where event_id = active_event.id and enabled
    ) ranks;

    insert into player_event_progress (
      event_id, user_id, item_counts, rank_counts, ranking_vector,
      total_items, reached_vector_at, updated_at
    ) values (
      active_event.id, target_user_id, item_counts, rank_counts, ranking_vector,
      consumed, now_at, now_at
    )
    on conflict (event_id, user_id) do update set
      item_counts = excluded.item_counts,
      rank_counts = excluded.rank_counts,
      ranking_vector = excluded.ranking_vector,
      total_items = player_event_progress.total_items + consumed,
      reached_vector_at = now_at,
      updated_at = now_at;
  end if;

  insert into event_open_requests (
    id, event_id, user_id, requested_count, consumed_count, results
  ) values (
    opening_request_id, active_event.id, target_user_id, requested_count, consumed, results
  );

  if consumed > 0 then
    insert into event_drops (
      event_id, user_id, request_id, request_position, event_item_id, rank_order
    )
    select active_event.id, target_user_id, opening_request_id,
      result.position, definition.id, definition.rank_order
    from jsonb_to_recordset(results) as result("itemKey" text, position integer)
    join event_item_definitions definition
      on definition.event_id = active_event.id and definition.item_key = result."itemKey";
  end if;

  return jsonb_build_object(
    'eventId', active_event.id,
    'consumedCount', consumed,
    'results', results,
    'rankingVector', ranking_vector,
    'idempotent', false
  );
end;
$$;

revoke all on function public.open_event_capsules(uuid, uuid, integer, double precision[])
  from public, anon, authenticated;
grant execute on function public.open_event_capsules(uuid, uuid, integer, double precision[])
  to service_role;

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
  from player_event_progress progress
  left join player_public_profiles profile on profile.user_id = progress.user_id
  where progress.event_id = target_event_id
  order by progress.ranking_vector desc, progress.reached_vector_at asc
  limit 3;
end;
$$;

revoke all on function public.capture_event_winners(uuid) from public, anon, authenticated;
grant execute on function public.capture_event_winners(uuid) to service_role;

-- Replace the bootstrap lifecycle function now that winner capture exists, so
-- scheduled expiry and manual finish produce the same frozen top three.
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
    status = 'results',
    ends_at = least(coalesce(ends_at, now_at), now_at),
    ended_at = now_at,
    ended_reason = case when finish_reason = 'scheduled' then 'scheduled' else 'manual' end,
    results_until = now_at + interval '7 days',
    updated_at = now_at
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
    status = 'archived',
    archived_at = clock_timestamp(),
    archived_reason = case
      when archive_reason in ('expired', 'replaced') then archive_reason
      else 'manual'
    end,
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
  if not found or target.status not in ('draft', 'scheduled') then
    raise exception 'event_not_activatable';
  end if;
  if target.ends_at is null or target.ends_at <= clock_timestamp() then
    raise exception 'event_end_required';
  end if;
  if not exists (select 1 from event_item_definitions where event_id = target_event_id and enabled) then
    raise exception 'event_items_not_configured';
  end if;
  update events set
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
  order by case status when 'active' then 0 else 1 end, updated_at desc
  limit 1;
  if not found then return null; end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', foreground.id,
      'slug', foreground.slug,
      'eventType', foreground.event_type,
      'rulesVersion', foreground.rules_version,
      'status', foreground.status,
      'startsAt', foreground.starts_at,
      'endsAt', foreground.ends_at,
      'resultsUntil', foreground.results_until,
      'title', foreground.title,
      'description', foreground.description,
      'heroAsset', foreground.hero_asset,
      'dropStrategy', foreground.drop_strategy,
      'rankingStrategy', foreground.ranking_strategy,
      'config', foreground.config
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', item.item_key, 'name', item.name, 'rankOrder', item.rank_order,
        'weight', item.drop_weight, 'assetUrl', item.asset_url, 'metadata', item.metadata
      ) order by item.rank_order desc, item.item_key)
      from event_item_definitions item
      where item.event_id = foreground.id and item.enabled
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_build_object(
        'itemCounts', progress.item_counts,
        'rankCounts', progress.rank_counts,
        'rankingVector', progress.ranking_vector,
        'totalItems', progress.total_items,
        'reachedVectorAt', progress.reached_vector_at,
        'eligibleCapsules', coalesce((
          select sum(lot.remaining) from capsule_event_lots lot
          where lot.event_id = foreground.id and lot.user_id = target_user_id
        ), 0)
      ) from player_event_progress progress
      where progress.event_id = foreground.id and progress.user_id = target_user_id
    ), jsonb_build_object(
      'itemCounts', '{}'::jsonb, 'rankCounts', '{}'::jsonb,
      'rankingVector', '[]'::jsonb, 'totalItems', 0,
      'eligibleCapsules', coalesce((
        select sum(lot.remaining) from capsule_event_lots lot
        where lot.event_id = foreground.id and lot.user_id = target_user_id
      ), 0)
    )),
    'leaderboard', coalesce((
      select jsonb_agg(row_payload order by final_order)
      from (
        select jsonb_build_object(
          'rank', row_number() over (order by progress.ranking_vector desc, progress.reached_vector_at asc),
          'userId', progress.user_id,
          'accountName', coalesce(profile.account_name, 'Player'),
          'avatarUrl', profile.avatar_url,
          'rankingVector', progress.ranking_vector,
          'totalItems', progress.total_items,
          'reachedVectorAt', progress.reached_vector_at
        ) row_payload,
        row_number() over (order by progress.ranking_vector desc, progress.reached_vector_at asc) final_order
        from player_event_progress progress
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
