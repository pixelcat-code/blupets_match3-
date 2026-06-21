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

// Per-tier match-group thresholds to unlock a badge. Lower tiers need more because
// a color spends most of its life there. Tunable values, not architecture.
export const BADGE_THRESHOLDS = { 2: 10, 3: 6, 4: 3 };

// Every collectible form (T2-T4) flattened from the canon: the 324-badge catalog.
export const BADGE_CATALOG = (() => {
  const out = [];
  for (const family of BLUPETS_FAMILIES) {
    for (const tier of [2, 3, 4]) {
      for (const form of family.forms?.[tier] ?? []) {
        out.push({
          key: form.key ?? form.name,
          tier,
          name: form.name,
          asset: form.asset ?? null,
          familyId: family.id,
          color: family.color ?? null,
        });
      }
    }
  }
  return out;
})();

// The "X / TOTAL_BADGES" denominator for the badge collection.
export const TOTAL_BADGES = BADGE_CATALOG.length;

const BADGE_BY_KEY = new Map(BADGE_CATALOG.map((badge) => [badge.key, badge]));

export function badgeTierFor(formKey) {
  return BADGE_BY_KEY.get(formKey)?.tier ?? null;
}

export function isBadgeUnlocked(progress, formKey) {
  const tier = badgeTierFor(formKey);
  if (!tier) {
    return false;
  }
  return (progress?.badges?.[formKey] ?? 0) >= BADGE_THRESHOLDS[tier];
}

export function unlockedBadgeCount(progress) {
  let count = 0;
  for (const key in progress?.badges ?? {}) {
    if (isBadgeUnlocked(progress, key)) {
      count += 1;
    }
  }
  return count;
}

// Fold one run's per-form merge counts into the lifetime badge store. Returns the
// badges that crossed their threshold *this fold* (for the run-summary highlight)
// and the new lifetime unlocked total.
export function foldRunMerges(progress, runMergeCounts) {
  if (!progress.badges) {
    progress.badges = {};
  }
  const newlyUnlocked = [];
  for (const key in runMergeCounts ?? {}) {
    const tier = badgeTierFor(key);
    if (!tier) {
      continue;
    }
    const before = progress.badges[key] ?? 0;
    const wasUnlocked = before >= BADGE_THRESHOLDS[tier];
    const after = before + runMergeCounts[key];
    progress.badges[key] = after;
    if (!wasUnlocked && after >= BADGE_THRESHOLDS[tier]) {
      const meta = BADGE_BY_KEY.get(key);
      newlyUnlocked.push({
        key,
        name: meta?.name ?? key,
        asset: meta?.asset ?? null,
        tier,
        color: meta?.color ?? null,
      });
    }
  }
  save(progress);
  return { newlyUnlocked, unlockedTotal: unlockedBadgeCount(progress) };
}

function emptyProgress() {
  return { forms: {}, badges: {}, runs: 0, wins: 0, bestScore: 0, fewestMovesWin: null };
}

// Coerce a parsed (possibly corrupted/legacy) record into a clean shape.
// Numeric fields are forced to finite numbers so a stray string/null/NaN can't
// poison comparisons or rendering downstream. fewestMovesWin stays nullable.
function normalizeProgress(parsed) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fewest = parsed.fewestMovesWin;
  return {
    ...emptyProgress(),
    ...parsed,
    forms: parsed.forms && typeof parsed.forms === "object" ? parsed.forms : {},
    badges: parsed.badges && typeof parsed.badges === "object" ? parsed.badges : {},
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

// Group every badge (T2-T4) by tier for the profile gallery: three groups
// (T2=180, T3=108, T4=36). Within each tier the badges stay clustered by canon
// family (families iterate in canon order) so a family's forms render adjacent.
// Each family cluster carries its apex (T4) key + unlock state so a tap on ANY
// cell opens that family's evo-tree popup (which resolves by apex key only).
export function getBadgeGalleryByTier(progress) {
  const badges = progress?.badges ?? {};
  const groups = [2, 3, 4].map((tier) => ({
    tier,
    label: `T${tier}`,
    collected: 0,
    total: 0,
    families: [],
  }));
  const byTier = new Map(groups.map((g) => [g.tier, g]));
  for (const family of BLUPETS_FAMILIES) {
    const apexForm = (family.forms?.[4] ?? [])[0];
    const apexKey = apexForm?.key ?? apexForm?.name ?? "";
    const apexUnlocked = isBadgeUnlocked(progress, apexKey);
    for (const tier of [2, 3, 4]) {
      const group = byTier.get(tier);
      const cells = [];
      for (const form of family.forms?.[tier] ?? []) {
        const key = form.key ?? form.name;
        const unlocked = isBadgeUnlocked(progress, key);
        cells.push({
          key,
          tier,
          name: form.name,
          asset: form.asset ?? null,
          unlocked,
          count: badges[key] ?? 0,
          threshold: BADGE_THRESHOLDS[tier],
        });
        group.total += 1;
        if (unlocked) group.collected += 1;
      }
      if (cells.length) {
        group.families.push({ familyId: family.id, apexKey, apexUnlocked, cells });
      }
    }
  }
  return groups;
}
