-- player_public_profiles.collection_tiles is the canonical public collection.
-- Keep the sortable integer as a database-maintained derivative so profile and
-- leaderboard counts can never drift apart.

create or replace function public.collection_tiles_count(tiles jsonb)
returns integer
language sql
immutable
parallel safe
set search_path = public
as $$
  select count(*)::integer
  from jsonb_object_keys(
    case when jsonb_typeof(tiles) = 'object' then tiles else '{}'::jsonb end
  );
$$;

revoke all on function public.collection_tiles_count(jsonb) from public;
grant execute on function public.collection_tiles_count(jsonb) to service_role;

create or replace function public.set_player_public_profile_collection_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.collection_tiles := case
    when jsonb_typeof(new.collection_tiles) = 'object' then new.collection_tiles
    else '{}'::jsonb
  end;
  new.blupets_count := public.collection_tiles_count(new.collection_tiles);
  return new;
end;
$$;

revoke all on function public.set_player_public_profile_collection_count() from public, anon, authenticated;

drop trigger if exists player_public_profiles_collection_count on public.player_public_profiles;
create trigger player_public_profiles_collection_count
before insert or update of collection_tiles, blupets_count
on public.player_public_profiles
for each row execute function public.set_player_public_profile_collection_count();

-- Edge Functions use this instead of a read/modify/write pair. ON CONFLICT
-- merges against the row after Postgres locks it, so simultaneous devices
-- cannot overwrite each other's newly opened forms.
create or replace function public.merge_player_public_collection(
  target_user_id uuid,
  incoming_tiles jsonb,
  incoming_account_name text,
  incoming_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_tiles jsonb := case
    when jsonb_typeof(incoming_tiles) = 'object' then incoming_tiles
    else '{}'::jsonb
  end;
  safe_name text := left(coalesce(nullif(trim(incoming_account_name), ''), 'Player'), 128);
  existing player_public_profiles%rowtype;
  merged_tiles jsonb;
begin
  select * into existing
  from player_public_profiles
  where user_id = target_user_id;

  if found
     and existing.collection_tiles @> safe_tiles
     and existing.account_name = safe_name
     and (incoming_avatar_url is null or existing.avatar_url = incoming_avatar_url) then
    return existing.collection_tiles;
  end if;

  insert into player_public_profiles (
    user_id, account_name, avatar_url, collection_tiles, updated_at
  ) values (
    target_user_id, safe_name, incoming_avatar_url, safe_tiles, clock_timestamp()
  )
  on conflict (user_id) do update set
    account_name = excluded.account_name,
    avatar_url = coalesce(excluded.avatar_url, player_public_profiles.avatar_url),
    collection_tiles = player_public_profiles.collection_tiles || excluded.collection_tiles,
    updated_at = clock_timestamp()
  returning collection_tiles into merged_tiles;

  return merged_tiles;
end;
$$;

revoke all on function public.merge_player_public_collection(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.merge_player_public_collection(uuid, jsonb, text, text)
  to service_role;

-- Repair all historical rows immediately.
update public.player_public_profiles
set blupets_count = public.collection_tiles_count(collection_tiles)
where blupets_count is distinct from public.collection_tiles_count(collection_tiles);
