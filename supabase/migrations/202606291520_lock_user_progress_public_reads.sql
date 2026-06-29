alter table public.user_progress enable row level security;

drop policy if exists "user_progress: global read" on public.user_progress;
drop policy if exists "user_progress: own read" on public.user_progress;

create policy "user_progress: own read"
  on public.user_progress for select
  using (auth.uid() = user_id);
