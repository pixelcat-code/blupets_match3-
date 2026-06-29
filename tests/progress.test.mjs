import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_FAMILIES,
  TOTAL_APEX_FORMS,
  TOTAL_INVENTORY_FORMS,
  COLLECTION_TILES,
  CAPSULE_PITY,
  SHARDS_PER_CAPSULE,
  capsulesForScore,
  exchangeShardsForCapsules,
  BADGE_TIERS,
  MILESTONE_BADGES,
  foldRun,
  openCapsule,
  loadProgress,
  saveProgress,
  setProgressUser,
  lineageStageLevel,
  ascendedLineageCount,
  collectionTileCount,
  getMilestoneBadges,
  getSaraiHeartQuest,
  recordSaraiHeartMatches,
  SARAI_HEART_QUEST_REWARD,
  SARAI_HEART_QUEST_TARGET,
} from "../src/progress.js";
import { BLUPETS_FAMILIES } from "../src/blupets-canon-data.js";

function freshCounters() {
  return {
    lifetimeScore: 0,
    runs: 0,
    bombsTotal: 0,
    crossTotal: 0,
    combo2Runs: 0,
    combo3Runs: 0,
    combo4Runs: 0,
    tileClears: {
      red: 0,
      blue: 0,
      green: 0,
      yellow: 0,
      purple: 0,
      cyan: 0,
      white: 0,
      black: 0,
    },
  };
}

// A fresh progress record as produced by loadProgress() for a new player.
function freshProgress() {
  return {
    forms: {},
    collectionTiles: {},
    inventoryForms: {},
    evoBadges: {},
    capsules: 0,
    shards: 0,
    capsuleStats: { opened: 0, noNew: 0, noAdvancedPlus: 0, noAscended: 0 },
    milestones: { counters: freshCounters(), unlocked: {} },
    saraiHeartQuest: { matches: 0, completed: false, rewarded: false },
    runs: 0,
    wins: 0,
    bestScore: 0,
    fewestMovesWin: null,
  };
}

// Minimal run context. Override fields per test.
function runCtx(over = {}) {
  return { score: 0, reachedForms: [], maxCombo: 1, specials: { cross: 0, bomb: 0 }, tileClears: {}, ...over };
}

function withMockStorage(fn) {
  const original = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
  try {
    return fn(store);
  } finally {
    if (original === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = original;
    }
    setProgressUser(null);
  }
}

test("canon shape: 36 families, 36 apex forms", () => {
  assert.equal(TOTAL_FAMILIES, 36);
  assert.equal(TOTAL_APEX_FORMS, 36);
  assert.equal(TOTAL_INVENTORY_FORMS, 324);
  assert.equal(COLLECTION_TILES.length, 324);
  assert.equal(COLLECTION_TILES.filter((tile) => tile.tier === "base").length, 180);
  assert.equal(COLLECTION_TILES.filter((tile) => tile.tier === "advanced").length, 108);
  assert.equal(COLLECTION_TILES.filter((tile) => tile.tier === "ascended").length, 36);
});

test("loadProgress and saveProgress persist guest and user-scoped records", () => withMockStorage(() => {
  // Guests: save is a no-op, load always returns empty (no persistence)
  setProgressUser(null);
  const guest = loadProgress();
  guest.capsules = 3;
  saveProgress(guest); // no-op for guests
  assert.equal(loadProgress().capsules, 0); // always fresh for guests

  // Logged-in users: fully persisted under their user key
  setProgressUser("user-a");
  assert.equal(loadProgress().capsules, 0);
  const user = loadProgress();
  user.shards = 7;
  saveProgress(user);
  assert.equal(loadProgress().shards, 7);

  // Back to guest: still empty (guest state is never persisted)
  setProgressUser(null);
  assert.equal(loadProgress().capsules, 0);
}));

test("Sarai Heart Quest awards eleven capsules once", () => {
  const p = freshProgress();
  const first = recordSaraiHeartMatches(p, SARAI_HEART_QUEST_TARGET - 1);
  assert.equal(first.completedNow, false);
  assert.equal(first.reward, 0);
  assert.equal(getSaraiHeartQuest(p).matches, SARAI_HEART_QUEST_TARGET - 1);
  assert.equal(p.capsules, 0);

  const complete = recordSaraiHeartMatches(p, 1);
  assert.equal(complete.completedNow, true);
  assert.equal(complete.reward, SARAI_HEART_QUEST_REWARD);
  assert.equal(p.capsules, SARAI_HEART_QUEST_REWARD);

  const again = recordSaraiHeartMatches(p, 3);
  assert.equal(again.matched, 0);
  assert.equal(again.reward, 0);
  assert.equal(p.capsules, SARAI_HEART_QUEST_REWARD);
});

