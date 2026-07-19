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
import { TOTAL_INVENTORY_FORMS } from "../progress.js?v=20260628-guest-gating-1";
import { leaderboardRanksForUser, renderProfileStatsPanel } from "./render-profile-stats.js?v=20260629-2";
import { renderPublicBlupetsCollection } from "./render-collection.js?v=20260719-blupets-unify-1";
import { buildPublicCollectionSnapshot } from "../util/collection-source.js?v=20260711-1";

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

  // Public collection comes exclusively from replay-verified forms. The owner's
  // local capsule inventory is merged only into their own private profile view.
  // The owner's capsule collection is an optimistic cache of the same server
  // source. Run-win `forms` are deliberately not part of this calculation.
  if (isSelf) {
    bestScore = Math.max(bestScore, app.progress.bestScore ?? 0);
    gamesPlayed = Math.max(gamesPlayed, Number(app.progress.runs) || 0);
  }

  const entryBlupetsCount = entries.reduce((max, e) => Math.max(max, Number(e.blupetsCount) || 0), 0);
  const { tiles: publicCollectionTiles, count: publicBlupetsCount } = buildPublicCollectionSnapshot({
    storedCollectionTiles,
    entryCollections: entries.map((entry) => entry.collectionTiles),
    fallbackFormKeys: entries
      .filter((entry) => entry.collectionTrusted)
      .map((entry) => entry.t4FormKey),
    localCollectionTiles: isSelf ? app.progress.collectionTiles : null,
    entryCount: entryBlupetsCount,
  });
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
