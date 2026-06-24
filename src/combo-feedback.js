// src/combo-feedback.js
// On-board praise feedback system for Blupets Match-3.
// All tunable values live in FEEDBACK_CONFIG.
// Call createComboFeedback() once to get { onCascadeStep, onEvolutionTrigger }.

// ── Configuration — edit here to tune feel ──────────────────────────────────

export const FEEDBACK_CONFIG = {
  // Tier classification thresholds.
  // Logic is encoded in classifyEvent(); this object is the documentation.
  // Tier 0: match-3, no cascade → sparkle only, no text
  // Tier 1: match-4, first cascade step (stepIndex 0)
  // Tier 2: match-5+, first step OR cascade depth 2 (stepIndex 1)
  // Tier 3: cascade depth 3+ (stepIndex >= 2)
  // Tier 4: match-5+ AND cascade depth >= 2, OR evolution trigger
  tierRules: {
    match4Tier: 1,
    match5Tier: 2,
    cascadeDepth2Tier: 2,
    cascadeDepth3Tier: 3,
    bigMatchCascadeTier: 4, // match-5+ at stepIndex >= 1
  },

  // Phrase bank — one pool per tier. Tier 0 = no text.
  phrases: {
    0: [],
    1: ["Sparked", "Pulse", "Resonant", "Color Touch"],
    2: ["Awakened", "Merge Pulse", "Resonating", "Form Flicker", "Color Secured"],
    3: ["Essence Rising", "Evolution Near", "Perfect Merge", "Form Shift", "Deep Resonance"],
    4: ["Evolved", "Apex Merge", "Full Resonance", "Form Shift Complete", "Color Evolved"],
  },

  // Animation timing (ms) and upward drift (px) per tier.
  anim: {
    durationMs: { 0: 550, 1: 750, 2: 850, 3: 950, 4: 1200 },
    liftPx:     { 0: 0,   1: 18,  2: 28,  3: 38,  4: 48  },
  },

  // Audio.
  audio: {
    cooldownMs: 120, // minimum ms between praise sound events
  },

  // Spawn anti-spam limits.
  spawn: {
    maxActive:          3,  // max concurrent praise text elements on screen
    maxTier4Active:     1,  // max concurrent tier-4 elements
    overlapThresholdPx: 40, // if new position is within this of an active, stack it
    stackOffsetPx:      28, // shift up by this many px when stacking
    sparkleCountByTier: { 0: 4, 3: 6, 4: 12 },
    maxSparkleDots:     12, // hard cap on total simultaneous sparkle dots
  },

  // Default sparkle color when tile color can't be determined.
  defaultSparkleColor: "#7dd4fc",
};

// ── Pure helper: tier classification ────────────────────────────────────────
// Exported for unit tests — this function has no side effects.

/**
 * Classify a cascade step into a praise tier 0–4.
 *
 * @param {object} step      - cascadeStep from game.js (has .groups: Array<Array<{row,col}>>)
 * @param {number} stepIndex - 0-based cascade depth index
 * @returns {0|1|2|3|4}
 */
export function classifyEvent(step, stepIndex) {
  const maxGroupLen = step.groups.reduce((max, g) => Math.max(max, g.length), 0);

  // Tier 4: large match happening inside a cascade
  if (maxGroupLen >= 5 && stepIndex >= 1) return 4;

  // Tier 3: cascade depth 3 or deeper
  if (stepIndex >= 2) return 3;

  // Tier 2: first cascade step (cascade depth 2) OR match-5+ on first step
  if (stepIndex === 1 || maxGroupLen >= 5) return 2;

  // Tier 1: match-4 on first step
  if (maxGroupLen >= 4) return 1;

  // Tier 0: match-3, no cascade
  return 0;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} fxLayer      - #fxLayer (absolute overlay inside .board-shell)
 * @param {HTMLElement} boardEl      - #board (the 8×8 grid element)
 * @param {HTMLElement} boardShellEl - .board-shell (parent that fxLayer is relative to)
 * @param {object}      opts
 * @param {function}    [opts.playSfx]      - sfx(name) from audio.js (injected to avoid import coupling)
 * @param {object}      [opts.colorHexMap]  - { colorId: "#hex" } for sparkle tinting
 * @returns {{ onCascadeStep(step, stepIndex): void, onEvolutionTrigger(colorHex?): void }}
 */