test("evolution progress records the deepest stage reached per lineage", () => {
  const p = freshProgress();
  // Reach Advanced in HEAT (apex T4_PYRONIX).
  foldRun(p, runCtx({ reachedForms: [{ key: "T3_HEAT_CINDERFANG", tier: 3 }] }));
  assert.equal(lineageStageLevel(p, "T4_PYRONIX"), 3);

  // A later run that only reaches T2 must NOT lower the recorded level.
  foldRun(p, runCtx({ reachedForms: [{ key: "T2_HEAT_FIRE", tier: 2 }] }));
  assert.equal(lineageStageLevel(p, "T4_PYRONIX"), 3);

  // Reaching Ascended raises it to T4.
  foldRun(p, runCtx({ reachedForms: [{ key: "T4_PYRONIX", tier: 4 }] }));
  assert.equal(lineageStageLevel(p, "T4_PYRONIX"), 4);
});

test("a lineage stage-up is reported as a new badge once", () => {
  const p = freshProgress();
  const first = foldRun(p, runCtx({ reachedForms: [{ key: "T2_HEAT_FIRE", tier: 2 }] }));
  assert.equal(first.newBadges.filter((b) => b.kind === "evolution").length, 1);

  // Same level again → not re-reported.
  const again = foldRun(p, runCtx({ reachedForms: [{ key: "T2_HEAT_FIRE", tier: 2 }] }));
  assert.equal(again.newBadges.filter((b) => b.kind === "evolution").length, 0);
});

test("foldRun records run forms without adding them to capsule collection", () => {
  const p = freshProgress();
  const r = foldRun(p, runCtx({
    reachedForms: [
      { key: "T2_HEAT_FIRE", tier: 2 },
      { key: "T3_HEAT_CINDERFANG", tier: 3 },
      { key: "T4_PYRONIX", tier: 4 },
    ],
  }));

  assert.equal(p.inventoryForms.T2_HEAT_FIRE, true);
  assert.equal(p.inventoryForms.T3_HEAT_CINDERFANG, true);
  assert.equal(p.inventoryForms.T4_PYRONIX, true);
  assert.equal(collectionTileCount(p), 0);
  assert.equal(p.milestones.unlocked.inventory_form_1, undefined);
  assert.equal(r.newBadges.some((b) => b.id === "inventory_form_1"), false);
});

test("inventory form quests read only capsule collection forms", () => {
  const p = freshProgress();
  const firstNine = [];
  for (const family of BLUPETS_FAMILIES) {
    for (const tier of [2, 3, 4]) {
      for (const form of family.forms[tier] ?? []) {
        firstNine.push({ key: form.key, tier });
        if (firstNine.length >= 9) break;
      }
      if (firstNine.length >= 9) break;
    }
    if (firstNine.length >= 9) break;
  }

  foldRun(p, runCtx({ reachedForms: firstNine }));
  assert.equal(Object.keys(p.inventoryForms).length, 9);
  assert.equal(collectionTileCount(p), 0);
  assert.equal(p.milestones.unlocked.inventory_forms_9, undefined);
});

test("capsulesForScore uses the agreed non-cumulative score thresholds", () => {
  assert.equal(capsulesForScore(2999), 0);
  assert.equal(capsulesForScore(3000), 1);
  assert.equal(capsulesForScore(5999), 1);
  assert.equal(capsulesForScore(6000), 2);
  assert.equal(capsulesForScore(12000), 3);
  assert.equal(capsulesForScore(21000), 4);
  assert.equal(capsulesForScore(30000), 5);
  assert.equal(capsulesForScore(45000), 7);
  assert.equal(capsulesForScore(60000), 10);
});

test("foldRun awards score capsules plus one-time milestone capsule rewards", () => {
  const p = freshProgress();
  const r = foldRun(p, runCtx({ score: 5000 }));
  assert.equal(r.capsulesEarned, 1);
  // First Run + 5,000 in a run are common milestone rewards (+1 each), plus
  // the score reward itself (+1).
  assert.equal(p.capsules, 3);

  const again = foldRun(p, runCtx({ score: 5000 }));
  assert.equal(again.capsulesEarned, 1);
  assert.equal(p.capsules, 4);
});

test("openCapsule unlocks collection tiles and duplicates become shards", () => {
  const p = freshProgress();
  p.capsules = 2;
  const baseTile = COLLECTION_TILES.find((tile) => tile.tier === "base");

  const first = openCapsule(p, () => 0);
  assert.equal(first.opened, true);
  assert.equal(first.tier, "base");
  assert.equal(first.duplicate, false);
  assert.equal(p.collectionTiles[baseTile.key], true);
  assert.equal(p.inventoryForms[baseTile.key], true);

  const duplicate = openCapsule(p, () => 0);
  assert.equal(duplicate.opened, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.shards, 1);
  assert.equal(p.shards, 1);
});

