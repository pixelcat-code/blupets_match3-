import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_BADGES,
  BADGE_THRESHOLDS,
  badgeTierFor,
  isBadgeUnlocked,
  unlockedBadgeCount,
  foldRunMerges,
  getBadgeGalleryByFamily,
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

test("getBadgeGalleryByFamily returns 36 families of 9 ordered badges", () => {
  const gallery = getBadgeGalleryByFamily({ badges: {} });
  assert.equal(gallery.length, 36);
  for (const fam of gallery) {
    assert.equal(fam.total, 9);
    assert.equal(fam.forms.length, 9);
    assert.deepEqual(
      fam.forms.map((f) => f.tier),
      [2, 2, 2, 2, 2, 3, 3, 3, 4],
    );
    assert.equal(fam.collected, 0);
    for (const f of fam.forms) {
      assert.equal(f.unlocked, false);
      assert.equal(f.threshold, BADGE_THRESHOLDS[f.tier]);
    }
  }
});

test("getBadgeGalleryByFamily reflects unlocked badges and per-badge count", () => {
  const progress = { badges: { T2_HEAT_FIRE: BADGE_THRESHOLDS[2], T3_HEAT_CINDERFANG: BADGE_THRESHOLDS[3] - 1 } };
  const heat = getBadgeGalleryByFamily(progress).find((f) => f.familyId === "heat");
  assert.ok(heat);
  assert.equal(heat.collected, 1);
  const fire = heat.forms.find((f) => f.key === "T2_HEAT_FIRE");
  assert.equal(fire.unlocked, true);
  assert.equal(fire.count, BADGE_THRESHOLDS[2]);
  const cinder = heat.forms.find((f) => f.key === "T3_HEAT_CINDERFANG");
  assert.equal(cinder.unlocked, false);
  assert.equal(cinder.count, BADGE_THRESHOLDS[3] - 1);
});
