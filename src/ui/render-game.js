// In-game HUD rendering, extracted from main.js.
//
// These are the four render functions that paint the game screen's chrome from
// a game-state-like object: the top bar (moves/score), the color roster rings,
// the vibe strip, and the status line. Each takes `stateLike` as an argument —
// it does NOT read app state through a module global — so the cluster is pure
// with respect to the controller's mutable state and could be unit-tested in
// isolation against a fabricated state.
//
// getLeaderColorId is exported because main.js's victory/share builders also
// rank the leading color.
import { elements } from "./dom.js?v=20260629-1";
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { getBlockAsset } from "./block-assets.js?v=20260717-special-spawn-1";
import {
  COLORS,
  getProgressPercent,
} from "../game.js?v=20260717-special-spawn-1";

// The leading color this run: highest evolution tier, then most matches, then
// alphabetical as a stable tiebreak. Drives the roster emphasis and the
// victory/share card color.
export function getLeaderColorId(stateLike) {
  return [...COLORS]
    .sort((left, right) => {
      const tierDelta = stateLike.evolutionTiers[right.id] - stateLike.evolutionTiers[left.id];
      if (tierDelta !== 0) {
        return tierDelta;
      }

      const progressDelta =
        stateLike.colorMatchCounts[right.id] - stateLike.colorMatchCounts[left.id];
      if (progressDelta !== 0) {
        return progressDelta;
      }

      return left.label.localeCompare(right.label);
    })[0]?.id;
}

let _scoreBumpTimer = null;
let _prevScore = 0;

// Reset the score-pop baseline so the first score render of a new run doesn't
// fire the climb animation against the previous run's total. Called by main.js
// at run start (the `_prevScore` it used to set directly now lives here).
export function resetScoreBaseline() {
  _prevScore = 0;
}

export function renderTopBar(stateLike) {
  elements.movesValue.textContent = String(stateLike.movesLeft);
  const scoreText = String(stateLike.score);
  // Pop the score pill for a beat whenever the total climbs.
  if (typeof stateLike.score === "number" && stateLike.score > _prevScore) {
    const scorePill = elements.scoreValue.closest(".stat-pill--score");
    if (scorePill) {
      scorePill.classList.remove("is-bump");
      void scorePill.offsetWidth; // restart the animation
      scorePill.classList.add("is-bump");
      clearTimeout(_scoreBumpTimer);
      _scoreBumpTimer = setTimeout(() => scorePill.classList.remove("is-bump"), 440);
    }
  }
  _prevScore = typeof stateLike.score === "number" ? stateLike.score : _prevScore;
  elements.scoreValue.textContent = scoreText;
  // Long scores (6+ digits) overflow the fixed-width score pill and clip under
  // its `overflow: hidden`. Expose the digit count so CSS can scale the number
  // down to fit instead of cropping it.
  elements.scoreValue.dataset.len = String(scoreText.length);
  elements.backToStart.disabled = false;

  // Low-moves warning: tint the Moves number amber when it's getting tight and
  // red when it's critical (replaces the old progress meter).
  const movesRemaining = Math.max(0, stateLike.movesLeft ?? 0);
  const movesPill = elements.movesValue.closest(".stat-pill--moves");
  if (movesPill) {
    movesPill.classList.toggle("is-danger", movesRemaining <= 3);
    movesPill.classList.toggle("is-warning", movesRemaining > 3 && movesRemaining <= 6);
  }
}

// Compact "activity rings" roster: one conic-gradient progress ring per color
// wrapped around that color's current form SVG, the leading color emphasised.
// Built once, then updated in place so the @property --pct fill animates
// smoothly (incl. the downward sweep when a fusion decays the others).
export function renderColorRoster(stateLike) {
  const host = elements.colorRoster;
  if (!host) {
    return;
  }

  if (!host.childElementCount) {
    host.innerHTML = COLORS.map(
      (color) => `
      <div class="roster-item" data-color="${color.id}" role="listitem" title="${escapeHtml(color.label)}">
        <div class="roster-ring">
          <img class="roster-art" alt="" />
          <span class="roster-tier" aria-hidden="true"></span>
        </div>
      </div>`,
    ).join("");
  }

  const leaderColorId = getLeaderColorId(stateLike);
  host.classList.toggle("is-evolve", stateLike.pendingEvolutionQueue.length > 0);
  for (const color of COLORS) {
    const item = host.querySelector(`[data-color="${color.id}"]`);
    if (!item) {
      continue;
    }
    const tier = stateLike.evolutionTiers[color.id];
    const isMax = tier >= 4;
    const pct = isMax ? 100 : getProgressPercent(stateLike, color.id);
    const ring = item.querySelector(".roster-ring");
    ring.style.setProperty("--ring-color", color.hex);
    ring.style.setProperty("--pct", String(pct));
    const art = item.querySelector(".roster-art");
    const nextSrc = getBlockAsset(color.id, stateLike);
    if (art.getAttribute("src") !== nextSrc) {
      art.setAttribute("src", nextSrc);
    }
    const tierBadge = item.querySelector(".roster-tier");
    if (tierBadge) {
      tierBadge.textContent = tier > 1 ? `T${tier}` : "";
    }
    item.style.setProperty("--roster-color", color.hex);
    item.classList.toggle("is-leader", color.id === leaderColorId);
    item.classList.toggle("is-evolved", tier > 1);
    item.classList.toggle("is-max", isMax);
  }
}

// Compact per-run vibe readout in the footer: name + the bonus blurb that used
// to sit on the now-removed leader chip, so players keep seeing their perks.
export function renderVibeStrip(stateLike) {
  const strip = elements.vibeStrip;
  if (!strip) {
    return;
  }
  const vibe = stateLike.vibe;
  if (!vibe) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  elements.vibeStripName.textContent = vibe.label;
  elements.vibeStripPerks.textContent = vibe.blurb || "No extra perks";
}

export function renderStatus(stateLike) {
  if (!elements.statusText) return;
  elements.statusText.textContent = "";
  elements.statusText.hidden = true;
}
