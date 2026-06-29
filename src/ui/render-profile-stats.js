// Profile/leaderboard stats presentation, extracted from main.js.
//
// These build the stat banners and rank lookups shared by the own-profile and
// public-profile screens. They are presentation-only: the metrics come in as
// arguments (renderProfileStatsPanel) or are derived from the shared store
// (leaderboardRanksForUser reads app.remoteLeaderboard). `rankText` is private —
// only the stats panel formats ranks.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { app } from "./store.js?v=20260629-5";

export function renderCollectionProgress(discovered, total, label = "Collection", ariaLabel = "Collection Blupets opened") {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((discovered / total) * 100))) : 0;
  const complete = total > 0 && discovered >= total;
  return `
    <div class="collection-progress${complete ? " is-complete" : ""}">
      <div class="cp-head">
        <span class="cp-label">${escapeHtml(label)}</span>
        <span class="cp-count"><strong>${discovered}</strong><span class="cp-total">/ ${total}</span></span>
      </div>
      <div class="cp-track" role="progressbar" aria-valuenow="${discovered}" aria-valuemin="0" aria-valuemax="${total}" aria-label="${escapeHtml(ariaLabel)}">
        <div class="cp-fill" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

export function leaderboardRanksForUser(userId) {
  if (!userId) return { score: null, blupets: null };
  const entries = Array.isArray(app.remoteLeaderboard) ? app.remoteLeaderboard : [];
  const dedup = (arr, better) => [...arr.reduce((m, e) => {
    if (!e?.userId) return m;
    if (!m.has(e.userId) || better(e, m.get(e.userId))) m.set(e.userId, e);
    return m;
  }, new Map()).values()];
  const scoreRows = dedup(entries, (a, b) => a.score > b.score || (a.score === b.score && a.movesUsed < b.movesUsed))
    .sort((left, right) => right.score - left.score || left.movesUsed - right.movesUsed);
  const blupetsRows = dedup(
    entries,
    (a, b) => (Number(a.blupetsCount) || 0) > (Number(b.blupetsCount) || 0) ||
      ((Number(a.blupetsCount) || 0) === (Number(b.blupetsCount) || 0) && a.score > b.score),
  )
    .sort((left, right) =>
      (Number(right.blupetsCount) || 0) - (Number(left.blupetsCount) || 0) ||
      right.score - left.score);
  return {
    score: scoreRows.findIndex((entry) => entry.userId === userId) + 1 || null,
    blupets: blupetsRows.findIndex((entry) => entry.userId === userId) + 1 || null,
  };
}

function rankText(rank) {
  return rank ? `#${rank}` : "-";
}

export function renderProfileStatsPanel({
  bestScore,
  gamesPlayed,
  scoreRank,
  blupetsRank,
  blupets,
  progressValue,
  progressTotal,
}) {
  const stat = (label, value, tone = "") => `
    <div class="profile-metric${tone ? ` profile-metric--${tone}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>`;
  return `
    <div class="profile-metrics">
      ${stat("Best Score", bestScore ?? 0, "gold")}
      ${stat("Games Played", gamesPlayed ?? 0, "violet")}
      ${stat("All Time Rank", rankText(scoreRank), "blue")}
      ${stat("Blupets Rank", rankText(blupetsRank), "pink")}
      ${stat("Blupets", blupets ?? `${progressValue}/${progressTotal}`, "cyan")}
    </div>
  `;
}
