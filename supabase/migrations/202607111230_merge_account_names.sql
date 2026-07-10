-- Complete the table-count reduction after all writers switched to
-- player_public_profiles. Keep the old nullable leaderboard columns for a
-- browser-cache grace period; new rows no longer populate them, so they do not
-- cause continued JSON growth and old open tabs remain compatible.

insert into public.player_public_profiles (
  user_id, account_name, normalized_name, updated_at
)
select
  names.user_id,
  coalesce(latest.account_name, names.normalized_name, 'Player'),
  names.normalized_name,
  now()
from public.account_names names
left join lateral (
  select entry.account_name
  from public.leaderboard_entries entry
  where entry.user_id = names.user_id
  order by entry.created_at desc
  limit 1
) latest on true
on conflict (user_id) do update set
  normalized_name = excluded.normalized_name,
  account_name = case
    when player_public_profiles.account_name = 'Player' then excluded.account_name
    else player_public_profiles.account_name
  end,
  updated_at = greatest(player_public_profiles.updated_at, excluded.updated_at);

drop table if exists public.account_names;
