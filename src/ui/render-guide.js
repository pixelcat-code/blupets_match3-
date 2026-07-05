// Static game-guide panel, extracted from main.js. Fully self-contained — the
// only dependency is escapeHtml. Shown on the dedicated guide screen and inside
// the start-screen meta overlay's "guide" section.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";

export function renderGuideSection({ back = false } = {}) {
  const backBtn = back
    ? `<button class="tab-hero-back" type="button" data-hero-back aria-label="Back">←</button>`
    : "";
  const section = (title, icon, items) => `
    <section class="guide-section">
      <div class="guide-section-head">
        <span class="guide-section-icon" aria-hidden="true">${icon}</span>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>`;
  const matchChip = (count, label, asset = "./assets/blocks/cyan.svg") => `
    <div class="guide-match-chip">
      <span class="guide-match-row" aria-hidden="true">
        ${Array.from({ length: count }, () => `<img src="${asset}" alt="" />`).join("")}
      </span>
      <strong>${escapeHtml(label)}</strong>
    </div>`;
  return `
    <div class="guide-panel" aria-label="Game guide">
      <section class="guide-hero">
        ${backBtn}
        <div class="guide-hero-art" aria-hidden="true">
          <span class="guide-hero-glow"></span>
          <img class="guide-hero-capsule" src="./assets/blocks/origin.svg" alt="" />
          <img class="guide-hero-block guide-hero-block--one" src="./assets/blocks/blue.svg" alt="" />
          <img class="guide-hero-block guide-hero-block--two" src="./assets/blocks/yellow.svg" alt="" />
          <img class="guide-hero-block guide-hero-block--three" src="./assets/blocks/purple.svg" alt="" />
        </div>
        <div class="guide-hero-copy">
          <strong>Match, evolve, collect</strong>
        <span>Build strong runs, reveal Blupets, and turn duplicates into collection progress.</span>
        </div>
      </section>

      <section class="guide-match-panel" aria-label="Match patterns">
        ${matchChip(3, "Match 3")}
        ${matchChip(4, "Cross", "./assets/blocks/green.svg")}
        ${matchChip(5, "Bomb", "./assets/blocks/red.svg")}
      </section>

      <div class="guide-grid">
        ${section("Goal", "★", [
        "Match tiles, build score, and evolve Blupets through their lineage",
        "A strong run reaches Ascended forms and earns leaderboard-ready results",
        "Every run can still add lifetime progress, quests, reveals, or shards",
        ])}
        ${section("How To Play", "↔", [
        "Swap adjacent tiles to make matches of 3 or more",
        "Valid swaps consume moves and resolve cascades automatically",
        "Larger matches and cascades increase score and can create special tiles",
        ])}
        ${section("Evolution", "◆", [
        "Matching a color fills essence for that color",
        "When essence reaches the threshold, choose a partner color or form",
        "Different starting colors can evolve into the same form, and those matching forms can be matched together",
        ])}
        ${section("Special Tiles", "✦", [
        "Four-in-a-row can create a cross clear",
        "Five-in-a-row and L or T shapes can create bombs",
        "Special clears count toward quests and make high-score runs easier",
        ])}
        ${section("Rewards", "●", [
        "Score thresholds and milestone quests award Blupet reveals",
        "Reveal Blupets to add collection forms",
        "Duplicate reveals become shards, and shards can be exchanged for more reveals",
        ])}
        ${section("Quests And Leaderboard", "#", [
        "Quests track collection, colors, specials, combos, score, and endurance",
        "Completed quests move to the bottom so active goals stay visible",
        "Leaderboard has All Time score and Blupets collection rankings",
        ])}
      </div>

      <section class="guide-reward-strip">
        <span class="guide-reward-icon" aria-hidden="true"><img src="./assets/blocks/origin.svg" alt="" /></span>
        <div>
          <strong>Reveal Blupets</strong>
          <small>Duplicates become shards, shards exchange back into more reveals.</small>
        </div>
      </section>
    </div>`;
}
