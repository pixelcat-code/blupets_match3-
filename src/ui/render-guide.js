// Static game-guide panel, extracted from main.js. Fully self-contained — the
// only dependency is escapeHtml. Shown on the dedicated guide screen and inside
// the start-screen meta overlay's "guide" section.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { renderTabHero } from "./render-tab-hero.js?v=20260719-blupets-unify-1";

export function renderGuideSection({ back = false } = {}) {
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
      ${renderTabHero("guide", { back })}

      <section class="guide-match-panel" aria-label="Match patterns">
        ${matchChip(3, "Match 3")}
        ${matchChip(4, "Cross", "./assets/blocks/green.svg")}
        ${matchChip(5, "Bomb", "./assets/blocks/red.svg")}
      </section>

      <div class="guide-grid">
        ${section("Goal", "★", [
        "Match tiles, build score, and evolve Blupets through their lineage",
        "A strong run reaches Ascended forms and earns leaderboard-ready results",
        "Every run can still add lifetime progress, quests, Blupets, or shards",
        ])}
        ${section("How To Play", "↔", [
        "Swap adjacent tiles to make matches of 3 or more",
        "Valid swaps consume moves and resolve cascades automatically",
        "Larger matches and cascades increase score and can create special tiles",
        "A run continues until your moves run out — reaching Ascended is a milestone, not the end",
        ])}
        ${section("Run Vibe", "◈", [
        "Every run rolls a vibe bonus, revealed before you touch the board",
        "Vibes can change essence gain, moves, decay, or how score is earned",
        "Play into the vibe you rolled to push the run further",
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
        "Score thresholds and milestone quests award Blupets",
        "Reveal Blupets to add collection forms",
        "Duplicate Blupets become shards, and shards can be exchanged for more Blupets",
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
          <small>Duplicates become shards, shards exchange back into more Blupets.</small>
        </div>
      </section>
    </div>`;
}
