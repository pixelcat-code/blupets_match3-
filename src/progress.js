// Persistent cross-run meta-progression for Blupets Match-3.
// Unlike the per-session leaderboard, this survives every run: opened Inventory
// forms, completed Ascended forms, and lifetime stats.

import { BLUPETS_FAMILIES } from "./blupets-canon-data.js";

let _progressUserId = null;

export function setProgressUser(userId) {
  _progressUserId = userId || null;
}

function progressKey() {
  return _progressUserId ? `blupets-progress-v1-${_progressUserId}` : "blupets-progress-v1";
}

// Total distinct apex forms that can ever be discovered — the "X / TOTAL"
// denominator for the collection. Derived from the canon so it stays correct if
// families are added later.
export const TOTAL_APEX_FORMS = (() => {
  const keys = new Set();
  for (const family of BLUPETS_FAMILIES) {
    for (const form of family.forms?.[4] ?? []) {
      keys.add(form.key ?? form.name);
    }
  }
  return keys.size;
})();

// ── Badges v2 ────────────────────────────────────────────────────────────────
// Player-facing language follows Blupix terms: Inventory, Evolution, Lineage,
// Base Evolved, Advanced, Ascended, Form, Vibe. No bronze/silver/gold tiers.

export const TOTAL_FAMILIES = BLUPETS_FAMILIES.length;

// formKey (T2-T4) -> { familyId, tier }. Used to map a run's reached form keys
// back onto their family + tier when folding evolution badges.
const FORM_KEY_INDEX = (() => {
  const map = new Map();
  for (const family of BLUPETS_FAMILIES) {
    for (const tier of [2, 3, 4]) {
      for (const form of family.forms?.[tier] ?? []) {
        map.set(form.key ?? form.name, { familyId: family.id, tier });
      }
    }
  }
  return map;
})();

export const TOTAL_CODEX_TILES = FORM_KEY_INDEX.size;
export const TOTAL_INVENTORY_FORMS = TOTAL_CODEX_TILES;

const FAMILY_BY_ID = new Map(BLUPETS_FAMILIES.map((f) => [f.id, f]));

const STAGE_LABEL = { 2: "Base Evolved", 3: "Advanced", 4: "Ascended" };
const COLLECTION_TIER_BY_FORM_TIER = { 2: "base", 3: "advanced", 4: "ascended" };
const FORM_TIER_BY_COLLECTION_TIER = { base: 2, advanced: 3, ascended: 4 };

export const COLLECTION_TIERS = ["base", "advanced", "ascended"];
export const COLLECTION_TIER_LABEL = {
  base: "Base",
  advanced: "Advanced",
  ascended: "Ascended",
};
export const CAPSULE_DROP_ODDS = Object.freeze({
  base: 0.78,
  advanced: 0.19,
  ascended: 0.03,
});
export const CAPSULE_PITY = Object.freeze({
  noNew: 15,
  noAdvancedPlus: 40,
  noAscended: 100,
});
export const DUPLICATE_SHARDS = Object.freeze({
  base: 1,
  advanced: 5,
  ascended: 25,
});
export const SHARDS_PER_CAPSULE = 25;
export const SCORE_CAPSULE_REWARDS = Object.freeze([
  [100000, 10],
  [75000, 7],
  [50000, 5],
  [35000, 4],
  [20000, 3],
  [10000, 2],
  [5000, 1],
]);

export const COLLECTION_TILES = (() => {
  const tiles = [];
  for (const family of BLUPETS_FAMILIES) {
    for (const formTier of [2, 3, 4]) {
      const tier = COLLECTION_TIER_BY_FORM_TIER[formTier];
      for (const form of family.forms?.[formTier] ?? []) {
        const key = form.key ?? form.name;
        tiles.push({
          key,
          name: form.name,
          asset: form.asset,
          tier,
          formTier,
          familyId: family.id,
          familyName: family.name,
        });
      }
    }
  }
  return Object.freeze(tiles);
})();

const COLLECTION_TILE_BY_KEY = new Map(COLLECTION_TILES.map((tile) => [tile.key, tile]));
const COLLECTION_TILES_BY_TIER = Object.freeze(
  Object.fromEntries(
    COLLECTION_TIERS.map((tier) => [tier, Object.freeze(COLLECTION_TILES.filter((tile) => tile.tier === tier))]),
  ),
);

