// Capsule/reveal section for the profile + meta overlay, extracted from main.js.
// Pure HTML builders; capsule-button clicks (data-capsule-action) are handled in
// main.js via event delegation. renderCapsulePanel is private to the section.
import { app } from "./store.js?v=20260629-5";
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { SHARDS_PER_CAPSULE } from "../progress.js?v=20260628-guest-gating-1";

function renderCapsulePanel() {
  const capsules = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  const shards = Math.max(0, Math.floor(Number(app.progress.shards) || 0));
  const canExchange = shards >= SHARDS_PER_CAPSULE;
  const ctaTitle = capsules > 0 ? `${capsules} Blupet${capsules === 1 ? "" : "s"} ready` : "No Blupets ready";
  const ctaSub = capsules > 0
    ? (capsules > 1 ? "Tap to reveal all Blupets" : "Tap to reveal your Blupet")
    : "Earn reveals from runs and badges";
  return `
    <section class="capsule-panel" aria-label="Reveal Blupets">
      <button class="run-capsule-summary capsule-inventory-cta" type="button" data-capsule-action="open" data-count="${capsules > 1 ? "all" : "1"}" ${capsules <= 0 ? "disabled" : ""}>
        <span class="run-capsule-icon"><img src="./assets/blocks/origin.svg" alt="" /></span>
        <span class="run-capsule-copy"><strong>${escapeHtml(ctaTitle)}</strong><small>${escapeHtml(ctaSub)}</small></span>
        ${capsules > 0 ? `<span class="run-capsule-arrow" aria-hidden="true">→</span>` : `<span></span>`}
      </button>
      <div class="capsule-secondary">
        <div class="capsule-shards">
          <span>Shards</span>
          <strong>${shards}<small>/${SHARDS_PER_CAPSULE}</small></strong>
        </div>
        <button class="capsule-btn" type="button" data-capsule-action="exchange" ${canExchange ? "" : "disabled"}>Use Shards</button>
      </div>
    </section>`;
}

export function renderCapsulesSection() {
  const capsules = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  const shards = Math.max(0, Math.floor(Number(app.progress.shards) || 0));
  return `
    <section class="capsules-section" aria-label="Reveal Blupets">
      ${renderCapsulePanel()}
      <div class="capsule-info-grid">
        <div class="capsule-info-card">
          <strong>${capsules}</strong>
          <span>Blupets ready</span>
        </div>
        <div class="capsule-info-card">
          <strong>${shards}<small>/${SHARDS_PER_CAPSULE}</small></strong>
          <span>Duplicate shards</span>
        </div>
        <div class="capsule-info-card">
          <strong>${Math.max(0, SHARDS_PER_CAPSULE - shards)}</strong>
          <span>Shards to exchange</span>
        </div>
      </div>
    </section>`;
}
