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

function emptyProgress() {
  return { forms: {}, runs: 0, wins: 0, bestScore: 0, fewestMovesWin: null };
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
