import test from "node:test";
import assert from "node:assert/strict";

import {
  compareRankingVectors,
  eventCountdownTarget,
  normalizeEventSnapshot,
  normalizeRankingVector,
  sortEventLeaderboard,
} from "../src/events.js";

test("event ranking compares every rank from highest to lowest", () => {
  assert.ok(compareRankingVectors([3, 8, 1, 0], [3, 7, 99, 99]) > 0);
  assert.ok(compareRankingVectors([2, 99, 99], [3, 0, 0]) < 0);
  assert.equal(compareRankingVectors([3, 7], [3, 7, 0, 0]), 0);
});

test("event leaderboard uses earlier reached time after an identical vector", () => {
  const rows = sortEventLeaderboard([
    { userId: "later", rankingVector: [2, 4, 8], reachedVectorAt: "2026-07-12T11:00:00Z" },
    { userId: "lower", rankingVector: [2, 3, 99], reachedVectorAt: "2026-07-12T09:00:00Z" },
    { userId: "earlier", rankingVector: [2, 4, 8], reachedVectorAt: "2026-07-12T10:00:00Z" },
  ]);
  assert.deepEqual(rows.map((row) => row.userId), ["earlier", "later", "lower"]);
});

test("event vectors discard corrupt and negative counts", () => {
  assert.deepEqual(normalizeRankingVector([4.9, -3, "7", null, "bad"]), [4, 0, 7, 0, 0]);
});

test("event snapshot stays content-agnostic and normalizes dynamic ranks", () => {
  const snapshot = normalizeEventSnapshot({
    event: { id: "event-1", status: "active", endsAt: "2026-07-19T10:00:00Z" },
    badges: [
      { key: "top", rankOrder: 9, weight: "5" },
      { key: "base", rankOrder: 1, weight: 60 },
    ],
    progress: { rankingVector: [1, "12"], totalBadges: "3" },
    leaderboard: [],
    winners: [],
  });
  assert.equal(snapshot.badges.length, 2);
  assert.deepEqual(snapshot.progress.rankingVector, [1, 12]);
  assert.equal(snapshot.progress.totalBadges, 3);
  assert.equal(eventCountdownTarget(snapshot.event), "2026-07-19T10:00:00Z");
});

test("results countdown targets the seven-day results window", () => {
  assert.equal(eventCountdownTarget({
    status: "results",
    endsAt: "2026-07-12T10:00:00Z",
    resultsUntil: "2026-07-19T10:00:00Z",
  }), "2026-07-19T10:00:00Z");
});

test("missing event snapshot remains invisible", () => {
  assert.equal(normalizeEventSnapshot(null), null);
  assert.equal(normalizeEventSnapshot({ event: null }), null);
});
