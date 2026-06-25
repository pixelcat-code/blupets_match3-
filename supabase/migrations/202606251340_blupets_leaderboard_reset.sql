-- Adds the collection-count leaderboard and clears existing leaderboard rows.
-- Apply once before deploying the updated submit-run Edge Function.

alter table public.leaderboard_entries
  add column if not exists blupets_count integer not null default 0;

alter table public.user_progress
  add column if not exists progress jsonb not null default '{}';

drop index if exists public.leaderboard_entries_moves_idx;

create index if not exists leaderboard_entries_score_idx
  on public.leaderboard_entries (score desc);

create index if not exists leaderboard_entries_blupets_idx
  on public.leaderboard_entries (blupets_count desc, score desc);

truncate table public.leaderboard_entries restart identity;
