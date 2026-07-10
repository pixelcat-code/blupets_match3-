import test from "node:test";
import assert from "node:assert/strict";
import {
  isTournamentEnded,
  tournamentAttemptExpiresAt,
  tournamentEndMs,
} from "../src/util/tournament-deadline.js";

test("tournament deadline rejects absent and elapsed end times", () => {
  const now = Date.parse("2026-07-10T12:00:00Z");
  assert.equal(tournamentEndMs("not-a-date"), null);
  assert.equal(isTournamentEnded(null, now), true);
  assert.equal(isTournamentEnded("2026-07-10T11:59:59Z", now), true);
  assert.equal(isTournamentEnded("2026-07-10T12:00:01Z", now), false);
});

test("a tournament attempt never extends beyond the room deadline", () => {
  const start = Date.parse("2026-07-10T12:00:00Z");
  const roomEnd = Date.parse("2026-07-10T12:10:00Z");
  assert.equal(tournamentAttemptExpiresAt(start, 30 * 60_000, roomEnd), roomEnd);
  assert.equal(tournamentAttemptExpiresAt(start, 5 * 60_000, roomEnd), start + 5 * 60_000);
});
