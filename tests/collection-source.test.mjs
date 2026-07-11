import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicCollectionSnapshot } from "../src/util/collection-source.js";

test("canonical collection keys are the public count even when an entry count is stale", () => {
  const result = buildPublicCollectionSnapshot({
    storedCollectionTiles: { A: true, B: true },
    entryCount: 99,
  });
  assert.equal(result.count, 2);
  assert.deepEqual(result.tiles, { A: true, B: true });
});

test("an explicitly empty canonical collection does not resurrect legacy run forms", () => {
  const result = buildPublicCollectionSnapshot({
    storedCollectionTiles: {},
    fallbackFormKeys: ["T4_WON_IN_RUN"],
    entryCount: 1,
  });
  assert.equal(result.count, 0);
  assert.deepEqual(result.tiles, {});
});

test("owner cache may add opened tiles but never unrelated run forms", () => {
  const result = buildPublicCollectionSnapshot({
    storedCollectionTiles: { A: true },
    localCollectionTiles: { B: true },
  });
  assert.equal(result.count, 2);
  assert.deepEqual(result.tiles, { A: true, B: true });
});