// Build the "new badge" payload for a lineage stage reached this run.
function evolutionBadge(familyId, tier) {
  const family = FAMILY_BY_ID.get(familyId);
  const apex = family?.forms?.[4]?.[0] ?? null;
  return {
    id: `evo_${familyId}_${tier}`,
    name: `${family?.name ?? familyId} ${STAGE_LABEL[tier] ?? "T" + tier}`,
    kind: "evolution",
    asset: apex?.asset ?? null,
  };
}

// Number of lineages that reached Ascended (T4). Drives the profile chip's N/36.
export function ascendedLineageCount(progress) {
  return Object.values(progress?.evoBadges ?? {}).filter((t) => t >= 4).length;
}

// Deepest visible evolution stage (0|2|3|4) recorded for this lineage.
export function lineageStageLevel(progress, apexKey) {
  const family = getLineageByAscendedKey(apexKey);
  if (!family) return 0;
  return progress?.evoBadges?.[family.id] ?? 0;
}

export function collectionLineageStageLevel(progress, apexKey) {
  const family = getLineageByAscendedKey(apexKey);
  if (!family) return 0;
  const owned = progress?.collectionTiles ?? progress?.inventoryForms ?? {};
  let level = 0;
  for (const tier of [2, 3, 4]) {
    for (const form of family.forms?.[tier] ?? []) {
      const key = form.key ?? form.name;
      if (owned[key]) level = Math.max(level, tier);
    }
  }
  return level;
}

const BADGE_COLORS = [
  ["red", "Red"],
  ["blue", "Blue"],
  ["green", "Green"],
  ["yellow", "Yellow"],
  ["purple", "Purple"],
  ["cyan", "Cyan"],
  ["white", "White"],
  ["black", "Black"],
];

export const BADGE_TIERS = ["common", "uncommon", "rare", "epic", "legendary"];

const cap = (value, max) => `${Math.min(Number(value) || 0, max)}/${max}`;
const byClears = (colorId, threshold) => (c) => (c.counters.tileClears?.[colorId] ?? 0) >= threshold;
const clearHint = (colorId, threshold) => (c) => cap(c.tileClears?.[colorId], threshold);
const collectionTierCount = (progress, collectionTier) => {
  const owned = progress?.collectionTiles ?? {};
  return COLLECTION_TILES.filter((tile) => tile.tier === collectionTier && owned[tile.key]).length;
};

function badge(id, label, category, tier, test, hint = null) {
  return { id, label, category, tier, test, hint };
}

export function milestoneCapsuleReward(tier) {
  return { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 10 }[tier] ?? 1;
}

const tileBadges = [
  ...BADGE_COLORS.map(([id, label]) =>
    badge(`color_${id}_adept`, `${label} Adept`, "color", "common", byClears(id, 250), clearHint(id, 250)),
  ),
  ...BADGE_COLORS.map(([id, label]) =>
    badge(`color_${id}_specialist`, `${label} Specialist`, "color", "uncommon", byClears(id, 1000), clearHint(id, 1000)),
  ),
  ...BADGE_COLORS.map(([id, label]) =>
    badge(`color_${id}_master`, `${label} Master`, "color", "rare", byClears(id, 5000), clearHint(id, 5000)),
  ),
];

