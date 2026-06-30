// src/combo-feedback.js
// On-board praise feedback system for Blupets Match-3.
// All tunable values live in FEEDBACK_CONFIG.
// Call createComboFeedback() once to get { onCascadeStep, onEvolutionTrigger }.

// ── Configuration — edit here to tune feel ──────────────────────────────────

export const FEEDBACK_CONFIG = {
  // Tier classification thresholds, adapted from Pin Drop's "combo first"
  // feel: the first clear is not text-worthy; text starts at combo x2.
  // Tier 0: initial clear / no real combo -> sparkle only, no text
  // Tier 1: combo x2
  // Tier 2: combo x3
  // Tier 3: combo x4-x5
  // Tier 4: combo x6+
  tierRules: {
    combo2Tier: 1,
    combo3Tier: 2,
    combo4Tier: 3,
    combo6Tier: 4,
  },

  // Phrase bank — one pool per tier. Tier 0 = no text. Combo messages append
  // the current multiplier, so wording stays compact and readable in motion.
  phrases: {
    0: [],
    1: ["Combo"],
    2: ["Chain", "Combo"],
    3: ["Chain Reaction", "Power Combo"],
    4: ["Apex Chain", "Mega Combo", "Cascade Rush"],
  },

  // Event-specific copy. These do not append a multiplier because the event
  // itself is the important information.
  specialPhrases: {
    crossCreate: ["Cross Ready"],
    bombCreate: ["Bomb Ready"],
    crossTrigger: ["Cross Clear"],
    bombTrigger: ["Bomb Blast"],
  },

  evolutionPhrases: ["Evolution Ready", "Choose Form", "New Form Ready"],

  // Animation timing (ms) and upward drift (px) per tier.
  anim: {
    durationMs: { 0: 550, 1: 900, 2: 1050, 3: 1200, 4: 1350 },
    liftPx:     { 0: 0,   1: 20,  2: 32,   3: 44,   4: 58   },
  },

  // Audio.
  audio: {
    cooldownMs: 120, // minimum ms between praise sound events
  },

  // Spawn anti-spam limits.
  spawn: {
    maxActive:          2,  // max concurrent praise text elements on screen
    maxTier4Active:     1,  // max concurrent tier-4 elements
    overlapThresholdPx: 120, // combo text is board-focused, so stack generously
    stackOffsetPx:      58,  // shift up by this many px when stacking
    sparkleCountByTier: { 0: 3, 1: 3, 2: 4, 3: 6, 4: 8 },
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
  const combo = Math.max(1, stepIndex + 1);
  if (combo >= 6) return 4;
  if (combo >= 4) return 3;
  if (combo >= 3) return 2;
  if (combo >= 2) return 1;
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
  let cachedGeometry = null;
  let cachedGeometryAt = 0;
  const lastPhrasePicked = {}; // phrase-pool key → string

  // Track active text positions for stacking: Array<{ x, y, expiresAt }>
  const activePositions = [];

  // ── Internal helpers ────────────────────────────────────────────────────────

  function getGeometry() {
    const now = performance.now();
    if (cachedGeometry && now - cachedGeometryAt < 120) {
      return cachedGeometry;
    }

    const shellRect = boardShellEl.getBoundingClientRect();
    const boardRect  = boardEl.getBoundingClientRect();
    cachedGeometry = { shellRect, boardRect, cellSize: boardRect.width / BOARD_SIZE };
    cachedGeometryAt = now;
    return cachedGeometry;
  }

  function cellToPixel(row, col) {
    const { shellRect, boardRect, cellSize } = getGeometry();
    if (boardRect.width === 0) return { x: shellRect.width / 2, y: shellRect.height / 2 };
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

  function getBoardComboPosition(combo) {
    const { shellRect, boardRect } = getGeometry();
    if (boardRect.width === 0) return { x: shellRect.width / 2, y: shellRect.height / 2 };
    const centeredX = (boardRect.left - shellRect.left) + boardRect.width / 2;
    const focusedY = (boardRect.top - shellRect.top) + boardRect.height * (combo >= 4 ? 0.34 : 0.38);
    const jitter = ((combo % 3) - 1) * Math.min(22, boardRect.width * 0.025);
    return { x: centeredX + jitter, y: focusedY };
  }

  function pickFromPool(key, pool) {
    if (!pool || pool.length === 0) return null;
    const last = lastPhrasePicked[key];
    const choices = pool.length > 1 ? pool.filter((p) => p !== last) : pool;
    const phrase = choices[Math.floor(Math.random() * choices.length)];
    lastPhrasePicked[key] = phrase;
    return phrase;
  }

  function pickPhrase(tier) {
    return pickFromPool(`combo:${tier}`, CFG.phrases[tier]);
  }

  function buildComboPhrase(tier, combo) {
    const base = pickPhrase(tier);
    if (!base) return null;
    return `${base} x${combo}`;
  }

  function getStepSpecialEvent(step) {
    const triggered = new Set();
    for (const tile of step.clearedTiles ?? []) {
      const source = step.boardBeforeClear?.[tile.row]?.[tile.col];
      if (source?.special) triggered.add(source.special);
    }
    if (triggered.has("bomb")) return { key: "bombTrigger", tier: 4 };
    if (triggered.has("cross")) return { key: "crossTrigger", tier: 3 };

    const created = new Set((step.specialSpawns ?? []).map((spawn) => spawn.special));
    if (created.has("bomb")) return { key: "bombCreate", tier: 3 };
    if (created.has("cross")) return { key: "crossCreate", tier: 2 };
    return null;
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
    const lift = CFG.anim.liftPx[tier] ?? 24;
    el.style.setProperty("--fx-lift", `${lift}px`);
    el.style.setProperty("--fx-lift-mid", `${Math.round(lift * 0.55)}px`);
    el.style.setProperty("--fx-tilt", `${tier % 2 === 0 ? -2 : 2}deg`);
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
      const duration = 480 + Math.random() * 120;

      const el = document.createElement("div");
      el.className = "fx-sparkle-dot";
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.setProperty("--fx-color", colorHex || CFG.defaultSparkleColor);
      el.style.setProperty("--fx-dx", `${dx}px`);
      el.style.setProperty("--fx-dy", `${dy}px`);
      el.style.setProperty("--fx-duration", `${duration}ms`);
      fxLayer.appendChild(el);
      setTimeout(() => el.remove(), duration + 40);
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

    const comboTier = classifyEvent(step, stepIndex);
    const specialEvent = getStepSpecialEvent(step);
    const tier = specialEvent ? Math.max(comboTier, specialEvent.tier) : comboTier;

    // Largest group drives position + color
    const largestGroup = step.groups.reduce(
      (best, g) => g.length >= best.length ? g : best,
      step.groups[0],
    );
    const centroid = getGroupCentroid(largestGroup);
    const groupPos = cellToPixel(centroid.row, centroid.col);
    const colorHex   = getGroupColorHex(step, largestGroup);

    // Tier 0: sparkle only. This intentionally includes ordinary first clears;
    // special tile events still get semantic text below.
    if (tier === 0) {
      spawnSparkles(groupPos.x, groupPos.y, CFG.spawn.sparkleCountByTier[0], colorHex);
      return;
    }

    // Anti-spam guards for text elements
    if (activeCount >= CFG.spawn.maxActive) return;
    if (tier === 4 && activeTier4Count >= CFG.spawn.maxTier4Active) return;

    const combo = stepIndex + 1;
    const phrase = specialEvent
      ? pickFromPool(`special:${specialEvent.key}`, CFG.specialPhrases[specialEvent.key])
      : buildComboPhrase(tier, combo);
    if (!phrase) return;

    const { x, y } = specialEvent ? groupPos : getBoardComboPosition(combo);
    const stackedY = resolveStackedY(x, y, tier);

    activeCount++;
    if (tier === 4) activeTier4Count++;
    setTimeout(() => {
      activeCount--;
      if (tier === 4) activeTier4Count--;
    }, CFG.anim.durationMs[tier]);

    spawnPraiseText(phrase, tier, x, stackedY);
    playPraiseSfx(tier);

    spawnSparkles(x, stackedY, CFG.spawn.sparkleCountByTier[tier] ?? 6, colorHex);
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

    const { shellRect, boardRect } = getGeometry();
    const x = (boardRect.left - shellRect.left) + boardRect.width  / 2;
    const y = (boardRect.top  - shellRect.top)  + boardRect.height / 2;

    const phrase = pickFromPool("evolution", CFG.evolutionPhrases);
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
