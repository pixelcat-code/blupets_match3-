import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/202607121600_run_event_badges.sql", import.meta.url);
const submitUrl = new URL("../supabase/functions/submit-run/index.ts", import.meta.url);
const guestSubmitUrl = new URL("../supabase/functions/submit-guest-run/index.ts", import.meta.url);
const tournamentSubmitUrl = new URL("../supabase/functions/submit-tournament-run/index.ts", import.meta.url);

test("final event schema removes every capsule-event table and RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "event_drops", "event_open_requests", "capsule_event_lots", "player_event_progress",
    "event_item_definitions", "capsule_open_requests", "capsule_exchange_requests",
    "capsule_grants", "capsule_wallets", "capsule_system_settings",
  ]) assert.match(sql, new RegExp(`drop table if exists public\\.${table}`));
  assert.match(sql, /drop function if exists public\.open_event_capsules/);
  assert.match(sql, /drop function if exists public\.grant_event_capsules/);
});

test("one normal verified run has one idempotent badge award", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table public\.event_run_badge_awards/);
  assert.match(sql, /unique \(run_id\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /from game_runs run[\s\S]*run\.submitted_at is not null/);
  assert.match(sql, /select \* into existing_award[\s\S]*'idempotent', true/);
});

test("badge randomness and mutation remain service-role only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const source = await readFile(submitUrl, "utf8");
  assert.match(source, /crypto\.getRandomValues/);
  assert.match(source, /award_event_badge_for_run/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(sql, /revoke all on function public\.award_event_badge_for_run[\s\S]*authenticated/);
  assert.match(sql, /grant execute on function public\.award_event_badge_for_run[\s\S]*service_role/);
});

test("guest and tournament submit paths cannot award event badges", async () => {
  for (const source of await Promise.all([
    readFile(guestSubmitUrl, "utf8"),
    readFile(tournamentSubmitUrl, "utf8"),
  ])) {
    assert.doesNotMatch(source, /award_event_badge_for_run|event_run_badge_awards/);
  }
});

test("event leaderboard stays lexicographic with earlier-time tie break", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ranking_vector desc, progress\.reached_vector_at asc/);
  assert.match(sql, /results_until = now_at \+ interval '7 days'/);
  assert.match(sql, /perform capture_event_winners\(transitioned_event_id\)/);
});
