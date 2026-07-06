// Capsule-reveal results builder, extracted from main.js. Pure HTML over the
// reveal-result list (each { opened, duplicate, tier, tile }). The reveal modal
// open/close flow and the actual capsule-opening logic stay in main.js; this
// module only paints the prize layout. revealGridColumns is private.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";

function revealGridColumns(count) {
  const total = Math.max(1, Math.floor(Number(count) || 1));
  if (total <= 4) return total;
  if (total <= 10) return Math.ceil(total / 2);
  if (total <= 18) return Math.ceil(total / 3);
  return Math.ceil(total / 4);
}

export function renderCapsuleRevealOutput(results) {
  const items = results.filter((result) => result?.opened);
  if (!items.length) return "";
  const columns = revealGridColumns(items.length);
  const confetti = `
    <div class="capsule-reveal-confetti" aria-hidden="true">
      ${Array.from({ length: 24 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}
    </div>`;
  const card = (result) => `
    <div class="capsule-reveal-prize ${result.duplicate ? "is-duplicate" : "is-new"}" data-tier="${escapeHtml(result.tier)}">
      <div class="capsule-reveal-prize-glow" aria-hidden="true"></div>
      <div class="capsule-reveal-art">
        <img src="${escapeHtml(result.tile.asset)}" alt="${escapeHtml(result.tile.name)}" />
      </div>
      <strong>${escapeHtml(result.tile.name)}</strong>
      ${result.duplicate ? `<span class="capsule-reveal-shard">+1 shard</span>` : `<span class="capsule-reveal-new">New</span>`}
    </div>`;
  if (items.length === 1) {
    const result = items[0];
    return `
      <div class="capsule-reveal-results">
        <div class="capsule-reveal-color-glow" aria-hidden="true"></div>
        ${confetti}
        <div class="capsule-reveal-single" data-tier="${escapeHtml(result.tier)}">
          <div class="capsule-reveal-rings" aria-hidden="true"></div>
          <div class="capsule-reveal-single-art">
            <img src="${escapeHtml(result.tile.asset)}" alt="${escapeHtml(result.tile.name)}" />
          </div>
          <h2>${escapeHtml(result.tile.name)}</h2>
        </div>
      </div>`;
  }
  return `
    <div class="capsule-reveal-results">
      <div class="capsule-reveal-color-glow" aria-hidden="true"></div>
      ${confetti}
      <div class="capsule-reveal-grid" style="--reveal-count:${items.length};--reveal-cols:${columns}">
        ${items.map(card).join("")}
      </div>
    </div>`;
}
