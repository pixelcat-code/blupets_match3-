// Evolution-tree popup content builder, extracted from main.js. Tapping a form
// card (own or public profile) opens its full evolution line: T1 base color
// pair -> T2 (5) -> T3 (3) -> T4 apex. Own-profile trees unlock by the deepest
// lineage stage reached; public-profile trees only gate the apex by discovery.
// The T1 base pair always renders in full. The open/close controllers and the
// card-tap handler stay in main.js; this module only builds the inner HTML.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { BASE_BLOCK_ASSETS } from "./block-assets.js?v=20260715-cross-trigger-1";
import { COLORS } from "../game.js?v=20260715-cross-trigger-1";

const EVO_COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c]));

function evoNode({ tier, asset, name, locked = false, blockColor = null }) {
  const isLocked = locked;
  const lockIcon = isLocked
    ? `<span class="collection-lock" aria-hidden="true">🔒</span>`
    : "";
  const art = isLocked
    ? `<img class="collection-art-blurred" src="${escapeHtml(asset)}" alt="" aria-hidden="true" />${lockIcon}`
    : `<img src="${escapeHtml(asset)}" alt="${escapeHtml(name)}" />`;
  return `
    <div class="evo-node${isLocked ? " is-locked" : ""}${blockColor ? " evo-node--base" : ""}">
      <span class="evo-tier-tag">${tier}</span>
      <div class="evo-node-art"${blockColor ? ` style="--evo-base:${escapeHtml(blockColor)}"` : ""}>${art}</div>
      <span class="evo-node-name">${isLocked ? "???" : escapeHtml(name)}</span>
    </div>`;
}

// `reachedTier` is the player's deepest tier in this family (0|2|3|4), or 0 for
// the public profile. T1 base pair always renders full. The apex additionally
// respects apexDiscovered so a public profile still gates the apex by discovery.
export function buildEvoTree(family, apexDiscovered, reachedTier = 0) {
  const apex = (family.forms?.[4] ?? [])[0];
  const t3 = family.forms?.[3] ?? [];
  const t2 = family.forms?.[2] ?? [];
  const pair = family.pair ?? [];

  const lockedAt = (tier) => reachedTier < tier;

  const apexHtml = apex
    ? evoNode({ tier: "T4", asset: apex.asset, name: apex.name, locked: !apexDiscovered && lockedAt(4) })
    : "";
  const t3Html = t3.map((f) => evoNode({ tier: "T3", asset: f.asset, name: f.name, locked: lockedAt(3) })).join("");
  const t2Html = t2.map((f) => evoNode({ tier: "T2", asset: f.asset, name: f.name, locked: lockedAt(2) })).join("");
  const t1Html = pair
    .map((colorId) => {
      const c = EVO_COLOR_BY_ID[colorId];
      return evoNode({
        tier: "T1",
        asset: BASE_BLOCK_ASSETS[colorId] ?? BASE_BLOCK_ASSETS.origin,
        name: c?.label ?? colorId,
        blockColor: c?.hex ?? null,
      });
    })
    .join("");

  const headline = apexDiscovered && apex ? escapeHtml(apex.name) : escapeHtml(family.name);
  return `
    <div class="evo-kicker">Evolution line</div>
    <h2 class="evo-title" id="evoTreeTitle">${headline}</h2>
    <div class="evo-tier evo-tier--apex">${apexHtml}</div>
    <div class="evo-link" aria-hidden="true"></div>
    <div class="evo-tier">${t3Html}</div>
    <div class="evo-link" aria-hidden="true"></div>
    <div class="evo-tier">${t2Html}</div>
    <div class="evo-link" aria-hidden="true"></div>
    <div class="evo-tier evo-tier--base">${t1Html}</div>
  `;
}
