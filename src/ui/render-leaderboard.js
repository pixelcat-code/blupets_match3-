// Leaderboard screen rendering, extracted from main.js.
//
// `renderLeaderboard` paints the leaderboard screen's meta-nav, category tabs,
// and ranked rows. It reads the leaderboard view-state from the shared store
// (app.remoteLeaderboard / leaderboardStatus / leaderboardTab) rather than
// module globals, so the cluster moves out of main.js cleanly. `colorLabel` is
// private here — only the row builder uses it.
import { app } from "./store.js?v=20260629-5";
import { elements } from "./dom.js?v=20260629-1";
import { escapeHtml, safeImgSrc } from "./dom-safety.js?v=20260629-1";
import { renderMetaNav } from "./render-meta.js?v=20260706-navorder-1";
import { getColor } from "../game.js?v=20260715-cross-trigger-1";
import { TOTAL_INVENTORY_FORMS } from "../progress.js?v=20260628-guest-gating-1";
import { renderTabHero } from "./render-tab-hero.js?v=20260706-hero-unify-1";

// Defensive color lookup for persisted leaderboard entries: a legacy or partial
// record (missing/renamed color field) must not crash the whole list render.
function colorLabel(id) {
  return getColor(id)?.label ?? "Unknown";
}

export function renderLeaderboardContent({ tabsHost, content, back = false }) {
  if (!content) return;
  const entries = app.remoteLeaderboard;

  const toRow = (entry, index, value, title) => ({
    rank: index + 1,
    userId: entry.userId ?? "",
    account: escapeHtml(entry.accountName || "Guest"),
    avatarUrl: safeImgSrc(entry.avatarUrl || ""),
    title,
    value,
  });

  // Dedup independently per section so a collection-heavy run isn't hidden by a higher-score run.
  const dedup = (arr, better) => [...arr.reduce((m, e) => {
    if (!m.has(e.userId) || better(e, m.get(e.userId))) m.set(e.userId, e);
    return m;
  }, new Map()).values()];

  const sortByScore = dedup(entries, (a, b) => a.score > b.score || (a.score === b.score && a.movesUsed < b.movesUsed))
    .sort((left, right) => right.score - left.score || left.movesUsed - right.movesUsed)
    .slice(0, 100)
    .map((entry, index) => toRow(
      entry, index,
      `${entry.score}`,
      `${colorLabel(entry.t4Color)} + ${colorLabel(entry.t4Partner)}`,
    ));

  const sortByBlupets = dedup(
    entries.filter((entry) => entry.collectionTrusted),
    (a, b) => (Number(a.blupetsCount) || 0) > (Number(b.blupetsCount) || 0) ||
      ((Number(a.blupetsCount) || 0) === (Number(b.blupetsCount) || 0) && a.score > b.score),
  )
    .sort((left, right) =>
      (Number(right.blupetsCount) || 0) - (Number(left.blupetsCount) || 0) ||
      right.score - left.score)
    .slice(0, 100)
    .map((entry, index) => toRow(
      entry, index,
      `${Number(entry.blupetsCount) || 0}/${TOTAL_INVENTORY_FORMS}`,
      `Best score ${entry.score}`,
    ));

  const emptyMsg =
    app.leaderboardStatus === "loading"
      ? "Loading leaderboard…"
      : app.leaderboardStatus === "error"
        ? "Couldn’t load the leaderboard. Check your connection and reopen to retry."
        : "No scores yet — win a run to claim the first spot.";

  const renderRows = (rows) =>
    rows.length === 0
      ? `<div class="leaderboard-empty">${escapeHtml(emptyMsg)}</div>`
      : rows
          .map((row) => {
            const tierClass =
              row.rank <= 3 ? ` is-top3 is-rank${row.rank}` : row.rank <= 10 ? " is-top10" : "";
            const rankCell =
              row.rank <= 3
                ? `<span class="leaderboard-medal" aria-hidden="true">${row.rank}</span><span class="sr-only">Rank ${row.rank}</span>`
                : `#${row.rank}`;
            const avatar = row.avatarUrl
              ? `<img class="leaderboard-avatar" src="${escapeHtml(row.avatarUrl)}" alt="" aria-hidden="true" />`
              : `<span class="leaderboard-avatar leaderboard-avatar--placeholder" aria-hidden="true"></span>`;
            const userBtn = row.userId
              ? `<button class="leaderboard-user-btn" type="button" data-user-id="${escapeHtml(row.userId)}" data-account="${row.account}" data-avatar="${escapeHtml(row.avatarUrl)}" aria-label="View ${row.account}'s profile">${avatar}<div class="leaderboard-user"><span class="leaderboard-title">${row.account}</span><span class="leaderboard-meta">${escapeHtml(row.title)}</span></div></button>`
              : `${avatar}<div class="leaderboard-user"><span class="leaderboard-title">${row.account}</span><span class="leaderboard-meta">${escapeHtml(row.title)}</span></div>`;
            return `
              <div class="leaderboard-row${tierClass}">
                <div class="leaderboard-rank">${rankCell}</div>
                ${userBtn}
                <div class="leaderboard-value">${escapeHtml(row.value)}</div>
              </div>
            `;
          })
          .join("");

  const tab = (id, label) =>
    `<button class="leaderboard-tab${app.leaderboardTab === id ? " is-active" : ""}" type="button" role="tab" data-tab="${id}" aria-selected="${app.leaderboardTab === id ? "true" : "false"}">${label}</button>`;

  if (tabsHost) {
    tabsHost.innerHTML = `
      ${renderTabHero("leaderboard", { back })}
      <div class="leaderboard-tabs" role="tablist" aria-label="Leaderboard category">
        ${tab("score", "Score")}
        ${tab("blupets", "Blupets")}
      </div>
    `;
  }

  const activeRows = app.leaderboardTab === "blupets" ? sortByBlupets : sortByScore;

  content.innerHTML = `
    <section class="leaderboard-column leaderboard-column--active" data-col="${app.leaderboardTab}">
      <div class="leaderboard-list">
        ${renderRows(activeRows)}
      </div>
    </section>
  `;
}

export function renderLeaderboard() {
  if (app.currentScreen !== "leaderboard") {
    return;
  }
  renderMetaNav(elements.leaderboardMetaNav, "rank");
  renderLeaderboardContent({
    tabsHost: elements.leaderboardTabsHost,
    content: elements.leaderboardContent,
    back: true,
  });
}