// Exactly 70 player-facing achievement badges. Inventory/evolution state remains
// separate; this catalog only awards readable milestones layered over gameplay.
export const MILESTONE_BADGES = [
  // Common: 24
  badge("run_1", "First Run", "endurance", "common", (c) => c.counters.runs >= 1, (c) => cap(c.runs, 1)),
  badge("runs_5", "5 Runs", "endurance", "common", (c) => c.counters.runs >= 5, (c) => cap(c.runs, 5)),
  badge("inventory_form_1", "First Inventory Form", "collection", "common", (c) => c.collection.inventoryForms >= 1, (c) => cap(c.inventoryForms, 1)),
  badge("base_evolved_1", "First Base Evolved", "collection", "common", (c) => c.collection.baseEvolved >= 1, (c) => cap(c.baseEvolved, 1)),
  badge("advanced_1", "First Advanced", "collection", "common", (c) => c.collection.advanced >= 1, (c) => cap(c.advanced, 1)),
  badge("ascended_1", "First Ascended", "collection", "common", (c) => c.collection.ascended >= 1, (c) => cap(c.ascended, 1)),
  badge("inventory_forms_9", "9 Inventory Forms", "collection", "common", (c) => c.collection.inventoryForms >= 9, (c) => cap(c.inventoryForms, 9)),
  badge("inventory_forms_18", "18 Inventory Forms", "collection", "common", (c) => c.collection.inventoryForms >= 18, (c) => cap(c.inventoryForms, 18)),
  ...tileBadges.filter((b) => b.tier === "common"),
  badge("first_cross", "First Cross", "special", "common", (c) => c.counters.crossTotal >= 1, (c) => cap(c.crossTotal, 1)),
  badge("first_bomb", "First Bomb", "special", "common", (c) => c.counters.bombsTotal >= 1, (c) => cap(c.bombsTotal, 1)),
  badge("cross_10", "10 Crosses", "special", "common", (c) => c.counters.crossTotal >= 10, (c) => cap(c.crossTotal, 10)),
  badge("bomb_10", "10 Bombs", "special", "common", (c) => c.counters.bombsTotal >= 10, (c) => cap(c.bombsTotal, 10)),
  badge("combo_2", "Combo x2", "combo", "common", (c) => c.runMaxCombo >= 2),
  badge("combo_3", "Combo x3", "combo", "common", (c) => c.runMaxCombo >= 3),
  badge("score_5k", "5,000 in a run", "score", "common", (c) => c.runScore >= 5000),
  badge("score_10k", "10,000 in a run", "score", "common", (c) => c.runScore >= 10000),

  // Uncommon: 18
  badge("ascended_3", "3 Ascended", "collection", "uncommon", (c) => c.collection.ascended >= 3, (c) => cap(c.ascended, 3)),
  badge("ascended_5", "5 Ascended", "collection", "uncommon", (c) => c.collection.ascended >= 5, (c) => cap(c.ascended, 5)),
  badge("base_evolved_9", "9 Base Evolved", "collection", "uncommon", (c) => c.collection.baseEvolved >= 9, (c) => cap(c.baseEvolved, 9)),
  badge("advanced_5", "5 Advanced", "collection", "uncommon", (c) => c.collection.advanced >= 5, (c) => cap(c.advanced, 5)),
  badge("inventory_forms_36", "36 Inventory Forms", "collection", "uncommon", (c) => c.collection.inventoryForms >= 36, (c) => cap(c.inventoryForms, 36)),
  ...tileBadges.filter((b) => b.tier === "uncommon"),
  badge("cross_50", "50 Crosses", "special", "uncommon", (c) => c.counters.crossTotal >= 50, (c) => cap(c.crossTotal, 50)),
  badge("bomb_50", "50 Bombs", "special", "uncommon", (c) => c.counters.bombsTotal >= 50, (c) => cap(c.bombsTotal, 50)),
  badge("combo_4", "Combo x4", "combo", "uncommon", (c) => c.runMaxCombo >= 4),
  badge("score_20k", "20,000 in a run", "score", "uncommon", (c) => c.runScore >= 20000),
  badge("advanced_2_run", "Two Advanced in One Run", "score", "uncommon", (c) => c.runAdvancedForms >= 2),

  // Rare: 14
  badge("ascended_9", "9 Ascended", "collection", "rare", (c) => c.collection.ascended >= 9, (c) => cap(c.ascended, 9)),
  badge("ascended_12", "12 Ascended", "collection", "rare", (c) => c.collection.ascended >= 12, (c) => cap(c.ascended, 12)),
  badge("advanced_12", "12 Advanced", "collection", "rare", (c) => c.collection.advanced >= 12, (c) => cap(c.advanced, 12)),
  badge("inventory_forms_108", "108 Inventory Forms", "collection", "rare", (c) => c.collection.inventoryForms >= 108, (c) => cap(c.inventoryForms, 108)),
  ...tileBadges.filter((b) => b.tier === "rare"),
  badge("bomb_250", "250 Bombs", "special", "rare", (c) => c.counters.bombsTotal >= 250, (c) => cap(c.bombsTotal, 250)),
  badge("score_35k", "35,000 in a run", "score", "rare", (c) => c.runScore >= 35000),

  // Epic: 9
  badge("ascended_18", "18 Ascended", "collection", "epic", (c) => c.collection.ascended >= 18, (c) => cap(c.ascended, 18)),
  badge("advanced_18", "18 Advanced", "collection", "epic", (c) => c.collection.advanced >= 18, (c) => cap(c.advanced, 18)),
  badge("inventory_forms_216", "216 Inventory Forms", "collection", "epic", (c) => c.collection.inventoryForms >= 216, (c) => cap(c.inventoryForms, 216)),
  badge("cross_250", "250 Crosses", "special", "epic", (c) => c.counters.crossTotal >= 250, (c) => cap(c.crossTotal, 250)),
  badge("bomb_500", "500 Bombs", "special", "epic", (c) => c.counters.bombsTotal >= 500, (c) => cap(c.bombsTotal, 500)),
  badge("combo4_runs_25", "25 Combo x4 Runs", "combo", "epic", (c) => c.counters.combo4Runs >= 25, (c) => cap(c.combo4Runs, 25)),
  badge("score_50k", "50,000 in a run", "score", "epic", (c) => c.runScore >= 50000),
  badge("ascended_3_run", "Triple Ascended Run", "score", "epic", (c) => c.runAscendedForms >= 3),
  badge("life_500k", "500k Lifetime", "endurance", "epic", (c) => c.counters.lifetimeScore >= 500000, (c) => cap(c.lifetimeScore, 500000)),

  // Legendary: 5
  badge("complete_inventory", "Complete Inventory", "collection", "legendary", (c) => c.collection.inventoryForms >= TOTAL_INVENTORY_FORMS, (c) => cap(c.inventoryForms, TOTAL_INVENTORY_FORMS)),
  badge("all_color_masters", "All Color Masters", "color", "legendary", (c) => BADGE_COLORS.every(([id]) => (c.counters.tileClears?.[id] ?? 0) >= 5000)),
  badge("life_1m", "1M Lifetime", "endurance", "legendary", (c) => c.counters.lifetimeScore >= 1000000, (c) => cap(c.lifetimeScore, 1000000)),
  badge("runs_500", "500 Runs", "endurance", "legendary", (c) => c.counters.runs >= 500, (c) => cap(c.runs, 500)),
  badge("bomb_1000", "1,000 Bombs", "special", "legendary", (c) => c.counters.bombsTotal >= 1000, (c) => cap(c.bombsTotal, 1000)),
];

