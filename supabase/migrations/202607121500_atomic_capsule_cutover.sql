-- Close the final shadow -> active race without changing the dormant default.
-- A shadow sync holds a shared settings-row lock before touching a wallet;
-- activation takes the exclusive lock, refreshes every wallet from the latest
-- cloud snapshot, and flips authority in the same transaction.

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
  select mode into current_mode
  from capsule_system_settings
  where singleton
  for share;

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

create or replace function public.set_server_capsules_mode(target_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_mode text;
declare first_enabled_at timestamptz;
begin
  if target_mode not in ('shadow', 'active', 'paused') then raise exception 'invalid_capsule_mode'; end if;

  select mode, enabled_at into current_mode, first_enabled_at
  from capsule_system_settings
  where singleton
  for update;

  if target_mode = 'shadow' and first_enabled_at is not null then
    raise exception 'cannot_return_to_shadow_after_cutover';
  end if;

  if target_mode = 'active' and current_mode = 'shadow' then
    insert into capsule_wallets (
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
    from user_progress progress
    on conflict (user_id) do update set
      capsules = excluded.capsules,
      shards = excluded.shards,
      capsule_stats = excluded.capsule_stats,
      collection_tiles = excluded.collection_tiles,
      state_version = capsule_wallets.state_version + 1,
      migrated_at = excluded.migrated_at,
      updated_at = excluded.updated_at;
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

-- Keep the legacy operator entrypoint safe by routing it through the same
-- atomic mode transition.
create or replace function public.set_server_capsules_enabled(enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare first_enabled_at timestamptz;
begin
  select enabled_at into first_enabled_at from capsule_system_settings where singleton;
  perform set_server_capsules_mode(
    case when enabled then 'active'
      when first_enabled_at is null then 'shadow'
      else 'paused'
    end
  );
end;
$$;

revoke all on function public.set_server_capsules_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_server_capsules_enabled(boolean) to service_role;
