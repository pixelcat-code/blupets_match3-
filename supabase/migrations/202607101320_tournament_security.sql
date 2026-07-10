-- Tournament rooms contain a deterministic seed. Browser table reads and
-- postgres_changes would expose it before play, so room data is edge-only.
revoke all on public.tournament_rooms from anon, authenticated;
revoke all on public.tournament_runs from anon, authenticated;

drop policy if exists "tournament_rooms: public read" on public.tournament_rooms;

-- The frontend polls authenticated Edge Functions for room state and standings.
-- Do not publish rows with their seed over Realtime.
do $$
begin
  if exists (
    select 1 from pg_publication_rel rel
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and rel.prrelid = 'public.tournament_rooms'::regclass
  ) then
    execute 'alter publication supabase_realtime drop table public.tournament_rooms';
  end if;
  if exists (
    select 1 from pg_publication_rel rel
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and rel.prrelid = 'public.tournament_leaderboard_entries'::regclass
  ) then
    execute 'alter publication supabase_realtime drop table public.tournament_leaderboard_entries';
  end if;
end $$;