export const MENAGERIE_MILESTONES = MILESTONE_BADGES.filter((b) =>
  ["ascended_9", "ascended_18", "complete_inventory"].includes(b.id),
);

// Fold one finished run into the lifetime badge store. Returns the badges that
// crossed locked -> unlocked THIS fold (for the run-summary strip). Mutates and
// persists `progress`. Runs exactly once per run (gameOver fires once; victory
// is dead in endless mode).
export function foldRun(progress, ctx) {
  if (!progress.inventoryForms) progress.inventoryForms = { ...(progress.codexTiles ?? {}) };
  if (!progress.collectionTiles) progress.collectionTiles = {};
  if (!progress.evoBadges) progress.evoBadges = {};
  progress.capsules = Math.max(0, Math.floor(Number(progress.capsules) || 0));
  progress.shards = Math.max(0, Math.floor(Number(progress.shards) || 0));
  progress.capsuleStats = normalizeCapsuleStats(progress.capsuleStats);
  if (!progress.milestones) {
    progress.milestones = { counters: emptyCounters(), unlocked: {} };
  }
  if (!progress.milestones.counters) {
    progress.milestones.counters = emptyCounters();
  }
  normalizeCountersInPlace(progress.milestones.counters);
  if (!progress.milestones.unlocked) {
    progress.milestones.unlocked = {};
  }
  const newBadges = [];

  // (1) Inventory forms + deepest visible evolution stage per lineage.
  for (const { key, tier } of ctx.reachedForms ?? []) {
    if (key && FORM_KEY_INDEX.has(key)) {
      progress.inventoryForms[key] = true;
    }
    const info = FORM_KEY_INDEX.get(key);
    if (!info) continue;
    const prev = progress.evoBadges[info.familyId] ?? 0;
    if (tier > prev) {
      progress.evoBadges[info.familyId] = tier;
      newBadges.push(evolutionBadge(info.familyId, tier));
    }
  }

  // (2) Lifetime counters.
  const counters = progress.milestones.counters;
  counters.lifetimeScore += Number(ctx.score) || 0;
  counters.runs += 1;
  counters.bombsTotal += Number(ctx.specials?.bomb) || 0;
  counters.crossTotal += Number(ctx.specials?.cross) || 0;
  if (Number(ctx.maxCombo) >= 2) counters.combo2Runs += 1;
  if (Number(ctx.maxCombo) >= 3) counters.combo3Runs += 1;
  if (Number(ctx.maxCombo) >= 4) counters.combo4Runs += 1;
  for (const [colorId] of BADGE_COLORS) {
    counters.tileClears[colorId] += Number(ctx.tileClears?.[colorId]) || 0;
  }

  // (3) Milestone catalog against the combined context.
  const reached = ctx.reachedForms ?? [];
  const collection = collectionStats(progress);
  const evalCtx = {
    runScore: Number(ctx.score) || 0,
    runMaxCombo: Number(ctx.maxCombo) || 0,
    runAdvancedForms: reached.filter((f) => Number(f.tier) >= 3).length,
    runAscendedForms: reached.filter((f) => Number(f.tier) >= 4).length,
    runSpecials: { cross: Number(ctx.specials?.cross) || 0, bomb: Number(ctx.specials?.bomb) || 0 },
    collection,
    counters,
  };
  for (const m of MILESTONE_BADGES) {
    if (!progress.milestones.unlocked[m.id] && m.test(evalCtx)) {
      progress.milestones.unlocked[m.id] = true;
      const capsules = milestoneCapsuleReward(m.tier);
      progress.capsules += capsules;
      newBadges.push({ id: m.id, name: m.label, kind: "milestone", asset: null, capsules });
    }
  }

  const scoreCapsules = capsulesForScore(ctx.score);
  progress.capsules += scoreCapsules;

  save(progress);
  return { newBadges, capsulesEarned: scoreCapsules };
}

