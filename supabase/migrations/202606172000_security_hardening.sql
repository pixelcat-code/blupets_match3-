-- Security hardening: explicit deny for browser clients on security-critical tables.
-- Previously these tables relied on implicit RLS deny (RLS enabled, zero policies =
-- deny all). This migration makes the intent explicit so a future "CREATE POLICY ...
-- FOR INSERT" cannot accidentally open a write path.

-- game_runs: browser clients must never read or write seeds/run state.
-- All access is via Edge Functions with service-role credentials only.
revoke all on public.game_runs from authenticated;
revoke all on public.game_runs from anon;

-- leaderboard_entries: browser clients may SELECT (global read policy exists).
-- Writes are service-role only. Make that explicit.
revoke insert, update, delete on public.leaderboard_entries from authenticated;
revoke insert, update, delete on public.leaderboard_entries from anon;

-- user_progress: browser clients may SELECT their own row (own read policy exists).
-- Writes are service-role only.
revoke insert, update, delete on public.user_progress from authenticated;
revoke insert, update, delete on public.user_progress from anon;

-- Clean up stale open runs older than 30 minutes that were never submitted.
-- The start-run cap (MAX_OPEN_RUNS = 3) prevents future accumulation.
delete from public.game_runs
where submitted_at is null
  and created_at < now() - interval '30 minutes';
