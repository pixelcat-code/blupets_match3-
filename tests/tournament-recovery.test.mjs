import test from "node:test";
import assert from "node:assert/strict";
import {
  TOURNAMENT_RECOVERY_LEGACY_KEY,
  TOURNAMENT_RECOVERY_STORE_KEY,
  getTournamentRecovery,
  putTournamentRecovery,
  readTournamentRecoveries,
  removeTournamentRecovery,
} from "../src/util/tournament-recovery.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function recovery(runId, userId, code, savedAt) {
  return { version: 1, runId, userId, code, savedAt, actions: [] };
}

test("multiple tournament recoveries coexist and are selected by user and room", () => {
  const storage = memoryStorage();
  putTournamentRecovery(storage, recovery("run-a", "user-a", "ROOMA", 100), 100);
  putTournamentRecovery(storage, recovery("run-b", "user-a", "ROOMB", 200), 200);
  putTournamentRecovery(storage, recovery("run-c", "user-b", "ROOMA", 300), 300);

  assert.equal(readTournamentRecoveries(storage, 300).length, 3);
  assert.equal(getTournamentRecovery(storage, { userId: "user-a", code: "ROOMA", now: 300 })?.runId, "run-a");
  assert.equal(getTournamentRecovery(storage, { userId: "user-a", now: 300 })?.runId, "run-b");
});

test("legacy recovery migrates without deleting unrelated attempts", () => {
  const legacy = recovery("legacy", "user-a", "OLDROOM", 100);
  const storage = memoryStorage({ [TOURNAMENT_RECOVERY_LEGACY_KEY]: JSON.stringify(legacy) });
  putTournamentRecovery(storage, recovery("fresh", "user-a", "NEWROOM", 200), 200);

  const stored = JSON.parse(storage.getItem(TOURNAMENT_RECOVERY_STORE_KEY));
  assert.deepEqual(stored.records.map((item) => item.runId), ["fresh", "legacy"]);
  assert.equal(storage.getItem(TOURNAMENT_RECOVERY_LEGACY_KEY), null);
});

test("clearing one submitted run preserves other recoveries", () => {
  const storage = memoryStorage();
  putTournamentRecovery(storage, recovery("run-a", "user-a", "ROOMA", 100), 100);
  putTournamentRecovery(storage, recovery("run-b", "user-a", "ROOMB", 200), 200);

  assert.equal(removeTournamentRecovery(storage, { runId: "run-a" }, 200), true);
  assert.equal(getTournamentRecovery(storage, { runId: "run-a", now: 200 }), null);
  assert.equal(getTournamentRecovery(storage, { runId: "run-b", now: 200 })?.code, "ROOMB");
});