function normalizeCapsuleStats(stats = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  return {
    opened: num(stats.opened),
    noNew: num(stats.noNew),
    noAdvancedPlus: num(stats.noAdvancedPlus),
    noAscended: num(stats.noAscended),
  };
}

export function capsulesForScore(score) {
  const value = Number(score) || 0;
  for (const [threshold, capsules] of SCORE_CAPSULE_REWARDS) {
    if (value >= threshold) return capsules;
  }
  return 0;
}

export function awardCapsules(progress, count) {
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  progress.capsules = Math.max(0, Math.floor(Number(progress.capsules) || 0)) + amount;
  save(progress);
  return amount;
}

export function exchangeShardsForCapsules(progress, maxCapsules = Infinity) {
  progress.shards = Math.max(0, Math.floor(Number(progress.shards) || 0));
  progress.capsules = Math.max(0, Math.floor(Number(progress.capsules) || 0));
  const requested = Number.isFinite(Number(maxCapsules)) ? Math.max(0, Math.floor(Number(maxCapsules))) : Infinity;
  const possible = Math.floor(progress.shards / SHARDS_PER_CAPSULE);
  const capsules = Math.min(possible, requested);
  if (capsules <= 0) return { capsules: 0, shardsSpent: 0 };
  const shardsSpent = capsules * SHARDS_PER_CAPSULE;
  progress.shards -= shardsSpent;
  progress.capsules += capsules;
  save(progress);
  return { capsules, shardsSpent };
}

function weightedTier(rng, odds, available = COLLECTION_TIERS) {
  const items = available
    .map((tier) => [tier, Number(odds[tier]) || 0])
    .filter(([, weight]) => weight > 0);
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return available[0] ?? "base";
  let roll = rng() * total;
  for (const [tier, weight] of items) {
    roll -= weight;
    if (roll <= 0) return tier;
  }
  return items[items.length - 1][0];
}

