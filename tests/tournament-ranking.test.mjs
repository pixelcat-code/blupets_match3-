import test from "node:test";
import assert from "node:assert/strict";
import { rankTournamentEntries } from "../src/util/tournament-rank.js";
import { replayRun, getReplayResultSummary } from "../src/run-replay.js";
import { NEUTRAL_VIBE } from "../src/vibes.js";

test("ranks by score desc, then fewer moves, then earlier submit", () => {
  const ranked = rankTournamentEntries([
    { userId: "a", score: 100, movesUsed: 20, submittedAt: "2026-07-03T00:00:02Z" },
    { userId: "b", score: 200, movesUsed: 30, submittedAt: "2026-07-03T00:00:03Z" },
    { userId: "c", score: 200, movesUsed: 25, submittedAt: "2026-07-03T00:00:01Z" },
  ]);
  assert.deepEqual(ranked.map((e) => e.userId), ["c", "b", "a"]);
  assert.deepEqual(ranked.map((e) => e.rank), [1, 2, 3]);
});

test("a partial (abandoned) action log yields an honest, incomplete summary", () => {
  // An empty/short action log never reaches victory or gameOver.
  const { state } = replayRun(12345 >>> 0, [{ type: "swap", first: 0, second: 1 }], {
    specialTiles: true, endlessRun: true, vibe: NEUTRAL_VIBE,
  });
  const summary = getReplayResultSummary(state);
  assert.equal(summary.complete, false);
  assert.ok(Number.isInteger(summary.score));
  assert.ok(summary.score >= 0);
});
