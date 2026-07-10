-- Stream only verified standings to signed-in tournament players. Room rows
-- remain edge-only because they contain the deterministic game seed.

revoke all on public.tournament_leaderboard_entries from anon;
grant select on public.tournament_leaderboard_entries to authenticated;

drop policy if exists "tournament_leaderboard_entries: public read"
  on public.tournament_leaderboard_entries;
drop policy if exists "tournament_leaderboard_entries: authenticated read"
  on public.tournament_leaderboard_entries;

create or replace function public.can_read_tournament_leaderboard(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Edge Functions serve full standings to room participants. Direct table
  -- reads are reserved for the host's one live spectator subscription, so a
  -- 50-player room produces one Realtime message per result instead of 50.
  select exists (
    select 1
      from tournament_rooms room
     where room.id = target_room_id
       and room.creator_user_id = auth.uid()
  );
$$;

revoke all on function public.can_read_tournament_leaderboard(uuid)
  from public, anon;
grant execute on function public.can_read_tournament_leaderboard(uuid)
  to authenticated, service_role;

create policy "tournament_leaderboard_entries: authenticated read"
  on public.tournament_leaderboard_entries
  for select
  to authenticated
  using (public.can_read_tournament_leaderboard(room_id));

do $$
begin
  if not exists (
    select 1
      from pg_publication_rel rel
      join pg_publication pub on pub.oid = rel.prpubid
     where pub.pubname = 'supabase_realtime'
       and rel.prrelid = 'public.tournament_leaderboard_entries'::regclass
  ) then
    execute 'alter publication supabase_realtime add table public.tournament_leaderboard_entries';
  end if;
end $$;
