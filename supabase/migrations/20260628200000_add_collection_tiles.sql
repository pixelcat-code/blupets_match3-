alter table public.leaderboard_entries
  add column if not exists collection_tiles jsonb default null;