test("shards exchange back into capsules", () => {
  const p = freshProgress();
  p.shards = SHARDS_PER_CAPSULE * 2 + 7;
  const exchanged = exchangeShardsForCapsules(p, 1);
  assert.deepEqual(exchanged, { capsules: 1, shardsSpent: SHARDS_PER_CAPSULE });
  assert.equal(p.capsules, 1);
  assert.equal(p.shards, SHARDS_PER_CAPSULE + 7);
});

test("capsule pity: too many duplicate openings forces a new tile", () => {
  const p = freshProgress();
  p.capsules = 1;
  p.capsuleStats.noNew = CAPSULE_PITY.noNew;
  const firstBase = COLLECTION_TILES.find((tile) => tile.tier === "base");
  p.collectionTiles[firstBase.key] = true;

  const result = openCapsule(p, () => 0);
  assert.equal(result.opened, true);
  assert.equal(result.forced, "new");
  assert.equal(result.duplicate, false);
  assert.notEqual(result.tile.key, firstBase.key);
  assert.equal(p.capsuleStats.noNew, 0);
});

test("capsule pity: too long without Advanced+ forces Advanced or Ascended", () => {
  const p = freshProgress();
  p.capsules = 1;
  p.capsuleStats.noAdvancedPlus = CAPSULE_PITY.noAdvancedPlus;

  const result = openCapsule(p, () => 0);
  assert.equal(result.opened, true);
  assert.equal(result.forced, "advancedPlus");
  assert.equal(["advanced", "ascended"].includes(result.tier), true);
  assert.equal(p.capsuleStats.noAdvancedPlus, 0);
});

test("capsule pity: too long without Ascended forces Ascended", () => {
  const p = freshProgress();
  p.capsules = 1;
  p.capsuleStats.noAscended = CAPSULE_PITY.noAscended;

  const result = openCapsule(p, () => 0);
  assert.equal(result.opened, true);
  assert.equal(result.forced, "ascended");
  assert.equal(result.tier, "ascended");
  assert.equal(p.capsuleStats.noAscended, 0);
});

test("lineageStageLevel is 0 for an untouched / unknown lineage", () => {
  const p = freshProgress();
  assert.equal(lineageStageLevel(p, "T4_PYRONIX"), 0);
  assert.equal(lineageStageLevel(p, "NOPE"), 0);
});

test("ascendedLineageCount tracks run lineage, but collection quests use capsule drops", () => {
  const p = freshProgress();
  const apexKeysInOrder = BLUPETS_FAMILIES.map((f) => f.forms["4"][0].key);

  // Drive the first 8 lineages to Ascended — ascended_9 not yet unlocked.
  for (let i = 0; i < 8; i++) {
    foldRun(p, runCtx({ reachedForms: [{ key: apexKeysInOrder[i], tier: 4 }] }));
  }
  assert.equal(ascendedLineageCount(p), 8);
  assert.equal(p.milestones.unlocked.ascended_9, undefined);

  // The 9th Ascended reached in gameplay updates lineage history only.
  const r = foldRun(p, runCtx({ reachedForms: [{ key: apexKeysInOrder[8], tier: 4 }] }));
  assert.equal(ascendedLineageCount(p), 9);
  assert.equal(p.milestones.unlocked.ascended_9, undefined);
  assert.equal(r.newBadges.some((b) => b.kind === "milestone" && b.id === "ascended_9"), false);

  for (const key of apexKeysInOrder.slice(0, 9)) {
    p.collectionTiles[key] = true;
  }
  const afterCapsules = foldRun(p, runCtx({ score: 0 }));
  assert.equal(p.milestones.unlocked.ascended_9, true);
  assert.ok(afterCapsules.newBadges.some((b) => b.kind === "milestone" && b.id === "ascended_9"));
});

test("run-score milestone unlocks at its threshold and reports new once", () => {
  const p = freshProgress();
  const r1 = foldRun(p, runCtx({ score: 5000 }));
  assert.equal(p.milestones.unlocked.score_5k, true);
  assert.ok(r1.newBadges.some((b) => b.id === "score_5k"));
  // 10k not reached yet.
  assert.equal(p.milestones.unlocked.score_10k, undefined);

  // Re-crossing 5k in a later run does not re-report it.
  const r2 = foldRun(p, runCtx({ score: 6000 }));
  assert.equal(r2.newBadges.some((b) => b.id === "score_5k"), false);
});