function missingTiles(progress, tier) {
  const owned = progress?.collectionTiles ?? {};
  return COLLECTION_TILES_BY_TIER[tier].filter((tile) => !owned[tile.key]);
}

function pickTile(progress, tier, rng, forceNew = false) {
  const missing = missingTiles(progress, tier);
  const pool = forceNew && missing.length ? missing : COLLECTION_TILES_BY_TIER[tier];
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

function capsuleTier(progress, rng) {
  const stats = normalizeCapsuleStats(progress.capsuleStats);
  const hasMissing = (tier) => missingTiles(progress, tier).length > 0;
  if (stats.noAscended >= CAPSULE_PITY.noAscended && hasMissing("ascended")) {
    return { tier: "ascended", forced: "ascended" };
  }
  if (stats.noAdvancedPlus >= CAPSULE_PITY.noAdvancedPlus && (hasMissing("advanced") || hasMissing("ascended"))) {
    const available = ["advanced", "ascended"].filter(hasMissing);
    return { tier: weightedTier(rng, CAPSULE_DROP_ODDS, available), forced: "advancedPlus" };
  }
  if (stats.noNew >= CAPSULE_PITY.noNew) {
    const available = COLLECTION_TIERS.filter(hasMissing);
    if (available.length) {
      return { tier: weightedTier(rng, CAPSULE_DROP_ODDS, available), forced: "new" };
    }
  }
  return { tier: weightedTier(rng, CAPSULE_DROP_ODDS), forced: null };
}

export function openCapsule(progress, rng = Math.random) {
  progress.collectionTiles = progress.collectionTiles && typeof progress.collectionTiles === "object"
    ? progress.collectionTiles
    : {};
  progress.capsules = Math.max(0, Math.floor(Number(progress.capsules) || 0));
  progress.shards = Math.max(0, Math.floor(Number(progress.shards) || 0));
  progress.capsuleStats = normalizeCapsuleStats(progress.capsuleStats);
  if (progress.capsules <= 0) {
    return { opened: false, reason: "no_capsules" };
  }

  progress.capsules -= 1;
  const { tier, forced } = capsuleTier(progress, rng);
  const tile = pickTile(progress, tier, rng, Boolean(forced));
  if (!tile) {
    save(progress);
    return { opened: false, reason: "empty_pool" };
  }

  const duplicate = Boolean(progress.collectionTiles[tile.key]);
  let shards = 0;
  if (duplicate) {
    shards = DUPLICATE_SHARDS[tile.tier] ?? 0;
    progress.shards += shards;
    progress.capsuleStats.noNew += 1;
  } else {
    progress.collectionTiles[tile.key] = true;
    progress.inventoryForms = progress.inventoryForms && typeof progress.inventoryForms === "object"
      ? progress.inventoryForms
      : {};
    progress.inventoryForms[tile.key] = true;
    progress.capsuleStats.noNew = 0;
  }
  progress.capsuleStats.opened += 1;
  progress.capsuleStats.noAdvancedPlus = tile.tier === "advanced" || tile.tier === "ascended"
    ? 0
    : progress.capsuleStats.noAdvancedPlus + 1;
  progress.capsuleStats.noAscended = tile.tier === "ascended" ? 0 : progress.capsuleStats.noAscended + 1;

  save(progress);
  return {
    opened: true,
    tile,
    tier: tile.tier,
    duplicate,
    shards,
    forced,
  };
}

// Flattened badge list for the profile "Badges" section.
// Each: { id, label, category, tier, unlocked, hint|null }.
export function getMilestoneBadges(progress) {
  const counters = normalizeCounterSnapshot(progress?.milestones?.counters);
  const unlocked = progress?.milestones?.unlocked ?? {};
  const ctx = {
    ...counters,
    ...collectionStats(progress),
    counters,
    collection: collectionStats(progress),
  };
  return MILESTONE_BADGES.map((m) => ({
    id: m.id,
    label: m.label,
    category: m.category,
    tier: m.tier,
    unlocked: Boolean(unlocked[m.id]),
    hint: typeof m.hint === "function" ? m.hint(ctx) : null,
  }));
}

function emptyCounters() {
  return {
    lifetimeScore: 0,
    runs: 0,
    bombsTotal: 0,
    crossTotal: 0,
    combo2Runs: 0,
    combo3Runs: 0,
    combo4Runs: 0,
    tileClears: Object.fromEntries(BADGE_COLORS.map(([id]) => [id, 0])),
  };
}

function normalizeCountersInPlace(counters) {
  const clean = normalizeCounterSnapshot(counters);
  Object.assign(counters, clean);
  counters.tileClears = clean.tileClears;
  return counters;
}

function normalizeCounterSnapshot(counters = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const tileClears = {};
  for (const [id] of BADGE_COLORS) {
    tileClears[id] = num(counters.tileClears?.[id]);
  }
  return {
    lifetimeScore: num(counters.lifetimeScore),
    runs: num(counters.runs),
    bombsTotal: num(counters.bombsTotal),
    crossTotal: num(counters.crossTotal),
    combo2Runs: num(counters.combo2Runs),
    combo3Runs: num(counters.combo3Runs),
    combo4Runs: num(counters.combo4Runs),
    tileClears,
  };
}

function collectionStats(progress) {
  return {
    discovered: collectionTileCount(progress),
    inventoryForms: collectionTileCount(progress),
    baseEvolved: collectionTierCount(progress, "base"),
    advanced: collectionTierCount(progress, "advanced"),
    ascended: collectionTierCount(progress, "ascended"),
  };
}

function emptyProgress() {
  return {
    tutorialSeen: false,
    forms: {},
    collectionTiles: {},
    inventoryForms: {},
    evoBadges: {},
    capsules: 0,
    shards: 0,
    capsuleStats: { opened: 0, noNew: 0, noAdvancedPlus: 0, noAscended: 0 },
    milestones: { counters: emptyCounters(), unlocked: {} },
    runs: 0,
    wins: 0,
    bestScore: 0,
    fewestMovesWin: null,
  };
}

// Coerce a parsed (possibly corrupted/legacy) record into a clean shape.
// Numeric fields are forced to finite numbers so a stray string/null/NaN can't
// poison comparisons or rendering downstream. fewestMovesWin stays nullable.
function normalizeProgress(parsed) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fewest = parsed.fewestMovesWin;
  const evoBadges =
    parsed.evoBadges && typeof parsed.evoBadges === "object" ? parsed.evoBadges : {};
  const inventoryForms =
    parsed.inventoryForms && typeof parsed.inventoryForms === "object"
      ? { ...parsed.inventoryForms }
      : parsed.codexTiles && typeof parsed.codexTiles === "object"
        ? { ...parsed.codexTiles }
        : {};
  const collectionTiles =
    parsed.collectionTiles && typeof parsed.collectionTiles === "object" ? { ...parsed.collectionTiles } : {};
  for (const key of Object.keys(parsed.forms && typeof parsed.forms === "object" ? parsed.forms : {})) {
    if (FORM_KEY_INDEX.has(key)) {
      inventoryForms[key] = true;
    }
  }
  const ms = parsed.milestones && typeof parsed.milestones === "object" ? parsed.milestones : {};
  const counters = ms.counters && typeof ms.counters === "object" ? ms.counters : {};
  const normalizedCounters = normalizeCounterSnapshot(counters);
  const capsuleStats =
    parsed.capsuleStats && typeof parsed.capsuleStats === "object" ? parsed.capsuleStats : {};
  return {
    ...emptyProgress(),
    ...parsed,
    forms: parsed.forms && typeof parsed.forms === "object" ? parsed.forms : {},
    collectionTiles,
    inventoryForms,
    evoBadges,
    capsules: Math.max(0, Math.floor(num(parsed.capsules))),
    shards: Math.max(0, Math.floor(num(parsed.shards))),
    capsuleStats: {
      opened: Math.max(0, Math.floor(num(capsuleStats.opened))),
      noNew: Math.max(0, Math.floor(num(capsuleStats.noNew))),
      noAdvancedPlus: Math.max(0, Math.floor(num(capsuleStats.noAdvancedPlus))),
      noAscended: Math.max(0, Math.floor(num(capsuleStats.noAscended))),
    },
    milestones: {
      counters: normalizedCounters,
      unlocked: ms.unlocked && typeof ms.unlocked === "object" ? ms.unlocked : {},
    },
    runs: num(parsed.runs),
    wins: num(parsed.wins),
    bestScore: num(parsed.bestScore),
    tutorialSeen: Boolean(parsed.tutorialSeen) || num(parsed.runs) > 0,
    fewestMovesWin:
      fewest == null || !Number.isFinite(Number(fewest)) ? null : Number(fewest),
  };
}

