// Persistent cross-run meta-progression for Blupets Match-3.
// Unlike the per-session leaderboard, this survives every run: a collection of
// every apex (T4) form ever discovered plus lifetime stats. It's the "reason to
// play again" hook — fill the gallery, beat your best.

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
// Two buckets. (1) Evolution: per-family deepest-tier-ever badge (bronze/silver/
// gold). (2) Milestones: discrete achievements from a data-driven catalog. Both
// are local-only; folded once at run end by foldRun().

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

const FAMILY_BY_ID = new Map(BLUPETS_FAMILIES.map((f) => [f.id, f]));

const TIER_LABEL = { 2: "Bronze", 3: "Silver", 4: "Gold" };

// Build the "new badge" payload for a family that just leveled up.
function evolutionBadge(familyId, tier) {
  const family = FAMILY_BY_ID.get(familyId);
  const apex = family?.forms?.[4]?.[0] ?? null;
  return {
    id: `evo_${familyId}_${tier}`,
    name: `${family?.name ?? familyId} — ${TIER_LABEL[tier] ?? "T" + tier}`,
    kind: "evolution",
    asset: apex?.asset ?? null,
  };
}

// Number of families recorded at gold (T4). Drives the menagerie milestones and
// the profile chip's N/36.
export function goldFamilyCount(progress) {
  return Object.values(progress?.evoBadges ?? {}).filter((t) => t >= 4).length;
}

// Deepest tier (0|2|3|4) recorded for the family that owns this apex key.
export function familyBadgeLevel(progress, apexKey) {
  const family = getFamilyByApexKey(apexKey);
  if (!family) return 0;
  return progress?.evoBadges?.[family.id] ?? 0;
}

// Milestone catalog. Each rung is its own badge. test(ctx) reads the combined
// run+lifetime context built in foldRun. hint(counters) is optional and only
// returned where a stored counter makes a "N/threshold" hint meaningful (runs,
// lifetime bombs, lifetime score). Per-run bests (run score, combo) are NOT
// stored, so those rungs have no hint.
export const MILESTONE_BADGES = [
  { id: "score_5k",  label: "5,000 in a run",  category: "score", test: (c) => c.runScore >= 5000 },
  { id: "score_10k", label: "10,000 in a run", category: "score", test: (c) => c.runScore >= 10000 },
  { id: "score_25k", label: "25,000 in a run", category: "score", test: (c) => c.runScore >= 25000 },
  { id: "score_50k", label: "50,000 in a run", category: "score", test: (c) => c.runScore >= 50000 },

  { id: "combo_2", label: "Combo ×2", category: "combo", test: (c) => c.runMaxCombo >= 2 },
  { id: "combo_3", label: "Combo ×3", category: "combo", test: (c) => c.runMaxCombo >= 3 },
  { id: "combo_4", label: "Combo ×4", category: "combo", test: (c) => c.runMaxCombo >= 4 },

  { id: "first_cross", label: "First Cross", category: "special", test: (c) => c.runSpecials.cross >= 1 },
  { id: "first_bomb",  label: "First Bomb",  category: "special", test: (c) => c.counters.bombsTotal >= 1 },
  { id: "bombs_25",    label: "25 Bombs",    category: "special", test: (c) => c.counters.bombsTotal >= 25,
    hint: (k) => `${Math.min(k.bombsTotal, 25)}/25` },

  { id: "runs_10",  label: "10 Runs",  category: "endurance", test: (c) => c.counters.runs >= 10,
    hint: (k) => `${Math.min(k.runs, 10)}/10` },
  { id: "runs_50",  label: "50 Runs",  category: "endurance", test: (c) => c.counters.runs >= 50,
    hint: (k) => `${Math.min(k.runs, 50)}/50` },
  { id: "runs_200", label: "200 Runs", category: "endurance", test: (c) => c.counters.runs >= 200,
    hint: (k) => `${Math.min(k.runs, 200)}/200` },
  { id: "life_100k", label: "100k lifetime", category: "endurance", test: (c) => c.counters.lifetimeScore >= 100000,
    hint: (k) => `${Math.min(k.lifetimeScore, 100000)}/100000` },
  { id: "life_500k", label: "500k lifetime", category: "endurance", test: (c) => c.counters.lifetimeScore >= 500000,
    hint: (k) => `${Math.min(k.lifetimeScore, 500000)}/500000` },
];

// Summary milestones layered over the 36 evolution badges: gold-family counts.
export const MENAGERIE_MILESTONES = [
  { id: "menagerie_9",  label: "9 Apex Families",  threshold: 9 },
  { id: "menagerie_18", label: "18 Apex Families", threshold: 18 },
  { id: "menagerie_27", label: "27 Apex Families", threshold: 27 },
  { id: "menagerie_36", label: "36 Apex Families", threshold: 36 },
];

