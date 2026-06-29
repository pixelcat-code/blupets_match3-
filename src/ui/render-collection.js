// Blupets collection-grid rendering, extracted from main.js.
//
// Builds the tier-grouped collection grid shown on the own-profile and
// public-profile screens. `renderCollectionCard` is private — only the two grid
// builders use it. The own-grid reads the live collection from app.progress;
// the public-grid takes a plain collectionTiles map so it can render any user.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { app } from "./store.js?v=20260629-5";
import {
  getAscendedKeyByFormKey,
  getCollectionTileEntries,
  collectionTileCount,
  COLLECTION_TIERS,
  COLLECTION_TIER_LABEL,
  TOTAL_INVENTORY_FORMS,
  SHARDS_PER_CAPSULE,
} from "../progress.js?v=20260628-guest-gating-1";
import { renderCollectionProgress } from "./render-profile-stats.js?v=20260629-1";

function renderCollectionCard(entry, { apex = false } = {}) {
  const apexKey = apex ? entry.key : getAscendedKeyByFormKey(entry.key) ?? entry.key;
  return `
    <div class="collection-card ${entry.discovered ? "is-owned" : "is-locked"}" data-tier="${escapeHtml(entry.tier ?? "ascended")}" data-form-key="${escapeHtml(entry.key)}" data-apex-key="${escapeHtml(apexKey)}" data-discovered="${entry.discovered ? "1" : ""}" aria-label="${escapeHtml(entry.discovered ? entry.name : "Undiscovered Blupet")}">
      <div class="collection-art">
        ${
          entry.discovered
            ? `<img src="${escapeHtml(entry.asset)}" alt="${escapeHtml(entry.name)}" loading="lazy" decoding="async" />`
            : `<img class="collection-art-blurred" src="${escapeHtml(entry.asset)}" alt="" aria-hidden="true" loading="lazy" decoding="async" /><span class="collection-lock" aria-hidden="true">🔒</span>`
        }
      </div>
      <span class="collection-name">${entry.discovered ? escapeHtml(entry.name) : "Locked"}</span>
    </div>
  `;
}

export function renderOwnBlupetsCollection() {
  const entries = getCollectionTileEntries(app.progress);
  const sections = COLLECTION_TIERS.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.tier === tier);
    const discovered = tierEntries.filter((entry) => entry.discovered).length;
    return `
      <section class="collection-tier" data-tier="${escapeHtml(tier)}">
        <div class="collection-tier-head">
          <h3>${escapeHtml(COLLECTION_TIER_LABEL[tier] ?? tier)}</h3>
          <span>${discovered}/${tierEntries.length}</span>
        </div>
        <div class="collection-grid">${tierEntries.map((entry) => renderCollectionCard(entry)).join("")}</div>
      </section>`;
  }).join("");
  return `<section class="profile-blupets" aria-label="Blupets collection">${sections}</section>`;
}

export function renderPublicBlupetsCollection(collectionTiles) {
  const entries = getCollectionTileEntries({ collectionTiles });
  const sections = COLLECTION_TIERS.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.tier === tier);
    const discovered = tierEntries.filter((entry) => entry.discovered).length;
    return `
      <section class="collection-tier" data-tier="${escapeHtml(tier)}">
        <div class="collection-tier-head">
          <h3>${escapeHtml(COLLECTION_TIER_LABEL[tier] ?? tier)}</h3>
          <span>${discovered}/${tierEntries.length}</span>
        </div>
        <div class="collection-grid">${tierEntries.map((entry) => renderCollectionCard(entry)).join("")}</div>
      </section>`;
  }).join("");
  return `<section class="profile-blupets" aria-label="Blupets collection">${sections}</section>`;
}

// Capsule/shard shelf shown atop the own-profile collection grid. Buttons carry
// data-capsule-action attributes; the click handler lives in main.js via event
// delegation, so this stays a pure HTML builder. Private to renderCollectionGrid.
function renderCollectionCapsuleShelf() {
  const capsules = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  const shards = Math.max(0, Math.floor(Number(app.progress.shards) || 0));
  const canExchange = shards >= SHARDS_PER_CAPSULE;
  const readyLabel = capsules > 0 ? `${capsules} ready` : "No Blupets";
  const openLabel = capsules > 1 ? "Reveal All" : "Reveal";
  return `
    <section class="collection-capsule-shelf${capsules > 0 ? " has-capsules" : ""}" aria-label="Reveal Blupets">
      <div class="collection-capsule-copy">
        <span class="collection-capsule-icon" aria-hidden="true"><img src="./assets/blocks/origin.svg" alt="" /></span>
        <div>
          <strong>Reveal Blupets</strong>
          <small>${escapeHtml(readyLabel)} · ${shards}/${SHARDS_PER_CAPSULE} shards</small>
        </div>
      </div>
      <div class="collection-capsule-actions">
        <button class="capsule-btn" type="button" data-capsule-action="open" data-count="${capsules > 1 ? "all" : "1"}" ${capsules <= 0 ? "disabled" : ""}>${openLabel}</button>
        <button class="capsule-btn capsule-btn--ghost" type="button" data-capsule-action="exchange" ${canExchange ? "" : "disabled"}>Use Shards</button>
      </div>
    </section>`;
}

// Tier-grouped own-profile collection grid: capsule shelf + progress bar + one
// section per collection tier. Distinct from renderOwnBlupetsCollection (the
// flatter public/own gallery); this is the detailed in-profile view.
export function renderCollectionGrid() {
  const entries = getCollectionTileEntries(app.progress);
  const card = (entry) => {
    const apexKey = getAscendedKeyByFormKey(entry.key) ?? entry.key;
    return `
      <div class="collection-card ${entry.discovered ? "is-owned" : "is-locked"}" data-tier="${escapeHtml(entry.tier)}" data-form-key="${escapeHtml(entry.key)}" data-apex-key="${escapeHtml(apexKey)}" data-discovered="${entry.discovered ? "1" : ""}" aria-label="${escapeHtml(entry.discovered ? entry.name : "Undiscovered form")}">
        <div class="collection-art">
          ${
            entry.discovered
              ? `<img src="${escapeHtml(entry.asset)}" alt="${escapeHtml(entry.name)}" loading="lazy" decoding="async" />`
              : `<img class="collection-art-blurred" src="${escapeHtml(entry.asset)}" alt="" aria-hidden="true" loading="lazy" decoding="async" /><span class="collection-lock" aria-hidden="true">🔒</span>`
          }
        </div>
        <span class="collection-name">${entry.discovered ? escapeHtml(entry.name) : "Locked"}</span>
      </div>
    `;
  };
  const sections = COLLECTION_TIERS.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.tier === tier);
    const discovered = tierEntries.filter((entry) => entry.discovered).length;
    return `
      <section class="collection-tier" data-tier="${escapeHtml(tier)}">
        <div class="collection-tier-head">
          <h3>${escapeHtml(COLLECTION_TIER_LABEL[tier] ?? tier)}</h3>
          <span>${discovered}/${tierEntries.length}</span>
        </div>
        <div class="collection-grid">${tierEntries.map(card).join("")}</div>
      </section>`;
  }).join("");
  return `
    <div class="collection-tiers">
      ${renderCollectionCapsuleShelf()}
      ${renderCollectionProgress(collectionTileCount(app.progress), TOTAL_INVENTORY_FORMS, "Blupets", "Blupets opened")}
      ${sections}
    </div>`;
}