const LEGACY_KEY = "blupets-progress-v1";

export function loadProgress() {
  const key = progressKey();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return normalizeProgress(parsed);
      }
    }
  } catch {
    // Unreadable/legacy storage — start fresh.
  }
  // One-time migration: if a signed-in user has no per-user record yet,
  // adopt the legacy shared record and remove it so the next sign-in
  // (different account) starts clean.
  if (_progressUserId && key !== LEGACY_KEY) {
    try {
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed && typeof parsed === "object") {
          window.localStorage.setItem(key, legacy);
          window.localStorage.removeItem(LEGACY_KEY);
          return normalizeProgress(parsed);
        }
      }
    } catch {
      // Ignore migration errors.
    }
  }
  return emptyProgress();
}

function save(progress) {
  try {
    window.localStorage.setItem(progressKey(), JSON.stringify(progress));
  } catch {
    // Storage unavailable — keep the in-memory copy for this session.
  }
}

// Cache remote progress to localStorage so it's available offline.
export function saveProgress(progress) {
  save(progress);
}

export function recordRunStart(progress) {
  progress.runs = (progress.runs ?? 0) + 1;
  save(progress);
  return progress;
}

export function recordWin(progress, { formKey, formName, asset, color, partner, score, movesUsed }) {
  progress.wins = (progress.wins ?? 0) + 1;
  if (score > (progress.bestScore ?? 0)) {
    progress.bestScore = score;
  }
  if (progress.fewestMovesWin == null || movesUsed < progress.fewestMovesWin) {
    progress.fewestMovesWin = movesUsed;
  }

  const key = formKey || "UNKNOWN";
  const existing = progress.forms[key];
  progress.forms[key] = {
    name: formName || existing?.name || key,
    asset: asset || existing?.asset || null,
    color: color || existing?.color || null,
    partner: partner || existing?.partner || null,
    count: (existing?.count ?? 0) + 1,
    firstAt: existing?.firstAt ?? Date.now(),
  };

  save(progress);
  return progress;
}

