import { PGlite } from "npm:@electric-sql/pglite";

const db = new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create table public.game_runs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    seed bigint not null default 1,
    created_at timestamptz not null default now(),
    submitted_at timestamptz
  );
  create table public.user_progress (
    user_id uuid primary key references auth.users(id) on delete cascade,
    wins integer not null default 0,
    runs integer not null default 0,
    best_score integer not null default 0,
    fewest_moves_win integer,
    forms jsonb not null default '{}'::jsonb,
    progress jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    last_run_id uuid
  );
  create table public.player_public_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    account_name text not null default 'Player',
    avatar_url text,
    collection_tiles jsonb not null default '{}'::jsonb,
    blupets_count integer not null default 0,
    updated_at timestamptz not null default now()
  );
`);

const migrations = [
  "supabase/migrations/202607121330_event_infrastructure.sql",
  "supabase/migrations/202607121430_server_capsules.sql",
  "supabase/migrations/202607121500_atomic_capsule_cutover.sql",
  "supabase/migrations/202607121600_run_event_badges.sql",
];

for (const migration of migrations) {
  await db.exec(await Deno.readTextFile(migration));
  console.log(`Applied ${migration}`);
}

const obsolete = await db.query<{ count: number }>(`
  select count(*)::integer as count from information_schema.tables
  where table_schema = 'public' and table_name in (
    'event_drops', 'event_open_requests', 'capsule_event_lots',
    'player_event_progress', 'event_item_definitions',
    'capsule_open_requests', 'capsule_exchange_requests', 'capsule_grants',
    'capsule_wallets', 'capsule_system_settings'
  )
`);
if (obsolete.rows[0]?.count !== 0) throw new Error("Obsolete capsule-event tables remain");

const required = await db.query<{ count: number }>(`
  select count(*)::integer as count from information_schema.tables
  where table_schema = 'public' and table_name in (
    'events', 'event_badge_definitions', 'event_run_badge_awards',
    'player_event_badge_progress', 'event_winner_snapshots'
  )
`);
if (required.rows[0]?.count !== 5) throw new Error(`Expected 5 event tables, found ${required.rows[0]?.count}`);

const userId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const secondRunId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
await db.exec(`
  insert into auth.users (id) values ('${userId}');
  insert into player_public_profiles (user_id, account_name) values ('${userId}', 'Test Player');
  insert into events (id, slug, status, ends_at, title)
  values ('${eventId}', 'run-badge-event', 'draft', clock_timestamp() + interval '1 day', 'Test Event');
  insert into event_badge_definitions (event_id, badge_key, name, rank_order, drop_weight)
  values
    ('${eventId}', 'base', 'Base Badge', 1, 9),
    ('${eventId}', 'high', 'High Badge', 2, 1);
  select activate_event('${eventId}');
  insert into game_runs (id, user_id, created_at, submitted_at)
  values ('${runId}', '${userId}', clock_timestamp(), clock_timestamp());
`);

const firstAward = await db.query<{ payload: Record<string, unknown> }>(`
  select award_event_badge_for_run('${userId}', '${runId}',
    (select created_at from game_runs where id = '${runId}'), 0.99) as payload
`);
if (firstAward.rows[0]?.payload?.badgeKey !== "high") {
  throw new Error(`Weighted badge selection failed: ${JSON.stringify(firstAward.rows[0]?.payload)}`);
}

const retryAward = await db.query<{ payload: Record<string, unknown> }>(`
  select award_event_badge_for_run('${userId}', '${runId}',
    (select created_at from game_runs where id = '${runId}'), 0.0) as payload
`);
if (retryAward.rows[0]?.payload?.badgeKey !== "high" || retryAward.rows[0]?.payload?.idempotent !== true) {
  throw new Error("Run retry changed or duplicated the event badge");
}

const counts = await db.query<{ awards: number; total_badges: number; ranking_vector: number[] }>(`
  select
    (select count(*)::integer from event_run_badge_awards where run_id = '${runId}') as awards,
    total_badges, ranking_vector
  from player_event_badge_progress where event_id = '${eventId}' and user_id = '${userId}'
`);
if (
  counts.rows[0]?.awards !== 1 || counts.rows[0]?.total_badges !== 1 ||
  JSON.stringify(counts.rows[0]?.ranking_vector) !== "[1,0]"
) throw new Error(`Badge progress mismatch: ${JSON.stringify(counts.rows[0])}`);

await db.exec(`
  insert into game_runs (id, user_id, created_at, submitted_at)
  values ('${secondRunId}', '${userId}', clock_timestamp() - interval '2 days', clock_timestamp());
`);
const outsideWindow = await db.query<{ payload: Record<string, unknown> | null }>(`
  select award_event_badge_for_run('${userId}', '${secondRunId}',
    (select created_at from game_runs where id = '${secondRunId}'), 0.5) as payload
`);
if (outsideWindow.rows[0]?.payload !== null) throw new Error("Pre-event run received an event badge");

await db.exec(`select finish_event('${eventId}', 'manual')`);
const snapshot = await db.query<{ payload: Record<string, any> }>(`
  select fetch_event_snapshot('${userId}', 100) as payload
`);
if (
  snapshot.rows[0]?.payload?.event?.status !== "results" ||
  snapshot.rows[0]?.payload?.badges?.length !== 2 ||
  snapshot.rows[0]?.payload?.progress?.totalBadges !== 1 ||
  snapshot.rows[0]?.payload?.winners?.[0]?.userId !== userId
) throw new Error(`Event snapshot failed: ${JSON.stringify(snapshot.rows[0]?.payload)}`);

console.log("Run-badge event migration verified in isolated PostgreSQL.");
await db.close();
