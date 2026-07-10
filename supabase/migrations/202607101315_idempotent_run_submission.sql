-- A claimed run must be recoverable if a later database write is interrupted.
alter table public.user_progress
  add column if not exists last_run_id uuid references public.game_runs(id) on delete set null;

alter table public.leaderboard_entries
  add column if not exists run_id uuid unique references public.game_runs(id) on delete set null;
