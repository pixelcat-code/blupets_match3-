import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_BADGES,
  BADGE_THRESHOLDS,
  badgeTierFor,
  isBadgeUnlocked,
  unlockedBadgeCount,
  foldRunMerges,
  getBadgeGalleryByTier,
} from "../src/progress.js";

test("TOTAL_BADGES counts every T2-T4 form in canon (324)", () => {
  assert.equal(TOTAL_BADGES, 324);
});

test("badgeTierFor resolves a form key to its tier", () => {
  assert.equal(badgeTierFor("T2_HEAT_FIRE"), 2);
  assert.equal(badgeTierFor("T4_PYRONIX"), 4);
  assert.equal(badgeTierFor("NOPE"), null);
});

test("foldRunMerges below threshold does not unlock", () => {
  const progress = { badges: {} };
  const result = foldRunMerges(progress, { T2_HEAT_FIRE: BADGE_THRESHOLDS[2] - 1 });
  assert.equal(result.newlyUnlocked.length, 0);
  assert.equal(result.unlockedTotal, 0);
  assert.equal(isBadgeUnlocked(progress, "T2_HEAT_FIRE"), false);
});

test("foldRunMerges at threshold unlocks and reports the badge once", () => {
  const progress = { badges: {} };
  const result = foldRunMerges(progress, { T2_HEAT_FIRE: BADGE_THRESHOLDS[2] });
  assert.equal(result.newlyUnlocked.length, 1);
  assert.equal(result.newlyUnlocked[0].key, "T2_HEAT_FIRE");
  assert.equal(result.unlockedTotal, 1);
  assert.equal(isBadgeUnlocked(progress, "T2_HEAT_FIRE"), true);

  // A second fold on an already-unlocked badge does not re-report it.
  const again = foldRunMerges(progress, { T2_HEAT_FIRE: 5 });
  assert.equal(again.newlyUnlocked.length, 0);
  assert.equal(again.unlockedTotal, 1);
});

test("foldRunMerges accumulates across runs to complete a started badge", () => {
  const progress = { badges: {} };
  const first = foldRunMerges(progress, { T3_HEAT_CINDERFANG: BADGE_THRESHOLDS[3] - 2 });
  assert.equal(first.newlyUnlocked.length, 0);
  const second = foldRunMerges(progress, { T3_HEAT_CINDERFANG: 2 });
  assert.equal(second.newlyUnlocked.length, 1);
  assert.equal(second.newlyUnlocked[0].key, "T3_HEAT_CINDERFANG");
});

test("getBadgeGalleryByTier returns 3 tier groups totaling 324 badges", () => {
  const groups = getBadgeGalleryByTier({ badges: {} });
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((g) => g.tier), [2, 3, 4]);
  assert.equal(groups[0].total, 180);
  assert.equal(groups[1].total, 108);
  assert.equal(groups[2].total, 36);
  assert.equal(groups[0].total + groups[1].total + groups[2].total, 324);
  // T2 families carry 5 cells, T3 carry 3, T4 carry 1; every family appears in every tier.
  assert.equal(groups[0].families[0].cells.length, 5);
  assert.equal(groups[1].families[0].cells.length, 3);
  assert.equal(groups[2].families[0].cells.length, 1);
  for (const g of groups) {
    assert.equal(g.collected, 0);
    assert.equal(g.families.length, 36);
    for (const fam of g.families) {
      assert.equal(fam.apexUnlocked, false);
      assert.ok(fam.apexKey, "apex key must be non-empty for the evo popup");
      for (const c of fam.cells) {
        assert.equal(c.tier, g.tier);
        assert.equal(c.unlocked, false);
        assert.equal(c.threshold, BADGE_THRESHOLDS[g.tier]);
      }
    }
  }
});

test("getBadgeGalleryByTier reflects unlocked badges and per-badge count", () => {
  const progress = { badges: { T2_HEAT_FIRE: BADGE_THRESHOLDS[2], T3_HEAT_CINDERFANG: BADGE_THRESHOLDS[3] - 1 } };
  const groups = getBadgeGalleryByTier(progress);
  const t2 = groups.find((g) => g.tier === 2);
  assert.equal(t2.collected, 1);
  const heatT2 = t2.families.find((f) => f.familyId === "heat");
  assert.ok(heatT2);
  const fire = heatT2.cells.find((c) => c.key === "T2_HEAT_FIRE");
  assert.equal(fire.unlocked, true);
  assert.equal(fire.count, BADGE_THRESHOLDS[2]);
  const t3 = groups.find((g) => g.tier === 3);
  const heatT3 = t3.families.find((f) => f.familyId === "heat");
  const cinder = heatT3.cells.find((c) => c.key === "T3_HEAT_CINDERFANG");
  assert.equal(cinder.unlocked, false);
  assert.equal(cinder.count, BADGE_THRESHOLDS[3] - 1);
});
