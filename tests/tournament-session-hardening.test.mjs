import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("abandoned lobbies expire and the durable roster keeps public identity", async () => {
  const [migration, createRoom, getRoom] = await Promise.all([
    file("supabase/migrations/202607141130_tournament_session_hardening.sql"),
    file("supabase/functions/create-tournament-room/index.ts"),
    file("supabase/functions/get-tournament-room/index.ts"),
  ]);
  assert.match(migration, /lobby_expires_at[\s\S]*interval '6 hours'/i);
  assert.match(migration, /status = 'lobby'[\s\S]*lobby_expires_at <= clock_timestamp\(\)/i);
  assert.match(migration, /account_name text not null default 'Player'/i);
  assert.match(migration, /avatar_url text/i);
  assert.match(createRoom, /lobby_expires_at/);
  assert.match(getRoom, /account_name: labelForUser/);
  assert.match(getRoom, /accountName: player\.account_name/);
});

test("one tournament attempt is leased to one client session", async () => {
  const [migration, startRun, saveDraft, submitRun, sync] = await Promise.all([
    file("supabase/migrations/202607141130_tournament_session_hardening.sql"),
    file("supabase/functions/start-tournament-run/index.ts"),
    file("supabase/functions/save-tournament-draft/index.ts"),
    file("supabase/functions/submit-tournament-run/index.ts"),
    file("src/sync.js"),
  ]);
  assert.match(migration, /client_session_id uuid/i);
  assert.match(migration, /client_session_seen_at timestamptz/i);
  assert.match(startRun, /SESSION_LEASE_MS = 120_000/);
  assert.match(startRun, /attempt_active_elsewhere/);
  assert.match(startRun, /client_session_seen_at: startedAt/);
  assert.match(saveDraft, /run\.client_session_id !== clientSessionId/);
  assert.match(submitRun, /run\.client_session_id !== clientSessionId/);
  assert.ok((sync.match(/clientSessionId/g) ?? []).length >= 6);
  const main = await file("src/main.js");
  assert.match(main, /new BroadcastChannel\("blupets-tournament-session-v1"\)/);
  assert.match(main, /data\.type === "present"[\s\S]*createTournamentClientSessionId\(\)/);
});

test("room requests, realtime subscriptions, and host Start discard stale concurrent work", async () => {
  const [main, sync] = await Promise.all([file("src/main.js"), file("src/sync.js")]);
  assert.match(main, /const openGeneration = \+\+tournamentRoomOpenGeneration/);
  assert.ok((main.match(/openGeneration !== tournamentRoomOpenGeneration/g) ?? []).length >= 3);
  assert.match(main, /app\.tournamentStatus === "starting-room"/);
  assert.match(main, /error\.message === "already_started"[\s\S]*refreshTournamentLeaderboard/);
  assert.match(sync, /_tournamentChannelGeneration/);
  assert.match(sync, /tournament_realtime_superseded/);
});

test("all participants receive result inserts and foregrounding forces a snapshot", async () => {
  const main = await file("src/main.js");
  assert.match(main, /onLeaderboardInsert: applyTournamentLeaderboardInsert/);
  assert.doesNotMatch(main, /onLeaderboardInsert: app\.tournamentIsHost/);
  assert.match(main, /visibilitychange[\s\S]*refreshTournamentLeaderboard\(\)/);
});

test("a saved result is committed in UI before the optional standings refresh", async () => {
  const main = await file("src/main.js");
  const submitStart = main.indexOf("function submitTournamentResult");
  const submitEnd = main.indexOf("\nlet _tournamentAbandonSent", submitStart);
  const submit = main.slice(submitStart, submitEnd);
  assert.match(submit, /clearTournamentRecovery\(proof\);[\s\S]*markTournamentSubmissionAccepted/);
  assert.match(submit, /score saved; standings refresh deferred/);
  assert.ok(submit.indexOf("markTournamentSubmissionAccepted") < submit.indexOf("getTournamentRoom(code)"));
});

test("tournament countdowns use server time instead of raw device time", async () => {
  const [main, getRoom, startRun, migration] = await Promise.all([
    file("src/main.js"),
    file("supabase/functions/get-tournament-room/index.ts"),
    file("supabase/functions/start-tournament-run/index.ts"),
    file("supabase/migrations/202607141130_tournament_session_hardening.sql"),
  ]);
  assert.match(main, /function tournamentNow\(\)/);
  assert.match(main, /formatTimeLeft[\s\S]*tournamentNow\(\)/);
  assert.match(getRoom, /serverNow/);
  assert.ok((startRun.match(/serverNow/g) ?? []).length >= 2);
  assert.match(migration, /'serverNow', statement_timestamp\(\)/);
});
