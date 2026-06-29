// Account panel for the profile + meta overlay, extracted from main.js. Pure
// HTML builder. Avatar-upload and edit-name clicks (data-account-action,
// data-avatar-upload) are wired in main.js via event delegation.
import { app } from "./store.js?v=20260629-5";
import { escapeHtml, safeImgSrc } from "./dom-safety.js?v=20260629-1";
import { shortAuthLabel } from "../util/auth-label.js?v=20260629-1";
import { leaderboardRanksForUser, renderProfileStatsPanel } from "./render-profile-stats.js?v=20260629-2";
import { collectionTileCount, TOTAL_INVENTORY_FORMS } from "../progress.js?v=20260628-guest-gating-1";
import { renderOwnBlupetsCollection } from "./render-collection.js?v=20260629-3";

export function renderAccountSection() {
  const signedIn = Boolean(app.authState.user);
  const avatar = safeImgSrc(app.authState.avatarUrl) || "./assets/blu-logo.png";
  const name = signedIn ? shortAuthLabel(app.authState.label) : "Guest";
  const ranks = leaderboardRanksForUser(app.authState.user?.id ?? "");
  const blupetsCount = collectionTileCount(app.progress);
  return `
    <section class="account-panel" aria-label="Account">
      <div class="account-profile">
        <div class="account-avatar-wrap">
          <img class="account-avatar" src="${escapeHtml(avatar)}" alt="" aria-hidden="true" />
          ${signedIn ? `<label class="account-avatar-edit" title="Change avatar" aria-label="Change avatar"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg><input type="file" accept="image/jpeg,image/png,image/webp" hidden data-avatar-upload /></label>` : ""}
        </div>
        <div class="account-name-row">
          <strong>${escapeHtml(name)}</strong>
          ${signedIn ? `<button class="account-name-edit-btn" type="button" data-account-action="edit-name" aria-label="Edit name"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 1.5a2.121 2.121 0 013 3l-9 9L2 14.5l.5-3.5 9-9z"/><line x1="9.5" y1="3.5" x2="12.5" y2="6.5"/></svg></button>` : ""}
        </div>
      </div>
      ${renderProfileStatsPanel({
        bestScore: app.progress.bestScore ?? 0,
        gamesPlayed: Number(app.progress.runs) || 0,
        scoreRank: ranks.score,
        blupetsRank: ranks.blupets,
        blupets: `${blupetsCount}/${TOTAL_INVENTORY_FORMS}`,
        progressValue: blupetsCount,
        progressTotal: TOTAL_INVENTORY_FORMS,
      })}
      ${renderOwnBlupetsCollection()}
    </section>`;
}
