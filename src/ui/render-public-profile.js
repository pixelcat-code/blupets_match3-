// Public-profile rendering, extracted from main.js.
//
// Three entry points share one HTML builder:
// - renderPublicProfile() writes the stats panel + collection into the
//   dedicated #public-profile screen (own or another player's read-only view).
// - renderPublicProfileHtml() is the pure HTML builder ({ stats, content }),
//   also reused directly by the start-screen meta overlay.
// - renderMetaPublicProfileContent() wraps the builder for the meta overlay,
//   reading the in-flight app.metaPublicProfile view-state.
import { app } from "./store.js?v=20260629-5";
import { elements } from "./dom.js?v=20260629-1";
import { collectionTileCount, TOTAL_INVENTORY_FORMS } from "../progress.js?v=20260628-guest-gating-1";
import { leaderboardRanksForUser, renderProfileStatsPanel } from "./render-profile-stats.js?v=20260629-2";
import { renderPublicBlupetsCollection } from "./render-collection.js?v=20260705-1";

export function renderPublicProfile(entries, isSelf = false, userId = "", storedCollectionTiles = null) {
  if (app.currentScreen !== "public-profile") return;
  const html = renderPublicProfileHtml(entries, isSelf, userId, storedCollectionTiles);
  if (elements.publicProfileScreen) {
    const sectionHead = elements.publicProfileScreen.querySelector(".profile-section-head");
    if (sectionHead) {
      let statsBlock = elements.publicProfileScreen.querySelector(".profile-stats");
      if (!statsBlock) {
        statsBlock = document.createElement("div");
        statsBlock.className = "profile-stats";
        sectionHead.before(statsBlock);
      }
      statsBlock.innerHTML = html.stats;
    }
  }
  if (elements.publicProfileContent) {
    elements.publicProfileContent.innerHTML = html.content;
  }
}

export function renderPublicProfileHtml(entries, isSelf = false, userId = "", storedCollectionTiles = null) {
  let bestScore = entries.reduce((m, e) => Math.max(m, e.score || 0), 0);
  let gamesPlayed = entries.length;

  // Primary: user_progress.progress.collectionTiles (full capsule + win collection).
  // Secondary: union of collection_tiles stored with each submitted run.
  // Last resort: t4FormKey from older entries.
  const publicCollectionTiles = {};
  if (storedCollectionTiles && typeof storedCollectionTiles === "object") {
    for (const key of Object.keys(storedCollectionTiles)) {
      publicCollectionTiles[key] = true;
    }
  } else {
    let hasStoredTiles = false;
    for (const e of entries) {
      if (e.collectionTiles && typeof e.collectionTiles === "object") {
        hasStoredTiles = true;
        for (const key of Object.keys(e.collectionTiles)) {
          publicCollectionTiles[key] = true;
        }
      }
    }
    if (!hasStoredTiles) {
      for (const e of entries) {
        if (!e.t4FormKey || e.t4FormKey === "RUN_COMPLETE") continue;
        publicCollectionTiles[e.t4FormKey] = true;
      }
    }
  }

  // For own profile, merge the full local collection so capsule unlocks and any
  // forms won since the last submitted run appear immediately.
  if (isSelf) {
    for (const key of Object.keys(app.progress.collectionTiles ?? {})) {
      publicCollectionTiles[key] = true;
    }
    for (const key of Object.keys(app.progress.forms ?? {})) {
      publicCollectionTiles[key] = true;
    }
    bestScore = Math.max(bestScore, app.progress.bestScore ?? 0);
    gamesPlayed = Math.max(gamesPlayed, Number(app.progress.runs) || 0);
  }

  const entryBlupetsCount = entries.reduce((max, e) => Math.max(max, Number(e.blupetsCount) || 0), 0);
  const publicBlupetsCount = isSelf
    ? Math.max(Object.keys(publicCollectionTiles).length, entryBlupetsCount, collectionTileCount(app.progress))
    : Math.max(Object.keys(publicCollectionTiles).length, entryBlupetsCount);
  const ranks = leaderboardRanksForUser(userId);
  return {
    stats: renderProfileStatsPanel({
      bestScore,
      gamesPlayed,
      scoreRank: ranks.score,
      blupetsRank: ranks.blupets,
      blupets: `${publicBlupetsCount}/${TOTAL_INVENTORY_FORMS}`,
      progressValue: publicBlupetsCount,
      progressTotal: TOTAL_INVENTORY_FORMS,
    }),
    content: renderPublicBlupetsCollection(publicCollectionTiles),
  };
}

export function renderMetaPublicProfileContent() {
  if (!app.metaPublicProfile || app.metaPublicProfile.loading) {
    return `<div class="leaderboard-empty">Loading profile…</div>`;
  }
  if (app.metaPublicProfile.error) {
    return `<div class="leaderboard-empty">Could not load profile.</div>`;
  }
  return renderPublicProfileHtml(
    app.metaPublicProfile.entries ?? [],
    Boolean(app.authState.user && app.metaPublicProfile.userId === app.authState.user.id),
    app.metaPublicProfile.userId,
    app.metaPublicProfile.storedCollectionTiles ?? null,
  ).content;
}
