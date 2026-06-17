// Persistent cross-run meta-progression for Blupets Match-3.
// Unlike the per-session leaderboard, this survives every run: a collection of
// every apex (T4) form ever discovered plus lifetime stats. It's the "reason to
// play again" hook — fill the gallery, beat your best.

import { BLUPETS_FAMILIES } from "./blupets-canon-data.js";

const PROGRESS_KEY = "blupets-progress-v1";

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

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...emptyProgress(), ...parsed, forms: parsed.forms ?? {} };
      }
    }
  } catch {
    // Unreadable/legacy storage — start fresh.
  }
  return emptyProgress();
}

function save(progress) {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage unavailable — keep the in-memory copy for this session.
  }
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