// Fold one finished run into the lifetime badge store. Returns the badges that
// crossed locked -> unlocked THIS fold (for the run-summary strip). Mutates and
// persists `progress`. Runs exactly once per run (gameOver fires once; victory
// is dead in endless mode).
export function foldRun(progress, ctx) {
  if (!progress.evoBadges) progress.evoBadges = {};
  if (!progress.milestones) {
    progress.milestones = { counters: { lifetimeScore: 0, runs: 0, bombsTotal: 0 }, unlocked: {} };
  }
  if (!progress.milestones.counters) {
    progress.milestones.counters = { lifetimeScore: 0, runs: 0, bombsTotal: 0 };
  }
  if (!progress.milestones.unlocked) {
    progress.milestones.unlocked = {};
  }
  const newBadges = [];

  // (1) Evolution badges: max tier per family.
  for (const { key, tier } of ctx.reachedForms ?? []) {
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

  // (3) Milestone catalog against the combined context.
  const evalCtx = {
    runScore: Number(ctx.score) || 0,
    runMaxCombo: Number(ctx.maxCombo) || 0,
    runSpecials: { cross: Number(ctx.specials?.cross) || 0, bomb: Number(ctx.specials?.bomb) || 0 },
    counters,
  };
  for (const m of MILESTONE_BADGES) {
    if (!progress.milestones.unlocked[m.id] && m.test(evalCtx)) {
      progress.milestones.unlocked[m.id] = true;
      newBadges.push({ id: m.id, name: m.label, kind: "milestone", asset: null });
    }
  }

  // (4) Menagerie summaries against the gold count.
  const gold = goldFamilyCount(progress);
  for (const ms of MENAGERIE_MILESTONES) {
    if (!progress.milestones.unlocked[ms.id] && gold >= ms.threshold) {
      progress.milestones.unlocked[ms.id] = true;
      newBadges.push({ id: ms.id, name: ms.label, kind: "menagerie", asset: null });
    }
  }

  save(progress);
  return { newBadges };
}

// Flattened badge list for the profile "Badges" section: milestones first, then
// menagerie. Each: { id, label, category, unlocked, hint|null }.
export function getMilestoneBadges(progress) {
  const counters = progress?.milestones?.counters ?? { lifetimeScore: 0, runs: 0, bombsTotal: 0 };
  const unlocked = progress?.milestones?.unlocked ?? {};
  const milestones = MILESTONE_BADGES.map((m) => ({
    id: m.id,
    label: m.label,
    category: m.category,
    unlocked: Boolean(unlocked[m.id]),
    hint: typeof m.hint === "function" ? m.hint(counters) : null,
  }));
  const gold = goldFamilyCount(progress);
  const menagerie = MENAGERIE_MILESTONES.map((ms) => ({
    id: ms.id,
    label: ms.label,
    category: "menagerie",
    unlocked: Boolean(unlocked[ms.id]),
    hint: `${Math.min(gold, ms.threshold)}/${ms.threshold}`,
  }));
  return [...milestones, ...menagerie];
}

function emptyProgress() {
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

// Coerce a parsed (possibly corrupted/legacy) record into a clean shape.
// Numeric fields are forced to finite numbers so a stray string/null/NaN can't
// poison comparisons or rendering downstream. fewestMovesWin stays nullable.
function normalizeProgress(parsed) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fewest = parsed.fewestMovesWin;
  const evoBadges =
    parsed.evoBadges && typeof parsed.evoBadges === "object" ? parsed.evoBadges : {};
  const ms = parsed.milestones && typeof parsed.milestones === "object" ? parsed.milestones : {};
  const counters = ms.counters && typeof ms.counters === "object" ? ms.counters : {};
  return {
    ...emptyProgress(),
    ...parsed,
    forms: parsed.forms && typeof parsed.forms === "object" ? parsed.forms : {},
    evoBadges,
    milestones: {
      counters: {
        lifetimeScore: num(counters.lifetimeScore),
        runs: num(counters.runs),
        bombsTotal: num(counters.bombsTotal),
      },
      unlocked: ms.unlocked && typeof ms.unlocked === "object" ? ms.unlocked : {},
    },
    runs: num(parsed.runs),
    wins: num(parsed.wins),
    bestScore: num(parsed.bestScore),
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

// Find the canon family whose apex (T4) form matches the given key. Used by the
// gallery to render the full evolution tree (T1 base pair → T2 → T3 → T4 apex)
// behind a collection card, in both own and public profiles.
export function getFamilyByApexKey(apexKey) {
  if (!apexKey) return null;
  for (const family of BLUPETS_FAMILIES) {
    for (const form of family.forms?.[4] ?? []) {
      if ((form.key ?? form.name) === apexKey) return family;
    }
  }
  return null;
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

