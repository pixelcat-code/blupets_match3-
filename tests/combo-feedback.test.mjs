import test from "node:test";
import assert from "node:assert/strict";
import { classifyEvent, formatScoreGain } from "../src/combo-feedback.js";

function makeStep(groupLengths) {
  return {
    groups: groupLengths.map((len) =>
      Array.from({ length: len }, (_, i) => ({ row: 0, col: i })),
    ),
    boardBeforeClear: null,
    clearedTiles: [],
  };
}

test("classifyEvent: any initial clear returns tier 0", () => {
  assert.equal(classifyEvent(makeStep([3]), 0), 0);
  assert.equal(classifyEvent(makeStep([4]), 0), 0);
  assert.equal(classifyEvent(makeStep([7]), 0), 0);
});

test("classifyEvent: combo x2 returns tier 1", () => {
  assert.equal(classifyEvent(makeStep([3]), 1), 1);
});

test("classifyEvent: combo x3 returns tier 2", () => {
  assert.equal(classifyEvent(makeStep([3]), 2), 2);
});

test("classifyEvent: combo x4 and x5 return tier 3", () => {
  assert.equal(classifyEvent(makeStep([3]), 3), 3);
  assert.equal(classifyEvent(makeStep([3]), 4), 3);
});

test("classifyEvent: combo x6+ returns tier 4", () => {
  assert.equal(classifyEvent(makeStep([3]), 5), 4);
  assert.equal(classifyEvent(makeStep([5]), 7), 4);
});

test("classifyEvent: group size does not upgrade first-clear text", () => {
  const step = {
    groups: [
      Array.from({ length: 3 }, (_, i) => ({ row: 0, col: i })),
      Array.from({ length: 5 }, (_, i) => ({ row: 1, col: i })),
    ],
    boardBeforeClear: null,
    clearedTiles: [],
  };
  assert.equal(classifyEvent(step, 0), 0);
});

test("formatScoreGain makes the last-move score explicit and ignores empty gains", () => {
  assert.equal(formatScoreGain(7298), "+7,298 points");
  assert.equal(formatScoreGain(0), null);
  assert.equal(formatScoreGain(-50), null);
});
