import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_BADGES,
  BADGE_THRESHOLDS,
  badgeTierFor,
  isBadgeUnlocked,
  unlockedBadgeCount,
  foldRunMerges,
  badgeProgressFor,
  familyBadgeProgress,
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

test("badgeProgressFor reports unlocked status at threshold", () => {
  const progress = { badges: { T2_HEAT_FIRE: BADGE_THRESHOLDS[2] } };
  const p = badgeProgressFor(progress, "T2_HEAT_FIRE");
  assert.equal(p.unlocked, true);
  assert.equal(p.count, BADGE_THRESHOLDS[2]);
  assert.equal(p.threshold, BADGE_THRESHOLDS[2]);
});

test("badgeProgressFor reports count below threshold as still locked", () => {
  const progress = { badges: { T3_HEAT_CINDERFANG: BADGE_THRESHOLDS[3] - 1 } };
  const p = badgeProgressFor(progress, "T3_HEAT_CINDERFANG");
  assert.equal(p.unlocked, false);
  assert.equal(p.count, BADGE_THRESHOLDS[3] - 1);
  assert.equal(p.threshold, BADGE_THRESHOLDS[3]);
});

test("badgeProgressFor returns null threshold for a non-badge key", () => {
  // A T1 family/base key and an unknown key are not in the badge catalog.
  for (const key of ["HEAT", "NOPE"]) {
    const p = badgeProgressFor({ badges: {} }, key);
    assert.equal(p.threshold, null);
    assert.equal(p.unlocked, false);
    assert.equal(p.count, 0);
  }
});

test("familyBadgeProgress counts unlocked tiles out of nine for a family", () => {
  // HEAT: 5 T2 + 3 T3 + 1 T4 = 9 tiles. Unlock 2 T2 and 1 T3 → 3/9.
  const progress = {
    badges: {
      T2_HEAT_FIRE: BADGE_THRESHOLDS[2],
      T2_HEAT_LAVA: BADGE_THRESHOLDS[2],
      T3_HEAT_CINDERFANG: BADGE_THRESHOLDS[3],
    },
  };
  const p = familyBadgeProgress(progress, "T4_PYRONIX");
  assert.equal(p.total, 9);
  assert.equal(p.unlocked, 3);
});

test("familyBadgeProgress reports a fully-unlocked family as unlocked === total", () => {
  const badges = {};
  for (const key of [
    "T2_HEAT_FIRE",
    "T2_HEAT_LAVA",
    "T2_HEAT_EMBER",
    "T2_HEAT_RUBY",
    "T2_HEAT_BLOOD",
  ]) {
    badges[key] = BADGE_THRESHOLDS[2];
  }
  for (const key of [
    "T3_HEAT_CINDERFANG",
    "T3_HEAT_MAGMASPINE",
    "T3_HEAT_BLOODRUBY_REVENANT",
  ]) {
    badges[key] = BADGE_THRESHOLDS[3];
  }
  badges.T4_PYRONIX = BADGE_THRESHOLDS[4];
  const p = familyBadgeProgress({ badges }, "T4_PYRONIX");
  assert.equal(p.total, 9);
  assert.equal(p.unlocked, p.total);
});

test("familyBadgeProgress returns zeroes for an unknown apex key", () => {
  const p = familyBadgeProgress({ badges: {} }, "NOPE");
  assert.deepEqual(p, { unlocked: 0, total: 0 });
});
