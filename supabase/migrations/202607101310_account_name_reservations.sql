-- A dedicated unique index is the only race-safe way to reserve display names.
-- Browser clients have no access; update-account-name uses the service role.
create table if not exists public.account_names (
  user_id uuid primary key references auth.users on delete cascade,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_names enable row level security;
revoke all on public.account_names from anon, authenticated;

-- Preserve the earliest existing leaderboard owner for a legacy duplicated name.
insert into public.account_names (user_id, normalized_name)
select distinct on (lower(trim(account_name)))
  user_id,
  lower(trim(account_name))
from public.leaderboard_entries
where user_id is not null and trim(account_name) <> ''
order by lower(trim(account_name)), created_at asc
on conflict do nothing;
