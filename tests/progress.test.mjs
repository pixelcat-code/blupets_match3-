import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_FAMILIES,
  TOTAL_APEX_FORMS,
  MILESTONE_BADGES,
  MENAGERIE_MILESTONES,
  foldRun,
  familyBadgeLevel,
  goldFamilyCount,
  getMilestoneBadges,
} from "../src/progress.js";
import { BLUPETS_FAMILIES } from "../src/blupets-canon-data.js";

// A fresh progress record as produced by loadProgress() for a new player.
function freshProgress() {
  return {
    forms: {},
    evoBadges: {},
    milestones: { counters: { lifetimeScore: 0, runs: 0, bombsTotal: 0 }, unlocked: {} },
    runs: 0,
    wins: 0,
    bestScore: 0,
    fewestMovesWin: null,
  };
}

// Minimal run context. Override fields per test.
function runCtx(over = {}) {
  return { score: 0, reachedForms: [], maxCombo: 1, specials: { cross: 0, bomb: 0 }, ...over };
}

test("canon shape: 36 families, 36 apex forms", () => {
  assert.equal(TOTAL_FAMILIES, 36);
  assert.equal(TOTAL_APEX_FORMS, 36);
});

test("evolution badge records the deepest tier reached per family", () => {
  const p = freshProgress();
  // Reach T3 in HEAT (apex T4_PYRONIX). T3 form key carries the family.
  foldRun(p, runCtx({ reachedForms: [{ key: "T3_HEAT_CINDERFANG", tier: 3 }] }));
  assert.equal(familyBadgeLevel(p, "T4_PYRONIX"), 3); // silver

  // A later run that only reaches T2 must NOT lower the recorded level.
  foldRun(p, runCtx({ reachedForms: [{ key: "T2_HEAT_FIRE", tier: 2 }] }));
  assert.equal(familyBadgeLevel(p, "T4_PYRONIX"), 3);

  // Reaching T4 raises it to gold.
  foldRun(p, runCtx({ reachedForms: [{ key: "T4_PYRONIX", tier: 4 }] }));
  assert.equal(familyBadgeLevel(p, "T4_PYRONIX"), 4);
});

test("a leveling family is reported as a new badge once", () => {
  const p = freshProgress();
  const first = foldRun(p, runCtx({ reachedForms: [{ key: "T2_HEAT_FIRE", tier: 2 }] }));
  assert.equal(first.newBadges.filter((b) => b.kind === "evolution").length, 1);

  // Same level again → not re-reported.
  const again = foldRun(p, runCtx({ reachedForms: [{ key: "T2_HEAT_FIRE", tier: 2 }] }));
  assert.equal(again.newBadges.filter((b) => b.kind === "evolution").length, 0);
});

test("familyBadgeLevel is 0 for an untouched / unknown family", () => {
  const p = freshProgress();
  assert.equal(familyBadgeLevel(p, "T4_PYRONIX"), 0);
  assert.equal(familyBadgeLevel(p, "NOPE"), 0);
});

test("goldFamilyCount counts T4 families; menagerie unlocks at 9/18/27/36", () => {
  const p = freshProgress();
  const apexKeysInOrder = BLUPETS_FAMILIES.map((f) => f.forms["4"][0].key);

  // Drive the first 8 families to gold — menagerie 9 not yet unlocked.
  for (let i = 0; i < 8; i++) {
    foldRun(p, runCtx({ reachedForms: [{ key: apexKeysInOrder[i], tier: 4 }] }));
  }
  assert.equal(goldFamilyCount(p), 8);
  assert.equal(p.milestones.unlocked.menagerie_9, undefined);

  // The 9th gold unlocks menagerie_9 and reports it new this run.
  const r = foldRun(p, runCtx({ reachedForms: [{ key: apexKeysInOrder[8], tier: 4 }] }));
  assert.equal(goldFamilyCount(p), 9);
  assert.equal(p.milestones.unlocked.menagerie_9, true);
  assert.ok(r.newBadges.some((b) => b.kind === "menagerie" && b.id === "menagerie_9"));
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
  assert.equal(p.milestones.unlocked.bombs_25, undefined); // bombsTotal is 1
  assert.ok(r.newBadges.some((b) => b.id === "first_cross"));
});

test("lifetime counters accumulate across folds (runs, bombs, lifetimeScore)", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ score: 1000, specials: { cross: 0, bomb: 3 } }));
  foldRun(p, runCtx({ score: 2000, specials: { cross: 0, bomb: 2 } }));
  assert.equal(p.milestones.counters.runs, 2);
  assert.equal(p.milestones.counters.bombsTotal, 5);
  assert.equal(p.milestones.counters.lifetimeScore, 3000);
});

test("25-bomb milestone unlocks once lifetime bombs cross 25", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ specials: { cross: 0, bomb: 20 } }));
  assert.equal(p.milestones.unlocked.bombs_25, undefined);
  const r = foldRun(p, runCtx({ specials: { cross: 0, bomb: 6 } }));
  assert.equal(p.milestones.unlocked.bombs_25, true);
  assert.ok(r.newBadges.some((b) => b.id === "bombs_25"));
});

test("getMilestoneBadges reflects unlocked state and gives counter hints", () => {
  const p = freshProgress();
  foldRun(p, runCtx({ score: 0 })); // runs = 1
  const list = getMilestoneBadges(p);
  const runs10 = list.find((b) => b.id === "runs_10");
  assert.equal(runs10.unlocked, false);
  assert.equal(runs10.hint, "1/10");
  const score50k = list.find((b) => b.id === "score_50k");
  assert.equal(score50k.hint, null); // per-run best is not stored → no hint
  assert.equal(list.length, MILESTONE_BADGES.length + MENAGERIE_MILESTONES.length);
});

test("MILESTONE_BADGES catalog covers all four categories", () => {
  const cats = new Set(MILESTONE_BADGES.map((m) => m.category));
  assert.ok(["score", "combo", "special", "endurance"].every((c) => cats.has(c)));
});

test("foldRun: partially-migrated record with milestones:{} does not throw", () => {
  // Simulates a record where milestones is present but counters/unlocked are missing
  // (bypassed loadProgress/normalizeProgress — the latent crash scenario).
  const p = {
    forms: {},
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
});