test("combo and specials milestones use per-run signals", () => {
  const p = freshProgress();
  const r = foldRun(p, runCtx({ maxCombo: 4, specials: { cross: 1, bomb: 1 } }));
  assert.equal(p.milestones.unlocked.combo_2, true);
  assert.equal(p.milestones.unlocked.combo_3, true);
  assert.equal(p.milestones.unlocked.combo_4, true);
  assert.equal(p.milestones.unlocked.first_cross, true);
  assert.equal(p.milestones.unlocked.first_bomb, true);
  assert.equal(p.milestones.unlocked.bomb_10, undefined); // bombsTotal is 1
  assert.ok(r.newBadges.some((b) => b.id === "first_cross"));
});

test("lifetime counters accumulate across folds (runs, specials, lifetimeScore)", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ score: 1000, maxCombo: 4, specials: { cross: 4, bomb: 3 } }));
  foldRun(p, runCtx({ score: 2000, maxCombo: 2, specials: { cross: 6, bomb: 2 } }));
  assert.equal(p.milestones.counters.runs, 2);
  assert.equal(p.milestones.counters.bombsTotal, 5);
  assert.equal(p.milestones.counters.crossTotal, 10);
  assert.equal(p.milestones.counters.combo2Runs, 2);
  assert.equal(p.milestones.counters.combo3Runs, 1);
  assert.equal(p.milestones.counters.combo4Runs, 1);
  assert.equal(p.milestones.counters.lifetimeScore, 3000);
});

test("250-bomb milestone unlocks once lifetime bombs cross 250", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ specials: { cross: 0, bomb: 240 } }));
  assert.equal(p.milestones.unlocked.bomb_250, undefined);
  const r = foldRun(p, runCtx({ specials: { cross: 0, bomb: 10 } }));
  assert.equal(p.milestones.unlocked.bomb_250, true);
  assert.ok(r.newBadges.some((b) => b.id === "bomb_250"));
});

test("tile mastery badges use lifetime color clear counters", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ tileClears: { red: 249, blue: 1000 } }));
  assert.equal(p.milestones.unlocked.color_red_adept, undefined);
  assert.equal(p.milestones.unlocked.color_blue_specialist, true);

  const r = foldRun(p, runCtx({ tileClears: { red: 1 } }));
  assert.equal(p.milestones.unlocked.color_red_adept, true);
  assert.equal(p.milestones.counters.tileClears.red, 250);
  assert.ok(r.newBadges.some((b) => b.id === "color_red_adept"));
});

test("getMilestoneBadges reflects unlocked state and gives counter hints", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ score: 0 })); // runs = 1
  const list = getMilestoneBadges(p);
  const runs5 = list.find((b) => b.id === "runs_5");
  assert.equal(runs5.unlocked, false);
  assert.equal(runs5.hint, "1/5");
  const score50k = list.find((b) => b.id === "score_50k");
  assert.equal(score50k.hint, null); // per-run best is not stored → no hint
  assert.equal(list.length, MILESTONE_BADGES.length);
});

test("MILESTONE_BADGES catalog has 70 badges in a descending tier pyramid", () => {
  assert.equal(MILESTONE_BADGES.length, 70);
  assert.deepEqual(
    Object.fromEntries(BADGE_TIERS.map((tier) => [tier, MILESTONE_BADGES.filter((b) => b.tier === tier).length])),
    { common: 24, uncommon: 18, rare: 14, epic: 9, legendary: 5 },
  );
  const cats = new Set(MILESTONE_BADGES.map((m) => m.category));
  assert.ok(["collection", "color", "score", "combo", "special", "endurance"].every((c) => cats.has(c)));
});

test("foldRun: partially-migrated record with milestones:{} does not throw", () => {
  // Simulates a record where milestones is present but counters/unlocked are missing
  // (bypassed loadProgress/normalizeProgress — the latent crash scenario).
  const p = {
    forms: {},
    inventoryForms: {},
    evoBadges: {},
    milestones: {}, // no counters, no unlocked
    runs: 0,
    wins: 0,
    bestScore: 0,
    fewestMovesWin: null,
  };
  assert.doesNotThrow(() =>
    foldRun(p, { score: 1000, reachedForms: [], maxCombo: 1, specials: { cross: 0, bomb: 0 } })
  );
  assert.equal(p.milestones.counters.lifetimeScore, 1000);
  assert.equal(p.milestones.counters.runs, 1);
  assert.equal(p.milestones.counters.crossTotal, 0);
  assert.equal(p.milestones.counters.tileClears.red, 0);
});
