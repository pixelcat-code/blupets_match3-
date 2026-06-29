alter table public.leaderboard_entries
  add column if not exists family_badges jsonb not null default '{}';
