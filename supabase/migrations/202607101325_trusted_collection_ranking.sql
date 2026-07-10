-- Capsule inventory is client-owned UI progress. It must not rank players or
-- become public until a server replay has derived the unlocked forms.
alter table public.leaderboard_entries
  add column if not exists collection_trusted boolean not null default false;

-- Existing collection snapshots were accepted from the browser. Leave score
-- history intact, but exclude those snapshots from collection ranking.
update public.leaderboard_entries
set collection_trusted = false;
