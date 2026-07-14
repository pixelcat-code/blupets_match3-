import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/202607141000_tournament_ready_reliability.sql", import.meta.url);
const readyFunctionUrl = new URL("../supabase/functions/set-tournament-ready/index.ts", import.meta.url);
const startRoomFunctionUrl = new URL("../supabase/functions/start-tournament-room/index.ts", import.meta.url);
const getRoomFunctionUrl = new URL("../supabase/functions/get-tournament-room/index.ts", import.meta.url);
const startRunFunctionUrl = new URL("../supabase/functions/start-tournament-run/index.ts", import.meta.url);
const submitRunFunctionUrl = new URL("../supabase/functions/submit-tournament-run/index.ts", import.meta.url);
const mainUrl = new URL("../src/main.js", import.meta.url);

test("Ready and Start serialize through atomic room-locking RPCs", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /add column if not exists ready_updated_at/i);
  assert.match(migration, /create or replace function public\.set_tournament_ready_state/i);
  assert.match(migration, /create or replace function public\.start_tournament_room_atomic/i);
  assert.ok((migration.match(/for update/gi) ?? []).length >= 3);
  assert.match(migration, /ready_count <> total_count/i);
  assert.match(migration, /to service_role/i);

  const readyFunction = await readFile(readyFunctionUrl, "utf8");
  const startFunction = await readFile(startRoomFunctionUrl, "utf8");
  assert.match(readyFunction, /rpc\("set_tournament_ready_state"/);
  assert.doesNotMatch(readyFunction, /\.update\(\{ ready_at:/);
  assert.match(startFunction, /rpc\("start_tournament_room_atomic"/);
});

test("the client allows only one Ready mutation and never blocks Start on a stale roster", async () => {
  const main = await readFile(mainUrl, "utf8");
  assert.match(main, /tournamentReadyUpdateInFlight/);
  assert.match(main, /app\.tournamentIsHost \|\| tournamentReadyUpdateInFlight/);
  assert.match(main, /tournamentReadyBtn\.disabled = tournamentReadyUpdateInFlight/);
  assert.doesNotMatch(main, /trackTournamentPresence\(next \? "ready"/);
  assert.match(main, /tournamentHostStartBtn\.disabled = app\.tournamentStatus === "starting-room"/);
});

test("opening a tournament room has its own hard auth boundary", async () => {
  const main = await readFile(mainUrl, "utf8");
  const roomOpenStart = main.indexOf("async function openTournamentRoom(code)");
  const roomOpenEnd = main.indexOf("\nfunction ", roomOpenStart);
  const roomOpen = main.slice(roomOpenStart, roomOpenEnd);
  assert.match(roomOpen, /if \(!app\.authState\.user\)/);
  assert.match(roomOpen, /openAuthModal\(\{ force: true \}\)/);
  assert.ok(roomOpen.indexOf("!app.authState.user") < roomOpen.indexOf("getTournamentRoom(normalized)"));
});

test("high-traffic tournament functions avoid project-wide expiry sweeps", async () => {
  const [getRoom, startRun, submitRun] = await Promise.all([
    readFile(getRoomFunctionUrl, "utf8"),
    readFile(startRunFunctionUrl, "utf8"),
    readFile(submitRunFunctionUrl, "utf8"),
  ]);
  assert.doesNotMatch(getRoom, /close_expired_tournament_rooms/);
  assert.doesNotMatch(startRun, /close_expired_tournament_rooms/);
  assert.doesNotMatch(submitRun, /close_expired_tournament_rooms/);
  assert.match(getRoom, /Promise\.all\(\[entriesRequest, playersRequest, runRequest\]\)/);
  assert.match(startRun, /Promise\.all\(\[reservationRequest, existingRunRequest\]\)/);
});