export function discoveredCount(progress) {
  return Object.keys(progress?.forms ?? {}).length;
}

export function collectionTileCount(progress) {
  return Object.keys(progress?.collectionTiles ?? {}).filter((key) =>
    COLLECTION_TILE_BY_KEY.has(key),
  ).length;
}

export function getCollectionTileEntries(progress) {
  const owned = progress?.collectionTiles ?? {};
  return COLLECTION_TILES.map((tile) => ({
    ...tile,
    discovered: Boolean(owned[tile.key]),
  }));
}

// Find the canon lineage whose Ascended (T4) form matches the given key. Used by
// the gallery to render the full evolution tree behind a collection card.
export function getLineageByAscendedKey(apexKey) {
  if (!apexKey) return null;
  for (const family of BLUPETS_FAMILIES) {
    for (const form of family.forms?.[4] ?? []) {
      if ((form.key ?? form.name) === apexKey) return family;
    }
  }
  return null;
}

export function getAscendedKeyByFormKey(formKey) {
  const info = FORM_KEY_INDEX.get(formKey);
  if (!info) return null;
  const apex = FAMILY_BY_ID.get(info.familyId)?.forms?.[4]?.[0];
  return apex ? apex.key ?? apex.name : null;
}

// Every apex form in canon, flagged with whether it's been discovered, so the
// gallery can render locked silhouettes alongside unlocked art.
export function getCollectionEntries(progress) {
  const owned = progress?.forms ?? {};
  const entries = [];
  for (const family of BLUPETS_FAMILIES) {
    for (const form of family.forms?.[4] ?? []) {
      const key = form.key ?? form.name;
      const got = owned[key];
      entries.push({
        key,
        name: form.name,
        asset: form.asset,
        discovered: Boolean(got),
        count: got?.count ?? 0,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.discovered !== b.discovered) {
      return a.discovered ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return entries;
}
