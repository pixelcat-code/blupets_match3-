-- Run in Supabase SQL editor after migrations.
-- Confirms RLS and public/authenticated grants for security-critical tables.

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'user_progress',
    'leaderboard_entries',
    'game_runs',
    'guest_game_runs'
  )
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'user_progress',
    'leaderboard_entries',
    'game_runs',
    'guest_game_runs'
  )
order by tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'user_progress',
    'leaderboard_entries',
    'game_runs',
    'guest_game_runs'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select
  bucket_id,
  name,
  owner,
  created_at
from storage.objects
where bucket_id = 'avatars'
limit 5;
