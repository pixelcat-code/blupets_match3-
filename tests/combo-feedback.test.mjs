import test from "node:test";
import assert from "node:assert/strict";
import { classifyEvent } from "../src/combo-feedback.js";

function makeStep(groupLengths) {
  return {
    groups: groupLengths.map((len) =>
      Array.from({ length: len }, (_, i) => ({ row: 0, col: i })),
    ),
    boardBeforeClear: null,
    clearedTiles: [],
  };
}

test("classifyEvent: match-3 at stepIndex 0 returns tier 0", () => {
  assert.equal(classifyEvent(makeStep([3]), 0), 0);
});

test("classifyEvent: match-4 at stepIndex 0 returns tier 1", () => {
  assert.equal(classifyEvent(makeStep([4]), 0), 1);
});

test("classifyEvent: match-5 at stepIndex 0 returns tier 2", () => {
  assert.equal(classifyEvent(makeStep([5]), 0), 2);
});

test("classifyEvent: match-7 at stepIndex 0 returns tier 2", () => {
  assert.equal(classifyEvent(makeStep([7]), 0), 2);
});

test("classifyEvent: match-3 at stepIndex 1 (cascade depth 2) returns tier 2", () => {
  assert.equal(classifyEvent(makeStep([3]), 1), 2);
});

test("classifyEvent: match-4 at stepIndex 1 returns tier 2 (cascade dominates)", () => {
  assert.equal(classifyEvent(makeStep([4]), 1), 2);
});

test("classifyEvent: match-5 at stepIndex 1 returns tier 4 (big match + cascade)", () => {
  assert.equal(classifyEvent(makeStep([5]), 1), 4);
});

test("classifyEvent: match-3 at stepIndex 2 (cascade depth 3) returns tier 3", () => {
  assert.equal(classifyEvent(makeStep([3]), 2), 3);
});

test("classifyEvent: match-3 at stepIndex 5 returns tier 3", () => {
  assert.equal(classifyEvent(makeStep([3]), 5), 3);
});

test("classifyEvent: uses longest group when step has multiple groups", () => {
  // groups: [3-match, 5-match] at stepIndex 0 → longest is 5 → tier 2
  const step = {
    groups: [
      Array.from({ length: 3 }, (_, i) => ({ row: 0, col: i })),
      Array.from({ length: 5 }, (_, i) => ({ row: 1, col: i })),
    ],
    boardBeforeClear: null,
    clearedTiles: [],
  };
  assert.equal(classifyEvent(step, 0), 2);
});