export function createComboFeedback(fxLayer, boardEl, boardShellEl, opts = {}) {
  const { playSfx = () => {}, colorHexMap = {} } = opts;
  const CFG = FEEDBACK_CONFIG;
  const BOARD_SIZE = 8;

  // ── Internal state ──────────────────────────────────────────────────────────
  let activeCount = 0;
  let activeTier4Count = 0;
  let activeSparkleCount = 0;
  let lastAudioAt = 0;
  const lastPhrasePicked = {}; // tier → string

  // Track active text positions for stacking: Array<{ x, y, expiresAt }>
  const activePositions = [];

  // ── Internal helpers ────────────────────────────────────────────────────────

  function cellToPixel(row, col) {
    const shellRect = boardShellEl.getBoundingClientRect();
    const boardRect  = boardEl.getBoundingClientRect();
    if (boardRect.width === 0) return { x: shellRect.width / 2, y: shellRect.height / 2 };
    const cellSize = boardRect.width / BOARD_SIZE;
    return {
      x: (boardRect.left - shellRect.left) + (col + 0.5) * cellSize,
      y: (boardRect.top  - shellRect.top)  + (row + 0.5) * cellSize,
    };
  }

  function getGroupCentroid(group) {
    const avgRow = group.reduce((s, p) => s + p.row, 0) / group.length;
    const avgCol = group.reduce((s, p) => s + p.col, 0) / group.length;
    return { row: avgRow, col: avgCol };
  }

  function getGroupColorHex(step, group) {
    const tile = step.boardBeforeClear?.[group[0]?.row]?.[group[0]?.col];
    return (tile?.color && colorHexMap[tile.color]) || CFG.defaultSparkleColor;
  }

  function pickPhrase(tier) {
    const pool = CFG.phrases[tier];
    if (!pool || pool.length === 0) return null;
    const last = lastPhrasePicked[tier];
    const choices = pool.length > 1 ? pool.filter((p) => p !== last) : pool;
    const phrase = choices[Math.floor(Math.random() * choices.length)];
    lastPhrasePicked[tier] = phrase;
    return phrase;
  }

  function resolveStackedY(x, y, tier) {
    const now = Date.now();
    for (let i = activePositions.length - 1; i >= 0; i--) {
      if (activePositions[i].expiresAt <= now) activePositions.splice(i, 1);
    }
    let stackedY = y;
    for (const pos of activePositions) {
      if (
        Math.abs(pos.x - x) < CFG.spawn.overlapThresholdPx &&
        Math.abs(pos.y - stackedY) < CFG.spawn.stackOffsetPx
      ) {
        stackedY -= CFG.spawn.stackOffsetPx;
      }
    }
    activePositions.push({ x, y: stackedY, expiresAt: now + CFG.anim.durationMs[tier] });
    return stackedY;
  }

  function spawnPraiseText(phrase, tier, x, y) {
    const suffix = ["", "--subtle", "--lively", "--energized", "--legendary"][tier];
    const el = document.createElement("div");
    el.className = `fx-praise fx-praise${suffix}`;
    el.textContent = phrase;
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), CFG.anim.durationMs[tier] + 100);
  }

  function spawnSparkles(x, y, count, colorHex) {
    if (activeSparkleCount + count > CFG.spawn.maxSparkleDots) return;
    activeSparkleCount += count;
    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2;
      const radius = 22 + Math.random() * 22;
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;

      const el = document.createElement("div");
      el.className = "fx-sparkle-dot";
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.setProperty("--fx-color", colorHex || CFG.defaultSparkleColor);
      fxLayer.appendChild(el);

      const duration = 480 + Math.random() * 120;
      el.animate(
        [
          { transform: "translate(-50%, -50%)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 0 },
        ],
        { duration, easing: "ease-out", fill: "forwards" },
      ).onfinish = () => el.remove();
    }
    setTimeout(() => { activeSparkleCount -= count; }, 650);
  }

  function spawnRing(x, y) {
    const el = document.createElement("div");
    el.className = "fx-ring";
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  function playPraiseSfx(tier) {
    if (tier < 1) return;
    const now = performance.now();
    if (now - lastAudioAt < CFG.audio.cooldownMs) return;
    lastAudioAt = now;
    playSfx(`praise${tier}`);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Call once per cascade step inside playResolutionAnimation().
   * Replaces the old spawnComboPopup() call.
   */
  function onCascadeStep(step, stepIndex) {
    if (!fxLayer || !boardEl || !boardShellEl) return;
    if (!step.groups || step.groups.length === 0) return;

    const tier = classifyEvent(step, stepIndex);

    // Largest group drives position + color
    const largestGroup = step.groups.reduce(
      (best, g) => g.length >= best.length ? g : best,
      step.groups[0],
    );
    const centroid = getGroupCentroid(largestGroup);
    const { x, y }  = cellToPixel(centroid.row, centroid.col);
    const colorHex   = getGroupColorHex(step, largestGroup);

    // Tier 0: sparkle only (match-3, no cascade text)
    if (tier === 0) {
      spawnSparkles(x, y, CFG.spawn.sparkleCountByTier[0], colorHex);
      return;
    }

    // Anti-spam guards for text elements
    if (activeCount >= CFG.spawn.maxActive) return;
    if (tier === 4 && activeTier4Count >= CFG.spawn.maxTier4Active) return;

    const phrase = pickPhrase(tier);
    if (!phrase) return;

    const stackedY = resolveStackedY(x, y, tier);

    activeCount++;
    if (tier === 4) activeTier4Count++;
    setTimeout(() => {
      activeCount--;
      if (tier === 4) activeTier4Count--;
    }, CFG.anim.durationMs[tier]);

    spawnPraiseText(phrase, tier, x, stackedY);
    playPraiseSfx(tier);

    if (tier >= 3) {
      spawnSparkles(x, stackedY, CFG.spawn.sparkleCountByTier[tier] ?? 6, colorHex);
    }
    if (tier === 4) {
      spawnRing(x, stackedY);
    }
  }

  /**
   * Call when a new evolution is queued (pendingEvolutionQueue just grew).
   * Spawns a tier-4 praise at board center regardless of cascade tier.
   * @param {string|null} colorHex - hex color of the evolving color, or null for default
   */
  function onEvolutionTrigger(colorHex) {
    if (!fxLayer || !boardEl || !boardShellEl) return;
    if (activeTier4Count >= CFG.spawn.maxTier4Active) return;

    const shellRect = boardShellEl.getBoundingClientRect();
    const boardRect  = boardEl.getBoundingClientRect();
    const x = (boardRect.left - shellRect.left) + boardRect.width  / 2;
    const y = (boardRect.top  - shellRect.top)  + boardRect.height / 2;

    const phrase = pickPhrase(4);
    if (!phrase) return;

    activeCount++;
    activeTier4Count++;
    setTimeout(() => {
      activeCount--;
      activeTier4Count--;
    }, CFG.anim.durationMs[4]);

    spawnPraiseText(phrase, 4, x, y);
    spawnRing(x, y);
    spawnSparkles(x, y, CFG.spawn.sparkleCountByTier[4], colorHex || CFG.defaultSparkleColor);
    playPraiseSfx(4);
  }

  return { onCascadeStep, onEvolutionTrigger };
}
