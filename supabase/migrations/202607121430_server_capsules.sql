-- Server-authoritative ordinary capsule wallet and one-time data cutover.
-- Disabled by default. Applying this migration alone does not switch clients.

create table if not exists public.capsule_system_settings (
  singleton       boolean primary key default true check (singleton),
  server_enabled  boolean not null default false,
  mode            text not null default 'shadow' check (mode in ('shadow', 'active', 'paused')),
  enabled_at      timestamptz,
  updated_at      timestamptz not null default now(),
  check (server_enabled = (mode = 'active'))
);

insert into public.capsule_system_settings (singleton, server_enabled, mode)
values (true, false, 'shadow')
on conflict (singleton) do nothing;

create table if not exists public.capsule_wallets (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  capsules         integer not null default 0 check (capsules >= 0),
  shards           integer not null default 0 check (shards >= 0),
  capsule_stats    jsonb not null default '{}'::jsonb,
  collection_tiles jsonb not null default '{}'::jsonb,
  state_version     bigint not null default 1 check (state_version > 0),
  migrated_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.capsule_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id   text not null,
  amount      integer not null check (amount > 0),
  event_id    uuid references public.events(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create table if not exists public.capsule_open_requests (
  id             uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         text not null check (status in ('pending', 'complete')),
  requested_count integer not null check (requested_count between 1 and 50),
  reserved_count integer not null check (reserved_count between 1 and requested_count),
  rng_seed       bigint not null check (rng_seed >= 0 and rng_seed <= 4294967295),
  base_state     jsonb not null,
  normal_results jsonb,
  event_result   jsonb,
  final_state    jsonb,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create unique index if not exists capsule_open_requests_one_pending_per_user_idx
  on public.capsule_open_requests (user_id)
  where status = 'pending';

create table if not exists public.capsule_exchange_requests (
  id             uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  capsules       integer not null check (capsules >= 0),
  shards_spent   integer not null check (shards_spent >= 0),
  wallet_state   jsonb not null,
  created_at     timestamptz not null default now()
);

alter table public.capsule_system_settings enable row level security;
alter table public.capsule_wallets enable row level security;
alter table public.capsule_grants enable row level security;
alter table public.capsule_open_requests enable row level security;
alter table public.capsule_exchange_requests enable row level security;

drop policy if exists "capsule wallets: own read" on public.capsule_wallets;
create policy "capsule wallets: own read"
  on public.capsule_wallets for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "capsule grants: own read" on public.capsule_grants;
create policy "capsule grants: own read"
  on public.capsule_grants for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.capsule_wallet_json(wallet public.capsule_wallets)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'capsules', wallet.capsules,
    'shards', wallet.shards,
    'capsuleStats', wallet.capsule_stats,
    'collectionTiles', wallet.collection_tiles,
    'stateVersion', wallet.state_version,
    'migratedAt', wallet.migrated_at,
    'updatedAt', wallet.updated_at
  );
$$;

revoke all on function public.capsule_wallet_json(public.capsule_wallets) from public, anon, authenticated;
grant execute on function public.capsule_wallet_json(public.capsule_wallets) to service_role;

-- One-time baseline from the latest cloud snapshot. Every imported capsule is
-- ordinary: no capsule_event_lot is created for historical balances.
insert into public.capsule_wallets (
  user_id, capsules, shards, capsule_stats, collection_tiles, migrated_at, updated_at
)
select
  progress.user_id,
  greatest(0, least(100000, case
    when progress.progress ->> 'capsules' ~ '^\d{1,9}$' then (progress.progress ->> 'capsules')::integer
    else 0 end)),
  greatest(0, least(10000000, case
    when progress.progress ->> 'shards' ~ '^\d{1,10}$' then (progress.progress ->> 'shards')::integer
    else 0 end)),
  case when jsonb_typeof(progress.progress -> 'capsuleStats') = 'object'
    then progress.progress -> 'capsuleStats' else '{}'::jsonb end,
  case when jsonb_typeof(progress.progress -> 'collectionTiles') = 'object'
    then progress.progress -> 'collectionTiles' else '{}'::jsonb end,
  clock_timestamp(), clock_timestamp()
from public.user_progress progress
on conflict (user_id) do nothing;

create or replace function public.bootstrap_capsule_wallet(
  target_user_id uuid,
  initial_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet capsule_wallets%rowtype;
  safe_state jsonb := case when jsonb_typeof(initial_state) = 'object' then initial_state else '{}'::jsonb end;
  safe_stats jsonb;
  safe_tiles jsonb;
begin
  select * into wallet from capsule_wallets where user_id = target_user_id;
  if found then return capsule_wallet_json(wallet); end if;

  safe_stats := case when jsonb_typeof(safe_state -> 'capsuleStats') = 'object'
    then safe_state -> 'capsuleStats' else '{}'::jsonb end;
  safe_tiles := case when jsonb_typeof(safe_state -> 'collectionTiles') = 'object'
    then safe_state -> 'collectionTiles' else '{}'::jsonb end;

  insert into capsule_wallets (
    user_id, capsules, shards, capsule_stats, collection_tiles
  ) values (
    target_user_id,
    greatest(0, least(100000, case
      when safe_state ->> 'capsules' ~ '^\d{1,9}$' then (safe_state ->> 'capsules')::integer
      else 0 end)),
    greatest(0, least(10000000, case
      when safe_state ->> 'shards' ~ '^\d{1,10}$' then (safe_state ->> 'shards')::integer
      else 0 end)),
    safe_stats,
    safe_tiles
  )
  on conflict (user_id) do nothing
  returning * into wallet;

  if not found then select * into wallet from capsule_wallets where user_id = target_user_id; end if;
  return capsule_wallet_json(wallet);
end;
$$;

revoke all on function public.bootstrap_capsule_wallet(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bootstrap_capsule_wallet(uuid, jsonb) to service_role;

-- Before cutover, keep the shadow wallet equal to the still-authoritative
-- client snapshot. This prevents local opens during the observation window
-- from leaving an inflated server balance. The function becomes a no-op the
-- instant mode changes to active or paused.
create or replace function public.sync_shadow_capsule_wallet(
  target_user_id uuid,
  shadow_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare wallet capsule_wallets%rowtype;
declare safe_state jsonb := case when jsonb_typeof(shadow_state) = 'object' then shadow_state else '{}'::jsonb end;
declare current_mode text;
begin
  select mode into current_mode from capsule_system_settings where singleton;
  select * into wallet from capsule_wallets where user_id = target_user_id for update;
  if not found then raise exception 'capsule_wallet_missing'; end if;
  if current_mode <> 'shadow' then return capsule_wallet_json(wallet); end if;

  update capsule_wallets set
    capsules = greatest(0, least(100000, case
      when safe_state ->> 'capsules' ~ '^\d{1,9}$' then (safe_state ->> 'capsules')::integer else 0 end)),
    shards = greatest(0, least(10000000, case
      when safe_state ->> 'shards' ~ '^\d{1,10}$' then (safe_state ->> 'shards')::integer else 0 end)),
    capsule_stats = case when jsonb_typeof(safe_state -> 'capsuleStats') = 'object'
      then safe_state -> 'capsuleStats' else '{}'::jsonb end,
    collection_tiles = case when jsonb_typeof(safe_state -> 'collectionTiles') = 'object'
      then safe_state -> 'collectionTiles' else '{}'::jsonb end,
    state_version = state_version + 1,
    updated_at = clock_timestamp()
  where user_id = target_user_id returning * into wallet;
  return capsule_wallet_json(wallet);
end;
$$;

revoke all on function public.sync_shadow_capsule_wallet(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_shadow_capsule_wallet(uuid, jsonb) to service_role;

create or replace function public.fetch_capsule_state(target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare wallet capsule_wallets%rowtype;
declare enabled boolean;
declare current_mode text;
begin
  select server_enabled, mode into enabled, current_mode from capsule_system_settings where singleton;
  select * into wallet from capsule_wallets where user_id = target_user_id;
  return jsonb_build_object(
    'serverEnabled', coalesce(enabled, false),
    'mode', coalesce(current_mode, 'shadow'),
    'wallet', case when found then capsule_wallet_json(wallet) else null end
  );
end;
$$;

revoke all on function public.fetch_capsule_state(uuid) from public, anon, authenticated;
grant execute on function public.fetch_capsule_state(uuid) to service_role;

create or replace function public.set_server_capsules_enabled(enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update capsule_system_settings set
    server_enabled = enabled,
    mode = case when enabled then 'active' else case when enabled_at is null then 'shadow' else 'paused' end end,
    enabled_at = case when enabled then coalesce(enabled_at, clock_timestamp()) else enabled_at end,
    updated_at = clock_timestamp()
  where singleton;
  if enabled then
    update user_progress progress set
      progress = progress.progress || jsonb_build_object(
        'capsuleServerVersion', wallet.state_version,
        'capsuleServerAuthority', true
      ),
      updated_at = clock_timestamp()
    from capsule_wallets wallet
    where wallet.user_id = progress.user_id;
  end if;
end;
$$;

revoke all on function public.set_server_capsules_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_server_capsules_enabled(boolean) to service_role;

create or replace function public.set_server_capsules_mode(target_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_mode not in ('shadow', 'active', 'paused') then raise exception 'invalid_capsule_mode'; end if;
  if target_mode = 'shadow' and exists (
    select 1 from capsule_system_settings where singleton and enabled_at is not null
  ) then
    raise exception 'cannot_return_to_shadow_after_cutover';
  end if;
  update capsule_system_settings set
    mode = target_mode,
    server_enabled = target_mode = 'active',
    enabled_at = case when target_mode = 'active' then coalesce(enabled_at, clock_timestamp()) else enabled_at end,
    updated_at = clock_timestamp()
  where singleton;
  if target_mode = 'active' then
    update user_progress progress set
      progress = progress.progress || jsonb_build_object(
        'capsuleServerVersion', wallet.state_version,
        'capsuleServerAuthority', true
      ),
      updated_at = clock_timestamp()
    from capsule_wallets wallet
    where wallet.user_id = progress.user_id;
  end if;
end;
$$;

revoke all on function public.set_server_capsules_mode(text) from public, anon, authenticated;
grant execute on function public.set_server_capsules_mode(text) to service_role;

create or replace function public.grant_capsules_to_wallet(
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
declare wallet capsule_wallets%rowtype;
declare grant_row capsule_grants%rowtype;
declare event_grant jsonb;
begin
  if grant_amount <= 0 or grant_amount > 10000 then raise exception 'invalid_grant_amount'; end if;
  if not exists (select 1 from capsule_system_settings where singleton and mode = 'active') then
    raise exception 'server_capsules_not_active';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':capsule-grant', 0));

  select * into grant_row from capsule_grants
  where user_id = target_user_id and source_type = grant_source_type and source_id = grant_source_id;
  if found then
    select * into wallet from capsule_wallets where user_id = target_user_id;
    return jsonb_build_object('idempotent', true, 'wallet', capsule_wallet_json(wallet), 'eventId', grant_row.event_id);
  end if;

  select * into wallet from capsule_wallets where user_id = target_user_id for update;
  if not found then raise exception 'capsule_wallet_missing'; end if;
  update capsule_wallets set
    capsules = capsules + grant_amount,
    state_version = state_version + 1,
    updated_at = clock_timestamp()
  where user_id = target_user_id returning * into wallet;

  event_grant := grant_event_capsules(
    target_user_id, grant_amount, grant_source_type, grant_source_id, grant_earned_at
  );
  insert into capsule_grants (user_id, source_type, source_id, amount, event_id)
  values (
    target_user_id, left(grant_source_type, 64), left(grant_source_id, 160), grant_amount,
    nullif(event_grant ->> 'eventId', '')::uuid
  );
  return jsonb_build_object(
    'idempotent', false,
    'wallet', capsule_wallet_json(wallet),
    'eventId', event_grant -> 'eventId'
  );
end;
$$;

revoke all on function public.grant_capsules_to_wallet(uuid, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_capsules_to_wallet(uuid, integer, text, text, timestamptz)
  to service_role;

create or replace function public.reserve_capsule_open(
  target_user_id uuid,
  opening_request_id uuid,
  requested_count integer,
  random_seed bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare wallet capsule_wallets%rowtype;
declare request capsule_open_requests%rowtype;
declare reserve_count integer;
begin
  if requested_count < 1 or requested_count > 50 then raise exception 'invalid_open_count'; end if;
  if random_seed < 0 or random_seed > 4294967295 then raise exception 'invalid_random_seed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':capsule-open', 0));

  select * into request from capsule_open_requests where id = opening_request_id;
  if found then
    if request.user_id <> target_user_id then raise exception 'request_owner_mismatch'; end if;
    return jsonb_build_object(
      'status', request.status, 'count', request.reserved_count, 'seed', request.rng_seed,
      'baseState', request.base_state, 'normalResults', request.normal_results,
      'eventResult', request.event_result, 'wallet', request.final_state
    );
  end if;
  -- Reservation does not decrement the wallet, so an abandoned pending request
  -- can be removed safely. This unblocks a player whose tab died mid-request.
  delete from capsule_open_requests
  where user_id = target_user_id and status = 'pending'
    and created_at < clock_timestamp() - interval '15 minutes';
  if exists (select 1 from capsule_open_requests where user_id = target_user_id and status = 'pending') then
    raise exception 'capsule_open_pending';
  end if;

  select * into wallet from capsule_wallets where user_id = target_user_id for update;
  if not found then raise exception 'capsule_wallet_missing'; end if;
  reserve_count := least(requested_count, wallet.capsules);
  if reserve_count <= 0 then raise exception 'no_capsules'; end if;

  insert into capsule_open_requests (
    id, user_id, status, requested_count, reserved_count, rng_seed, base_state
  ) values (
    opening_request_id, target_user_id, 'pending', requested_count, reserve_count,
    random_seed, capsule_wallet_json(wallet)
  );
  return jsonb_build_object(
    'status', 'pending', 'count', reserve_count, 'seed', random_seed,
    'baseState', capsule_wallet_json(wallet)
  );
end;
$$;

revoke all on function public.reserve_capsule_open(uuid, uuid, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_capsule_open(uuid, uuid, integer, bigint)
  to service_role;

create or replace function public.finalize_capsule_open(
  target_user_id uuid,
  opening_request_id uuid,
  next_state jsonb,
  submitted_results jsonb,
  event_random_rolls double precision[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare request capsule_open_requests%rowtype;
declare wallet capsule_wallets%rowtype;
declare event_payload jsonb;
declare safe_tiles jsonb;
declare safe_stats jsonb;
declare expected_capsules integer;
declare next_shards integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':capsule-open', 0));
  select * into request from capsule_open_requests where id = opening_request_id for update;
  if not found or request.user_id <> target_user_id then raise exception 'capsule_request_not_found'; end if;
  if request.status = 'complete' then
    return jsonb_build_object(
      'idempotent', true, 'normalResults', request.normal_results,
      'eventResult', request.event_result, 'wallet', request.final_state
    );
  end if;

  select * into wallet from capsule_wallets where user_id = target_user_id for update;
  expected_capsules := coalesce((request.base_state ->> 'capsules')::integer, 0) - request.reserved_count;
  safe_tiles := case when jsonb_typeof(next_state -> 'collectionTiles') = 'object'
    then next_state -> 'collectionTiles' else null end;
  safe_stats := case when jsonb_typeof(next_state -> 'capsuleStats') = 'object'
    then next_state -> 'capsuleStats' else null end;
  next_shards := coalesce((next_state ->> 'shards')::integer, -1);

  if coalesce((next_state ->> 'capsules')::integer, -1) <> expected_capsules
     or next_shards < 0
     or next_shards > coalesce((request.base_state ->> 'shards')::integer, 0) + request.reserved_count * 25
     or safe_tiles is null or safe_stats is null
     or not (safe_tiles @> coalesce(request.base_state -> 'collectionTiles', '{}'::jsonb))
     or jsonb_typeof(submitted_results) <> 'array'
     or jsonb_array_length(submitted_results) <> request.reserved_count then
    raise exception 'invalid_capsule_result';
  end if;

  event_payload := open_event_capsules(
    target_user_id, opening_request_id, request.reserved_count, event_random_rolls
  );

  update capsule_wallets set
    capsules = expected_capsules,
    shards = next_shards,
    capsule_stats = safe_stats,
    collection_tiles = safe_tiles,
    state_version = state_version + 1,
    updated_at = clock_timestamp()
  where user_id = target_user_id returning * into wallet;

  insert into user_progress (user_id, progress, updated_at)
  values (
    target_user_id,
    jsonb_build_object(
      'capsules', wallet.capsules, 'shards', wallet.shards,
      'capsuleStats', wallet.capsule_stats, 'collectionTiles', wallet.collection_tiles,
      'capsuleServerVersion', wallet.state_version
    ),
    clock_timestamp()
  )
  on conflict (user_id) do update set
    progress = user_progress.progress || excluded.progress,
    updated_at = clock_timestamp();

  update capsule_open_requests set
    status = 'complete', normal_results = submitted_results,
    event_result = event_payload, final_state = capsule_wallet_json(wallet),
    completed_at = clock_timestamp()
  where id = opening_request_id;

  return jsonb_build_object(
    'idempotent', false, 'normalResults', submitted_results,
    'eventResult', event_payload, 'wallet', capsule_wallet_json(wallet)
  );
end;
$$;

revoke all on function public.finalize_capsule_open(uuid, uuid, jsonb, jsonb, double precision[])
  from public, anon, authenticated;
grant execute on function public.finalize_capsule_open(uuid, uuid, jsonb, jsonb, double precision[])
  to service_role;

create or replace function public.exchange_capsule_shards(
  target_user_id uuid,
  exchange_request_id uuid,
  maximum_capsules integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare wallet capsule_wallets%rowtype;
declare existing capsule_exchange_requests%rowtype;
declare exchange_count integer;
declare spent integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':capsule-exchange', 0));
  select * into existing from capsule_exchange_requests where id = exchange_request_id;
  if found then
    if existing.user_id <> target_user_id then raise exception 'request_owner_mismatch'; end if;
    return jsonb_build_object(
      'idempotent', true, 'capsules', existing.capsules,
      'shardsSpent', existing.shards_spent, 'wallet', existing.wallet_state
    );
  end if;
  select * into wallet from capsule_wallets where user_id = target_user_id for update;
  if not found then raise exception 'capsule_wallet_missing'; end if;
  exchange_count := least(greatest(0, maximum_capsules), floor(wallet.shards / 25.0)::integer);
  spent := exchange_count * 25;
  if exchange_count > 0 then
    update capsule_wallets set shards = shards - spent, updated_at = clock_timestamp()
    where user_id = target_user_id;
    perform grant_capsules_to_wallet(
      target_user_id, exchange_count, 'shard_exchange', exchange_request_id::text, clock_timestamp()
    );
    select * into wallet from capsule_wallets where user_id = target_user_id;
  end if;
  insert into capsule_exchange_requests (id, user_id, capsules, shards_spent, wallet_state)
  values (exchange_request_id, target_user_id, exchange_count, spent, capsule_wallet_json(wallet));
  return jsonb_build_object(
    'idempotent', false, 'capsules', exchange_count,
    'shardsSpent', spent, 'wallet', capsule_wallet_json(wallet)
  );
end;
$$;

revoke all on function public.exchange_capsule_shards(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.exchange_capsule_shards(uuid, uuid, integer)
  to service_role;
