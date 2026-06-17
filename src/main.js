import {
  COLORS,
  attemptSwap,
  areAdjacent,
  createInitialState,
  findPossibleMoves,
  getBestProgressSummary,
  getChosenEvolutionForm,
  getColor,
  getEvolutionFormSelection,
  getProgressPercent,
  getStateMatchResolver,
  HATCH_GOAL,
  REROLL_MAX_CHARGES,
  getTopPartnerOptions,
  previewSwap,
  rerollBoard,
  selectEvolutionForm,
  selectFusionPartner,
} from "./game.js?v=20260617-gameplay-3";
import { runTour } from "./coachmarks.js";
import { sfx, buzz, unlockAudio, isMuted, toggleMute, startMusic, stopMusic } from "./audio.js?v=20260617-3";
import { initAuth, signInWithProvider, signOut } from "./auth.js?v=20260617-3";
import {
  loadProgress,
  saveProgress,
  setProgressUser,
  recordRunStart,
  recordWin,
  discoveredCount,
  getCollectionEntries,
  TOTAL_APEX_FORMS,
} from "./progress.js?v=20260617-4";
import { createSeededRng, randomSeed } from "./rng.js";
import {
  fetchGlobalLeaderboard,
  fetchUserProgress,
  startTrustedRun,
  submitTrustedRun,
} from "./sync.js?v=20260617-6";

const SWAP_ANIMATION_MS = 210;
// Quick reject shake when a swap makes no match, so an illegal move reads as
// "tried, bounced back" instead of silently doing nothing.
const REJECT_ANIMATION_MS = 300;
const CLEAR_ANIMATION_MS = 280;
const DROP_ANIMATION_MS = 360;
// Falling tiles are staggered by --tile-delay (up to ~190ms for the bottom-right
// cell). Hold the drop phase long enough that the last-staggered tile's
// animation finishes instead of being cut off and snapping into place.
const DROP_STAGGER_MS = 150;
const CASCADE_SETTLE_MS = 80;
const RESHUFFLE_ANIMATION_MS = 320;
const VICTORY_REWARD = 40;
// Idle hint: while the board waits for input, occasionally wobble the pair of
// tiles for one available move, cycling through the moves one at a time. The
// long gap keeps it a rare, quiet nudge rather than a constant shimmer.
const HINT_JITTER_MS = 680; // how long the tile wobbles
const HINT_GAP_MS = 10000; // pause between hints (~one nudge every 10s)
const HINT_RECHECK_MS = 1000; // re-poll when hints are paused or unavailable
const BASE_BLOCK_ASSETS = Object.freeze({
  black: "./assets/blocks/black.svg",
  blue: "./assets/blocks/blue.svg",
  cyan: "./assets/blocks/cyan.svg",
  green: "./assets/blocks/green.svg",
  purple: "./assets/blocks/purple.svg",
  red: "./assets/blocks/red.svg",
  white: "./assets/blocks/white.svg",
  yellow: "./assets/blocks/yellow.svg",
  origin: "./assets/blocks/origin.svg",
});

const elements = {
  authActions: document.querySelector("#authActions"),
  authAvatar: document.querySelector("#authAvatar"),
  authGoogleBtn: document.querySelector("#authGoogleBtn"),
  authLogoutBtn: document.querySelector("#authLogoutBtn"),
  authName: document.querySelector("#authName"),
  authPanel: document.querySelector("#authPanel"),
  authStatus: document.querySelector("#authStatus"),
  authModal: document.querySelector("#authModal"),
  authSkipBtn: document.querySelector("#authSkipBtn"),
  authTwitterBtn: document.querySelector("#authTwitterBtn"),
  authUser: document.querySelector("#authUser"),
  backToStart: document.querySelector("#back-to-start"),
  board: document.querySelector("#board"),
  boardShell: document.querySelector(".board-shell"),
  gameFrame: document.querySelector(".game-frame"),
  formHeadline: document.querySelector("#formHeadline"),
  formOptions: document.querySelector("#formOptions"),
  gameScreen: document.querySelector("#gameScreen"),
  gameoverBtn: document.querySelector("#gameoverBtn"),
  gameoverDetail: document.querySelector("#gameoverDetail"),
  gameoverScore: document.querySelector("#gameoverScore"),
  gameoverScreen: document.querySelector("#gameoverScreen"),
  leaderboardBackBtn: document.querySelector("#leaderboardBackBtn"),
  leaderboardContent: document.querySelector("#leaderboard-content"),
  leaderboardScreen: document.querySelector("#leaderboardScreen"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileBackBtn: document.querySelector("#profileBackBtn"),
  profileChip: document.querySelector("#profileChip"),
  profileChipAvatar: document.querySelector("#profileChipAvatar"),
  profileChipCount: document.querySelector("#profileChipCount"),
  profileContent: document.querySelector("#profile-content"),
  profileLogoutBtn: document.querySelector("#profileLogoutBtn"),
  profileName: document.querySelector("#profileName"),
  profileScreen: document.querySelector("#profileScreen"),
  profileSignInBtn: document.querySelector("#profileSignInBtn"),
  profileStatus: document.querySelector("#profileStatus"),
  modalForm: document.querySelector("#modalForm"),
  modalPartner: document.querySelector("#modalPartner"),
  movesValue: document.querySelector("#movesValue"),
  muteBtn: document.querySelector("#muteBtn"),
  muteBtnGame: document.querySelector("#muteBtnGame"),
  fxLayer: document.querySelector("#fxLayer"),
  victoryShareBtn: document.querySelector("#victoryShareBtn"),
  toast: document.querySelector("#toast"),
  partnerHeadline: document.querySelector("#partnerHeadline"),
  partnerOptions: document.querySelector("#partnerOptions"),
  // The egg/reroll control is one element: it shows hatch progress AND spends
  // charges as the reroll button. rerollRun is that single node.
  rerollRun: document.querySelector("#reroll-run"),
  rerollPips: document.querySelectorAll("#rerollPips .reroll-pip"),
  rerollHud: document.querySelector("#reroll-hud"),
  rerollHudBadge: document.querySelector("#rerollHudBadge"),
  colorRoster: document.querySelector("#colorRoster"),
  vibeStrip: document.querySelector("#vibeStrip"),
  vibeStripName: document.querySelector("#vibeStripName"),
  vibeStripPerks: document.querySelector("#vibeStripPerks"),
  scoreValue: document.querySelector("#scoreValue"),
  startRun: document.querySelector("#start-run"),
  startGuide: document.querySelector("#start-guide"),
  startLeaderboard: document.querySelector("#start-leaderboard"),
  startMuteBtn: document.querySelector("#startMuteBtn"),
  startScreen: document.querySelector("#startScreen"),
  statusText: document.querySelector("#statusText"),
  vibeIntro: document.querySelector("#vibeIntro"),
  vibeIntroName: document.querySelector("#vibeIntroName"),
  vibeIntroBlurb: document.querySelector("#vibeIntroBlurb"),
  vibeIntroBtn: document.querySelector("#vibeIntroBtn"),
  victoryArt: document.querySelector("#victoryArt"),
  victoryBtn: document.querySelector("#victoryBtn"),
  victoryDetail: document.querySelector("#victoryDetail"),
  victoryLeaderboardBtn: document.querySelector("#victoryLeaderboardBtn"),
  victoryPlace: document.querySelector("#victoryPlace"),
  victoryScore: document.querySelector("#victoryScore"),
  victoryForms: document.querySelector("#victoryForms"),
  victoryScreen: document.querySelector("#victoryScreen"),
  victoryTitle: document.querySelector("#victoryTitle"),
};

let state = null;
let currentScreen = "start";
let lastScreenBeforeLeaderboard = "start";
let lastScreenBeforeProfile = "start";
let _inPopstate = false;
let _historyDepth = 0;
let selectedTile = null;
let boardAnimation = {
  board: null,
  clearingGhosts: [],
  activeCells: new Set(),
  settlingCells: new Set(),
  swapVectors: null,
  phase: "",
};
let isAnimating = false;
let dragState = null;
let remoteLeaderboard = [];
let progress = loadProgress();
let authState = {
  configured: false,
  loading: true,
  user: null,
  label: "",
  avatarUrl: "",
  error: "",
};
let authModalDismissed = false;
let authModalForced = false;
let boardSizeFrame = null;
let hintMoves = [];
let hintCursor = 0;
let hintTimer = null;
let vibeIntroOpen = false;
let runRng = Math.random;
let runProof = null;

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function logRunAction(action) {
  if (!runProof) {
    return;
  }
  runProof.actions.push(action);
}

// Overwrite in-memory progress with authoritative Supabase data.
// Keeps local `runs` (which counts non-winning runs too; server only counts wins).
function applyRemoteProgress(remote) {
  if (!remote) return;
  const localRuns = progress.runs;
  progress = {
    ...progress,
    wins: remote.wins ?? progress.wins,
    runs: Math.max(localRuns, remote.runs ?? 0),
    bestScore: remote.bestScore ?? progress.bestScore,
    fewestMovesWin: remote.fewestMovesWin ?? progress.fewestMovesWin,
    forms: remote.forms ?? progress.forms,
  };
  saveProgress(progress);
}

function clearRunProof() {
  runProof = null;
  runRng = Math.random;
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function sameTile(left, right) {
  return Boolean(left && right && left.row === right.row && left.col === right.col);
}

function getBaseBlockAsset(colorId) {
  return BASE_BLOCK_ASSETS[colorId] ?? BASE_BLOCK_ASSETS.origin;
}

function getBlockAsset(colorId, stateLike = state) {
  const chosenForm = stateLike ? getChosenEvolutionForm(stateLike, colorId) : null;
  return chosenForm?.asset ?? getBaseBlockAsset(colorId);
}

function getTileFromElement(target) {
  const tile = target?.closest?.("[data-row][data-col]");
  if (!tile) {
    return null;
  }

  return {
    row: Number(tile.dataset.row),
    col: Number(tile.dataset.col),
  };
}

function getTileFromPoint(clientX, clientY) {
  return getTileFromElement(document.elementFromPoint(clientX, clientY));
}

function resetInteractionState() {
  selectedTile = null;
  resetBoardAnimation();
  dragState = null;
  isAnimating = false;
  hideVibeIntro();
}

function resetBoardAnimation() {
  boardAnimation = {
    board: null,
    clearingGhosts: [],
    activeCells: new Set(),
    settlingCells: new Set(),
    swapVectors: null,
    phase: "",
  };
}

function setBoardAnimation({
  board = null,
  clearingGhosts = [],
  activeCells = new Set(),
  settlingCells = new Set(),
  swapVectors = null,
  phase = "",
} = {}) {
  boardAnimation = {
    board,
    clearingGhosts,
    activeCells,
    settlingCells,
    swapVectors,
    phase,
  };
}

function setScreen(screen) {
  const changed = screen !== currentScreen;
  currentScreen = screen;
  if (changed && !_inPopstate) {
    const hash = screen === "start" ? "" : screen;
    history.pushState({ screen }, "", location.pathname + (hash ? "#" + hash : ""));
    _historyDepth++;
  }
  // Keep the Blupix ambience through the menu and active run.
  if (screen === "start" || screen === "game" || screen === "leaderboard" || screen === "profile") {
    startMusic();
  } else {
    stopMusic();
  }
  elements.startScreen.hidden = screen !== "start";
  elements.gameScreen.hidden = screen !== "game";
  elements.victoryScreen.hidden = screen !== "victory";
  elements.gameoverScreen.hidden = screen !== "gameover";
  elements.leaderboardScreen.hidden = screen !== "leaderboard";
  if (elements.profileScreen) {
    elements.profileScreen.hidden = screen !== "profile";
  }
}

async function startRun({ guided = false } = {}) {
  unlockAudio();
  sfx("ui");
  recordRunStart(progress);
  runProof = null;
  let seed = randomSeed();
  if (authState.user) {
    try {
      runProof = await startTrustedRun();
      seed = runProof.seed;
    } catch {
      // Trusted run unavailable — fall back to local seed silently.
    }
  }
  runRng = createSeededRng(seed);
  state = createInitialState({
    diagonalAssist: true,
    rng: runRng,
  });
  resetInteractionState();
  // Reset reroll bar immediately so the transition doesn't replay the old pct.
  if (elements.rerollRun) elements.rerollRun.style.removeProperty("--pct");
  setScreen("game");
  render();
  if (guided) {
    startGuideTour();
  } else {
    showVibeIntro();
  }
}

// "Guide" on the start screen: spin up a real run, then walk the player through
// the live HUD with coachmarks. The tour freezes the board until they finish,
// then hands the run back so they can keep playing from where the guide left.
let guideTour = null;

function startGuideTour() {
  guideTour?.stop();
  const steps = [
    {
      target: () => elements.board,
      title: "Match to grow",
      body: "Swap two touching blocks to line up 3 or more of the same color.",
      placement: "top",
    },
    {
      target: () => document.querySelector("#colorRoster .roster-item"),
      title: "Essence rings",
      body: "Every match fills that color's ring. Fill it up to evolve the color.",
    },
    {
      target: () => elements.rerollRun,
      title: "Reroll",
      body: "Matches charge the meter. When it's full, you earn a reroll — tap to spend one and reshuffle the whole board. You start with one.",
    },
    {
      target: () => document.querySelector(".topbar-stats"),
      title: "Score & moves",
      body: "Your score climbs with every match and cascade.",
    },
    {
      target: () => null,
      title: "Evolve to win",
      body: "Max a color's essence to evolve it through its forms. Reach the final form to win the run. Have fun!",
    },
  ];
  guideTour = runTour(steps, {
    onDone: () => {
      guideTour = null;
    },
  });
}

// Reveal the rolled vibe as a one-time overlay at the top of each run, so the
// player knows which bonuses they're playing with before touching the board.
function showVibeIntro() {
  if (!state?.vibe || !elements.vibeIntro) {
    return;
  }

  elements.vibeIntroName.textContent = state.vibe.label;
  elements.vibeIntroBlurb.textContent = state.vibe.blurb || "A balanced run with no extra perks.";
  vibeIntroOpen = true;
  elements.vibeIntro.hidden = false;
}

function dismissVibeIntro() {
  hideVibeIntro();
  render();
}

function hideVibeIntro() {
  vibeIntroOpen = false;
  if (elements.vibeIntro) {
    elements.vibeIntro.hidden = true;
  }
}

function goToStart() {
  guideTour?.stop();
  resetInteractionState();
  clearRunProof();
  setScreen("start");
  render();
}

function openProfile(fromScreen = currentScreen) {
  lastScreenBeforeProfile = fromScreen;
  setScreen("profile");
  render();
  if (authState.user) {
    fetchUserProgress()
      .then(applyRemoteProgress)
      .catch(() => {})
      .then(() => { if (currentScreen === "profile") render(); });
  }
}

function closeProfile() {
  if (_historyDepth > 0) {
    history.back();
  } else {
    setScreen(lastScreenBeforeProfile === "game" && state ? "game" : "start");
    render();
  }
}

async function openLeaderboard(fromScreen = currentScreen) {
  lastScreenBeforeLeaderboard = fromScreen;
  setScreen("leaderboard");
  renderLeaderboard();
  try {
    const entries = await fetchGlobalLeaderboard();
    remoteLeaderboard = entries;
    if (currentScreen === "leaderboard") renderLeaderboard();
  } catch {
    // Stay on local leaderboard if network unavailable.
  }
}

function closeLeaderboard() {
  if (_historyDepth > 0) {
    history.back();
  } else {
    setScreen(lastScreenBeforeLeaderboard === "game" && state ? "game" : "start");
    render();
  }
}

function recordVictory(nextState) {
  if (!nextState?.victory || !nextState.victoryMeta) {
    return;
  }

  const { colorId, partnerColorId, formKey, formName } = nextState.victoryMeta;
  const resolvedFormKey = formKey ?? nextState.evolutionChoices[colorId]?.[4] ?? "UNKNOWN";
  // Persist the apex form into the cross-run collection / lifetime stats.
  recordWin(progress, {
    formKey: resolvedFormKey,
    formName: formName ?? resolvedFormKey,
    asset: getChosenEvolutionForm(nextState, colorId, 4)?.asset ?? null,
    color: colorId,
    partner: partnerColorId,
    score: nextState.score,
    movesUsed: nextState.movesUsed,
  });
  updateProfileChip();

  if (authState.user && runProof) {
    const proof = runProof;
    submitTrustedRun(proof.runId, proof.actions)
      .then((data) => {
        if (data?.progress) {
          applyRemoteProgress(data.progress);
          render();
        }
        return fetchGlobalLeaderboard();
      })
      .then((entries) => { remoteLeaderboard = entries; })
      .then(() => showToast("Verified run added to leaderboard."))
      .catch((error) => {
        console.error("[sync] trusted submit failed:", error);
        showToast("Run saved locally — leaderboard verification failed.");
      })
      .finally(() => {
        if (runProof === proof) clearRunProof();
      });
  }
}


function applyState(nextState) {
  const wasVictory = state?.victory;
  const prevCharges = state?.rerollCharges ?? 0;
  state = nextState;
  if ((nextState?.rerollCharges ?? 0) > prevCharges) {
    pulseHatch();
  }
  if (!wasVictory && nextState?.victory) {
    recordVictory(nextState);
    setScreen("victory");
    sfx("victory");
    buzz([0, 90, 50, 90, 50, 160]);
  } else if (nextState?.gameOver) {
    setScreen("gameover");
  }
  render();
}

function getLeaderColorId(stateLike) {
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

let hatchPulseTimer = null;
// One-shot pop on the egg meter when a match hatches a fresh reroll charge.
function pulseHatch() {
  const meter = elements.rerollRun;
  if (!meter) {
    return;
  }
  meter.classList.remove("is-hatched");
  void meter.offsetWidth; // restart the animation if it fires twice in a row
  meter.classList.add("is-hatched");
  sfx("hatch");
  buzz(30);
  if (hatchPulseTimer) {
    clearTimeout(hatchPulseTimer);
  }
  hatchPulseTimer = setTimeout(() => {
    meter.classList.remove("is-hatched");
    hatchPulseTimer = null;
  }, 700);
}

function renderTopBar(stateLike) {
  elements.movesValue.textContent = String(stateLike.movesLeft);
  elements.scoreValue.textContent = String(stateLike.score);
  elements.backToStart.disabled = false;

  // Low-moves warning: tint the Moves number amber when it's getting tight and
  // red when it's critical (replaces the old progress meter).
  const movesRemaining = Math.max(0, stateLike.movesLeft ?? 0);
  const movesPill = elements.movesValue.closest(".stat-pill--moves");
  if (movesPill) {
    movesPill.classList.toggle("is-danger", movesRemaining <= 3);
    movesPill.classList.toggle("is-warning", movesRemaining > 3 && movesRemaining <= 6);
  }

  const charges = stateLike.rerollCharges ?? 0;
  const rerollDisabled =
    isAnimating ||
    stateLike.pendingEvolutionQueue.length > 0 ||
    stateLike.victory ||
    movesRemaining <= 0 ||
    charges <= 0;
  elements.rerollRun.disabled = rerollDisabled;

  if (elements.rerollHud) {
    elements.rerollHud.disabled = rerollDisabled;
  }
  if (elements.rerollHudBadge) {
    elements.rerollHudBadge.textContent = String(charges);
  }

  if (elements.rerollPips?.length) {
    elements.rerollPips.forEach((pip, i) => pip.classList.toggle("is-active", i < charges));
    const pipsEl = elements.rerollPips[0]?.parentElement;
    if (pipsEl) pipsEl.dataset.charges = String(charges);
  }
  // Halo the egg only while there's a charge to spend, so it reads as a button.
  elements.rerollRun.classList.toggle("has-charge", charges > 0);
  if (elements.rerollRun) {
    const atMax = charges >= REROLL_MAX_CHARGES;
    const pct = atMax ? 100 : Math.min(100, Math.round(((stateLike.hatchProgress ?? 0) / HATCH_GOAL) * 100));
    elements.rerollRun.style.setProperty("--pct", String(pct));
    if (elements.rerollHud) {
      elements.rerollHud.classList.toggle("has-charge", charges > 0);
      elements.rerollHud.style.setProperty("--pct", String(pct));
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
}

function safeImgSrc(raw) {
  if (!raw) return "";
  try {
    const { protocol } = new URL(raw);
    return protocol === "https:" ? raw : "";
  } catch { return ""; }
}

function safeCssUrl(raw) {
  const src = safeImgSrc(raw);
  return src ? `url("${src.replace(/["'()\\]/g, "")}")` : "";
}


// Compact "activity rings" roster: one conic-gradient progress ring per color
// wrapped around that color's current form SVG, the leading color emphasised.
// Built once, then updated in place so the @property --pct fill animates
// smoothly (incl. the downward sweep when a fusion decays the others).
function renderColorRoster(stateLike) {
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
function renderVibeStrip(stateLike) {
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

function renderBoardGlow() {
  const shell = elements.boardShell;
  if (!shell) {
    return;
  }

  // The board frame no longer tints itself with the leading color. Clear any
  // leftover glow state and keep only the neutral cascade pulse during
  // animations.
  if (shell.dataset.glowLevel) {
    delete shell.dataset.glowLevel;
  }
  shell.style.removeProperty("--glow-color");
  shell.classList.toggle("is-cascade-active", isAnimating);
}

// One-shot board flinch when a match clears. Restart the CSS animation by
// removing the class, forcing a reflow, then re-adding it.
function pulseBoardImpact() {
  const shell = elements.boardShell;
  if (!shell) {
    return;
  }
  shell.classList.remove("is-impact");
  void shell.offsetWidth;
  shell.classList.add("is-impact");
}

// Floating "Combo ×N" popup over the board during a cascade chain.
function spawnComboPopup(text, level) {
  const layer = elements.fxLayer;
  if (!layer) {
    return;
  }
  const el = document.createElement("div");
  el.className = "fx-combo";
  el.textContent = text;
  const lift = Math.min(level, 5) * 7;
  el.style.setProperty("--fx-x", `${50 + (level % 2 ? 7 : -7)}%`);
  el.style.setProperty("--fx-y", `${48 - lift}%`);
  el.style.setProperty("--fx-hue", String(Math.max(0, 46 - level * 9)));
  layer.appendChild(el);
  window.setTimeout(() => el.remove(), 950);
}

// Floating "+score" tally that drifts up after a resolution settles.
function spawnScoreFloater(amount) {
  const layer = elements.fxLayer;
  if (!layer) {
    return;
  }
  const el = document.createElement("div");
  el.className = "fx-score";
  el.textContent = `+${amount}`;
  el.style.setProperty("--fx-x", "50%");
  el.style.setProperty("--fx-y", "60%");
  layer.appendChild(el);
  window.setTimeout(() => el.remove(), 1000);
}

let toastTimer = null;
let toastHideTimer = null;
function showToast(message) {
  const toast = elements.toast;
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.hidden = false;
  // Force a reflow so the transition runs even on rapid repeat calls.
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toastHideTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 260);
  }, 2200);
}

function updateProfileChip() {
  if (elements.profileChipAvatar) {
    elements.profileChipAvatar.src = safeImgSrc(authState.avatarUrl) || "./assets/blu-logo.png";
  }
  if (elements.profileChip) {
    elements.profileChip.classList.toggle("is-signed-in", Boolean(authState.user));
  }
  if (elements.profileChipCount) {
    const count = Object.keys(progress.forms || {}).length;
    elements.profileChipCount.textContent = `${count}/36`;
  }
}

function shortAuthLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "Player";
  }
  if (label.includes("@")) {
    return label.split("@")[0] || label;
  }
  return label.length > 18 ? `${label.slice(0, 16)}...` : label;
}

function renderAuth() {
  if (!elements.authPanel) {
    return;
  }

  const configured = authState.configured;
  const signedIn = Boolean(authState.user);
  if (signedIn) {
    authModalForced = false;
    authModalDismissed = false;
  }
  elements.authPanel.classList.toggle("is-configured", configured);
  elements.authPanel.classList.toggle("is-signed-in", signedIn);
  elements.authPanel.classList.toggle("has-error", Boolean(authState.error));

  if (elements.authActions) {
    elements.authActions.hidden = signedIn;
  }
  if (elements.authUser) {
    elements.authUser.hidden = !signedIn;
  }
  if (elements.authLogoutBtn) {
    elements.authLogoutBtn.hidden = !signedIn;
  }

  if (elements.authName) {
    elements.authName.textContent = signedIn ? shortAuthLabel(authState.label) : "";
  }
  if (elements.authAvatar) {
    elements.authAvatar.style.backgroundImage = safeCssUrl(authState.avatarUrl);
  }

  const disabled = authState.loading || !configured;
  for (const button of [elements.authGoogleBtn, elements.authTwitterBtn]) {
    if (button) {
      button.disabled = disabled;
    }
  }
  if (elements.authLogoutBtn) {
    elements.authLogoutBtn.disabled = authState.loading || !configured;
  }

  if (elements.authStatus) {
    elements.authStatus.textContent = !configured
      ? "Auth config missing"
      : authState.loading
        ? "Checking login..."
        : authState.error
          ? authState.error
          : signedIn
            ? "Signed in"
            : "Sign in";
  }

  renderAuthModal();
  renderProfile();
  updateProfileChip();
}

function shouldShowAuthModal() {
  return currentScreen === "start" && !authState.loading && !authState.user && !authModalDismissed;
}

function renderAuthModal() {
  if (!elements.authModal) {
    return;
  }

  const open = authModalForced || shouldShowAuthModal();
  elements.authModal.hidden = !open;
  elements.authModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function openAuthModal({ force = true } = {}) {
  authModalForced = force;
  authModalDismissed = false;
  renderAuthModal();
}

function closeAuthModal({ dismiss = false } = {}) {
  authModalForced = false;
  authModalDismissed = dismiss ? true : authModalDismissed;
  renderAuthModal();
}

function renderProfile() {
  if (!elements.profileScreen) {
    return;
  }

  const signedIn = Boolean(authState.user);
  if (elements.profileAvatar) {
    elements.profileAvatar.style.backgroundImage = safeCssUrl(authState.avatarUrl);
  }
  if (elements.profileName) {
    elements.profileName.textContent = signedIn ? shortAuthLabel(authState.label) : "Guest";
  }
  if (elements.profileStatus) {
    elements.profileStatus.textContent = signedIn
      ? "Signed in. Progress stays local until trusted cloud sync is enabled."
      : "Sign in is available, but progress and leaderboard data stay local.";
  }
  if (elements.profileLogoutBtn) {
    elements.profileLogoutBtn.hidden = !signedIn;
    elements.profileLogoutBtn.disabled = authState.loading || !authState.configured || !signedIn;
  }
  if (elements.profileSignInBtn) {
    elements.profileSignInBtn.hidden = signedIn;
    elements.profileSignInBtn.disabled = authState.loading || !authState.configured;
  }
  if (elements.profileContent) {
    elements.profileContent.innerHTML = renderCollectionGrid();
  }
  if (elements.profileScreen) {
    const stats = elements.profileScreen.querySelector(".profile-section-head");
    if (stats) {
      const summary = renderStatsHeader();
      let statsBlock = elements.profileScreen.querySelector(".profile-stats");
      if (!statsBlock) {
        statsBlock = document.createElement("div");
        statsBlock.className = "profile-stats";
        stats.after(statsBlock);
      }
      statsBlock.innerHTML = summary;
    }
  }
}

async function initializeAuth() {
  renderAuth();
  authState = await initAuth({
    onChange(nextState) {
      const prevUser = authState.user;
      authState = { ...authState, ...nextState, loading: false };
      if (prevUser?.id !== authState.user?.id) {
        setProgressUser(authState.user?.id ?? null);
        progress = loadProgress();
        if (authState.user) {
          fetchUserProgress()
            .then(applyRemoteProgress)
            .catch(() => {})
            .then(() => render());
        }
      }
      renderAuth();
      render();
      if (!prevUser && authState.user) {
        const returnTo = consumeReturnTo();
        if (returnTo === "game") startRun();
      }
    },
  });
  authState.loading = false;
  setProgressUser(authState.user?.id ?? null);
  progress = loadProgress();
  renderAuth();
  renderAuthModal();
  if (authState.user) {
    fetchUserProgress()
      .then(applyRemoteProgress)
      .catch(() => {})
      .then(() => render());
  }
  // Clean up OAuth fragment/code now that Supabase has consumed the tokens.
  if (/access_token|error_description/.test(location.hash) || new URLSearchParams(location.search).has("code")) {
    history.replaceState({ screen: "start" }, "", location.pathname);
  }
  if (authState.user) {
    const returnTo = consumeReturnTo();
    // After OAuth redirect: return to where the user was (game -> start a new run).
    if (returnTo === "game") startRun();
  }
}

function consumeReturnTo() {
  try {
    const raw = localStorage.getItem("blupets_return");
    localStorage.removeItem("blupets_return");
    if (!raw) return null;
    const item = JSON.parse(raw);
    return item.exp && Date.now() < item.exp ? item.v : null;
  } catch { return null; }
}

async function handleAuthProvider(provider) {
  authState = { ...authState, loading: true, error: "" };
  renderAuth();
  // Save where the user was so we can return after the OAuth redirect reloads the page.
  // localStorage survives tab kills on mobile (sessionStorage does not).
  const _returnPayload = JSON.stringify({ v: lastScreenBeforeProfile || currentScreen, exp: Date.now() + 600_000 });
  try { localStorage.setItem("blupets_return", _returnPayload); } catch {}
  try {
    await signInWithProvider(provider);
  } catch (error) {
    authState = {
      ...authState,
      loading: false,
      error: error?.message || "Sign in failed.",
    };
    renderAuth();
    showToast(authState.error);
  }
}

function handleAuthSkip() {
  closeAuthModal({ dismiss: true });
}

async function handleAuthLogout() {
  authState = { ...authState, loading: true, error: "" };
  renderAuth();
  try {
    await signOut();
    authState = {
      ...authState,
      loading: false,
      user: null,
      label: "",
      avatarUrl: "",
    };
    setProgressUser(null);
    progress = loadProgress(); // restore local guest progress after sign-out
    authModalDismissed = true;  // don't pop auth modal immediately after sign-out
    setScreen("start");
    render();
  } catch (error) {
    authState = {
      ...authState,
      loading: false,
      error: error?.message || "Sign out failed.",
    };
    renderAuth();
    showToast(authState.error);
  }
}

const MUTE_ICON_ON =
  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>';
const MUTE_ICON_OFF =
  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line>';

function syncMuteButton() {
  const buttons = [elements.muteBtn, elements.muteBtnGame, elements.startMuteBtn].filter(Boolean);
  if (!buttons.length) {
    return;
  }
  const muted = isMuted();
  for (const button of buttons) {
    const svg = button.querySelector(".mute-icon");
    if (svg) {
      svg.innerHTML = muted ? MUTE_ICON_OFF : MUTE_ICON_ON;
    }
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", muted ? "true" : "false");
  }
}

function handleMuteToggle() {
  const muted = toggleMute();
  syncMuteButton();
  if (!muted) {
    sfx("ui");
    if (currentScreen === "start" || currentScreen === "game") {
      startMusic();
    }
  }
}

async function shareVictory() {
  unlockAudio();
  sfx("ui");

  const data = victoryShareData ?? buildShareDataFromState(state);
  const form = data?.formName ?? "an apex form";
  const score = data?.score ?? 0;
  const text = `I evolved ${form} for ${score} pts in Blupets Match-3! ✦ ${data?.forms ?? ""} forms collected.`;
  const url = window.location.href;

  let blob = null;
  if (data) {
    try {
      blob = await renderShareCard(data);
    } catch {
      // Canvas generation failed (asset load / toBlob) — fall through to the
      // text-only share path below so the button still does something useful.
      blob = null;
    }
  }

  if (blob) {
    const file = new File([blob], "blupets-win.png", { type: "image/png" });
    // Prefer a native image share (Instagram/Stories/Messages) when the browser
    // can carry files; otherwise hand the player a downloaded PNG to post.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Blupets Match-3", text });
        return;
      } catch (err) {
        if (err?.name === "AbortError") {
          return; // player dismissed the share sheet
        }
        // Any other failure: fall back to a download.
      }
    }
    downloadBlob(blob, "blupets-win.png");
    showToast("Card saved — share it anywhere!");
    return;
  }

  // No card image available — degrade to the original text/link share.
  if (navigator.share) {
    try {
      await navigator.share({ title: "Blupets Match-3", text, url });
      return;
    } catch {
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast("Copied — paste it anywhere!");
  } catch {
    showToast("Share: " + text);
  }
}

function buildShareDataFromState(stateLike) {
  if (!stateLike?.victoryMeta) {
    return null;
  }
  const color = getColor(stateLike.victoryMeta.colorId);
  const partner = getColor(stateLike.victoryMeta.partnerColorId);
  const rank = getVictoryRank(stateLike);
  return {
    formName: stateLike.victoryMeta.formName,
    pair: `${color.label} + ${partner.label}`,
    accent: color.hex,
    accent2: partner.hex,
    score: stateLike.score,
    place: `#${rank.rank} of ${rank.total}`,
    forms: `${discoveredCount(progress)}/${TOTAL_APEX_FORMS}`,
    reward: VICTORY_REWARD,
    art: getChosenEvolutionForm(stateLike, stateLike.victoryMeta.colorId, 4)?.asset ?? "./assets/blu-logo.png",
  };
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Paint the victory share card onto an off-screen canvas and hand back a PNG
// blob. Drawn programmatically (no html2canvas dependency) so it stays crisp at
// social-media resolution and the on-screen card remains its visual twin.
async function renderShareCard(data) {
  const W = 1080;
  const H = 1350;
  const cx = W / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // Backdrop — the Blupets sky gradient, matching the victory screen.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#16a7e8");
  bg.addColorStop(0.54, "#45c4eb");
  bg.addColorStop(1, "#f4fbff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft halo behind the hero.
  const halo = ctx.createRadialGradient(cx, 540, 40, cx, 540, 520);
  halo.addColorStop(0, "rgba(255,255,255,0.55)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Inner card panel.
  const pad = 64;
  const cardX = pad;
  const cardY = 150;
  const cardW = W - pad * 2;
  // End the panel a balanced margin below the stats row (symmetric with the top
  // gap) now that the reward callout is gone — no dead space at the bottom.
  const cardH = H - cardY * 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();

  // Brand row — the official Blupets logo mark + wordmark, centered as a unit.
  ctx.fillStyle = "#16a7e8";
  ctx.font = `900 34px ${FONT}`;
  const brandText = "B L U P E T S";
  const brandTextW = ctx.measureText(brandText).width;
  const markSize = 44;
  const markGap = 18;
  const brandTotal = markSize + markGap + brandTextW;
  const brandLeft = cx - brandTotal / 2;
  const brandBaseline = cardY + 92;
  try {
    const logo = await loadImage("./assets/blu-logo.png");
    ctx.drawImage(logo, brandLeft, brandBaseline - markSize + 6, markSize, markSize);
  } catch {
    // Logo failed to load — the wordmark alone still brands the card.
  }
  ctx.textAlign = "left";
  ctx.fillText(brandText, brandLeft + markSize + markGap, brandBaseline);
  ctx.textAlign = "center";

  // Headline.
  ctx.fillStyle = "#16324a";
  ctx.font = `900 128px ${FONT}`;
  ctx.fillText("YOU WON!", cx, cardY + 232);

  // Hero art (best-effort — skip cleanly if it won't load).
  try {
    const img = await loadImage(data.art);
    const artSize = 380;
    const artX = cx - artSize / 2;
    const artY = cardY + 280;
    ctx.save();
    ctx.shadowColor = "rgba(25,63,103,0.28)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 22;
    ctx.drawImage(img, artX, artY, artSize, artSize);
    ctx.restore();
  } catch {
    // No art — leave the gap; the rest of the card still reads well.
  }

  // Pair → form detail.
  ctx.fillStyle = "#5a6b86";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(`${data.pair} → ${data.formName}`, cx, cardY + 740);

  // Three stats with a divider above.
  const statY = cardY + 900;
  ctx.strokeStyle = "rgba(120,160,200,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 70, statY - 70);
  ctx.lineTo(cardX + cardW - 70, statY - 70);
  ctx.stroke();

  const stats = [
    ["SCORE", String(data.score)],
    ["PLACE", data.place],
    ["FORMS", data.forms],
  ];
  const colW = cardW / 3;
  stats.forEach(([label, value], i) => {
    const sx = cardX + colW * i + colW / 2;
    ctx.fillStyle = "#8497ad";
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText(label, sx, statY);
    ctx.fillStyle = "#16324a";
    ctx.font = `900 58px ${FONT}`;
    ctx.fillText(value, sx, statY + 66);
  });

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clearHintJitter() {
  elements.board
    ?.querySelectorAll(".tile.hint-jitter")
    .forEach((el) => el.classList.remove("hint-jitter"));
}

function canShowHints() {
  return canInteractWithBoard() && !selectedTile && !dragState;
}

function applyHintJitter(move) {
  // Wobble BOTH tiles of the swap so the hint shows exactly which two to trade.
  // A single wobbling tile was ambiguous — the player couldn't tell which
  // neighbour to swipe toward, so the move "didn't form a combination".
  for (const { row, col } of [move.first, move.second]) {
    elements.board
      ?.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`)
      ?.classList.add("hint-jitter");
  }
}

function hintTick() {
  hintTimer = null;

  if (!canShowHints()) {
    clearHintJitter();
    hintTimer = window.setTimeout(hintTick, HINT_RECHECK_MS);
    return;
  }

  // Rescan once the cursor runs past the end of the cached move list (start of
  // a fresh cycle, or after the board changed under us).
  if (hintCursor >= hintMoves.length) {
    hintMoves = findPossibleMoves(
      state.board,
      state.diagonalAssist,
      getStateMatchResolver(state),
    );
    hintCursor = 0;
    if (hintMoves.length === 0) {
      hintTimer = window.setTimeout(hintTick, HINT_RECHECK_MS);
      return;
    }
  }

  const move = hintMoves[hintCursor];
  hintCursor += 1;
  clearHintJitter();
  applyHintJitter(move);

  hintTimer = window.setTimeout(() => {
    clearHintJitter();
    hintTimer = window.setTimeout(hintTick, HINT_GAP_MS);
  }, HINT_JITTER_MS);
}

function startHintLoop() {
  if (hintTimer === null) {
    hintTimer = window.setTimeout(hintTick, HINT_GAP_MS);
  }
}

// Called whenever the board DOM is rebuilt so the loop rescans the new layout
// instead of wobbling tiles that have since moved.
function syncHintLoop() {
  hintCursor = hintMoves.length;
  startHintLoop();
}

function renderBoard(stateLike) {
  const boardState = boardAnimation.board ?? stateLike.board;
  const blocked =
    isAnimating ||
    stateLike.pendingEvolutionQueue.length > 0 ||
    stateLike.victory ||
    stateLike.gameOver;

  elements.board.classList.toggle("blocked", blocked);
  elements.board.innerHTML = boardState
    .map((row, rowIndex) =>
      row
        .map((tile, colIndex) => {
          if (!tile) {
            return `
              <span
                class="tile tile--empty"
                data-row="${rowIndex}"
                data-col="${colIndex}"
                aria-hidden="true"
                style="grid-row:${rowIndex + 1}; grid-column:${colIndex + 1};"
              ></span>
            `;
          }

          const color = getColor(tile.color);
          const tier = stateLike.evolutionTiers[tile.color];
          const position = { row: rowIndex, col: colIndex };
          const isSelected =
            sameTile(selectedTile, position) ||
            sameTile(dragState?.originTile, position);
          const isDragTarget = sameTile(dragState?.currentTile, position);
          const key = cellKey(rowIndex, colIndex);
          const isActive = boardAnimation.activeCells.has(key);
          const isSettling = boardAnimation.settlingCells.has(key);
          const animationClass = isActive && boardAnimation.phase
            ? `is-${boardAnimation.phase}`
            : "";
          const swapVector = isActive ? boardAnimation.swapVectors?.[key] : null;
          const swapStyle = swapVector
            ? ` --swap-dx:${swapVector.dx}; --swap-dy:${swapVector.dy};`
            : "";

          return `
            <button
              type="button"
              class="tile ${isSelected ? "selected" : ""} ${isDragTarget ? "drag-target" : ""} ${animationClass} ${tier > 1 ? "evolved" : ""} ${isSettling ? "is-settling" : ""}"
              data-row="${rowIndex}"
              data-col="${colIndex}"
              ${tier > 1 ? `data-tier="T${tier}"` : ""}
              style="grid-row:${rowIndex + 1}; grid-column:${colIndex + 1}; --tile-accent:${color.hex}; --tile-delay:${rowIndex * 18 + colIndex * 8}ms; color:${color.hex}${swapStyle}"
              aria-label="${color.label} tile"
              aria-selected="${isSelected ? "true" : "false"}"
            >
              <img class="tile-art" src="${getBlockAsset(tile.color, stateLike)}" alt="" />
            </button>
          `;
        })
        .join(""),
    )
    .join("") +
  boardAnimation.clearingGhosts
    .map(
      (ghost) => {
        const color = getColor(ghost.color);
        return `
          <span
            class="tile tile--ghost clearing"
            data-row="${ghost.row}"
            data-col="${ghost.col}"
            aria-hidden="true"
            style="--tile-accent:${color.hex}; --tile-delay:0ms; color:${color.hex}; grid-row:${ghost.row + 1}; grid-column:${ghost.col + 1};"
          >
            <img class="tile-art" src="${getBlockAsset(ghost.color, stateLike)}" alt="" />
            <span class="tile-burst" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          </span>
        `;
      },
    )
    .join("");
}

function syncBoardSize() {
  const shell = elements.boardShell;
  if (!shell) {
    return;
  }

  const style = window.getComputedStyle(shell);
  const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const paddingY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const frameWidth = elements.gameFrame?.clientWidth ?? shell.clientWidth;
  const frameHeight = elements.gameFrame?.clientHeight ?? shell.clientHeight;
  const availableWidth = Math.max(0, shell.clientWidth - paddingX);
  const availableHeight = Math.max(0, shell.clientHeight - paddingY);
  const boardCap = window.matchMedia("(min-width: 700px)").matches ? 920 : 580;
  const maxSize = Math.floor(
    Math.min(
      availableWidth || frameWidth,
      availableHeight || frameHeight,
      boardCap,
    ),
  );
  if (maxSize <= 0) {
    return;
  }

  elements.board.style.width = `${maxSize}px`;
  elements.board.style.height = `${maxSize}px`;
}



function getQueuePrompt(stateLike) {
  const queueItem = stateLike.pendingEvolutionQueue[0];
  if (!queueItem) {
    return "";
  }

  const color = getColor(queueItem.colorId);
  if (queueItem.tier === 2 && queueItem.step !== "form") {
    return `Choose a fusion partner for ${color.label} to unlock T2.`;
  }

  const partnerColorId =
    stateLike.evolutionFusions[queueItem.colorId]?.partnerColorId ?? queueItem.colorId;
  const partner = getColor(partnerColorId);
  return `Choose the ${color.label} + ${partner.label} form for T${queueItem.tier}.`;
}

function renderStatus(stateLike) {
  let message = stateLike.status;

  if (stateLike.pendingEvolutionQueue.length > 0) {
    message = getQueuePrompt(stateLike);
  } else if (stateLike.gameOver) {
    message = `${getBestProgressSummary(stateLike)} Start a new run or reroll to try again.`;
  } else if (stateLike._lastResolution?.cleared) {
    message = `Last clear: ${stateLike._lastResolution.cleared} tiles in ${stateLike._lastResolution.cascades} cascade${stateLike._lastResolution.cascades === 1 ? "" : "s"}.`;
  } else {
    message = `Match 3 or more to grow your leading color toward its next evolution.`;
  }

  elements.statusText.textContent = message;
}

function getMovedTileCellSet(beforeBoard, afterBoard) {
  const previousPositions = new Map();

  beforeBoard.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (tile) {
        previousPositions.set(tile.id, { row: rowIndex, col: colIndex });
      }
    });
  });

  const movedCells = new Set();
  afterBoard.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (!tile) {
        return;
      }

      const previous = previousPositions.get(tile.id);
      if (!previous || previous.row !== rowIndex || previous.col !== colIndex) {
        movedCells.add(cellKey(rowIndex, colIndex));
      }
    });
  });

  return movedCells;
}

function getFilledCellSet(board) {
  const cells = new Set();

  board.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (tile) {
        cells.add(cellKey(rowIndex, colIndex));
      }
    });
  });

  return cells;
}

function getCellSet(positions) {
  return new Set(positions.map((position) => cellKey(position.row, position.col)));
}

function drainAutoSelections() {
  while (state && !isAnimating && state.pendingEvolutionQueue.length > 0) {
    const queueItem = state.pendingEvolutionQueue[0];
    if (queueItem.step !== "form") {
      break;
    }

    // Never auto-resolve the final tier: winning the run must be an explicit
    // player choice, even for fallback families with a single synthetic form.
    if (queueItem.tier >= 4) {
      break;
    }

    const selection = getEvolutionFormSelection(state, queueItem.colorId, queueItem.tier);
    if (!selection.autoSelectFallback) {
      break;
    }

    state = selectEvolutionForm(
      state,
      queueItem.colorId,
      queueItem.tier,
      selection.options[0]?.key ?? null,
      runRng,
    );
  }
}

function renderModals(stateLike) {
  if (
    currentScreen !== "game" ||
    isAnimating ||
    stateLike.pendingEvolutionQueue.length === 0 ||
    stateLike.victory ||
    stateLike.gameOver
  ) {
    elements.modalPartner.style.display = "none";
    elements.modalForm.style.display = "none";
    return;
  }

  const queueItem = stateLike.pendingEvolutionQueue[0];
  const color = getColor(queueItem.colorId);

  if (queueItem.tier === 2 && queueItem.step !== "form") {
    elements.modalPartner.style.display = "flex";
    elements.modalForm.style.display = "none";
    elements.partnerHeadline.innerHTML = `<span style="color:${color.hex}">${color.label}</span> is ready`;
    elements.partnerOptions.innerHTML = getTopPartnerOptions(stateLike, queueItem.colorId, 3)
      .map((partner) => `
        <button
          type="button"
          class="partner-card"
          data-color-id="${queueItem.colorId}"
          data-partner-id="${partner.id}"
        >
          <span class="partner-dot" style="background:${partner.hex}"></span>
          <span class="partner-name">${partner.label}</span>
          <span class="partner-pts">${stateLike.colorMatchCounts[partner.id]} pts</span>
        </button>
      `)
      .join("");
    return;
  }

  const partnerColorId =
    stateLike.evolutionFusions[queueItem.colorId]?.partnerColorId ?? queueItem.colorId;
  const partner = getColor(partnerColorId);
  const selection = getEvolutionFormSelection(stateLike, queueItem.colorId, queueItem.tier);

  elements.modalPartner.style.display = "none";
  elements.modalForm.style.display = "flex";
  elements.formHeadline.textContent = `${color.label} + ${partner.label} · T${queueItem.tier}`;
  elements.formOptions.innerHTML = selection.options
    .map((form) => `
      <button
        type="button"
        class="form-card"
        data-color-id="${queueItem.colorId}"
        data-tier="${queueItem.tier}"
        data-form-key="${form.key}"
      >
        <img class="form-img" src="${form.asset ?? getBaseBlockAsset(queueItem.colorId)}" alt="" />
        <span class="form-name">${form.name}</span>
      </button>
    `)
    .join("");
}

function renderGameoverScreen(stateLike) {
  if (currentScreen !== "gameover" || !stateLike?.gameOver) {
    return;
  }

  elements.gameoverDetail.textContent = `${getBestProgressSummary(stateLike)} Start a new run.`;
  elements.gameoverScore.textContent = `${stateLike.score}`;
}

function getVictoryRank() {
  return { rank: 1, total: 1 };
}

function renderVictoryScreen(stateLike) {
  if (currentScreen !== "victory" || !stateLike?.victoryMeta) {
    return;
  }

  const color = getColor(stateLike.victoryMeta.colorId);
  const partner = getColor(stateLike.victoryMeta.partnerColorId);
  const winningForm = getChosenEvolutionForm(stateLike, stateLike.victoryMeta.colorId, 4);
  const victoryRank = getVictoryRank(stateLike);
  const formsCollected = `${discoveredCount(progress)}/${TOTAL_APEX_FORMS}`;

  elements.victoryTitle.textContent = "YOU WON!";
  elements.victoryDetail.textContent = `${color.label} + ${partner.label} → ${stateLike.victoryMeta.formName}`;
  elements.victoryScore.textContent = `${stateLike.score}`;
  elements.victoryPlace.textContent = `#${victoryRank.rank} of ${victoryRank.total}`;
  if (elements.victoryForms) {
    elements.victoryForms.textContent = formsCollected;
  }
  elements.victoryArt.src = winningForm?.asset ?? "./assets/blu-logo.png";

  // Everything the PNG share card needs, captured at win time so the Share
  // button can redraw it on demand (incl. after the player navigates away).
  victoryShareData = {
    formName: stateLike.victoryMeta.formName,
    pair: `${color.label} + ${partner.label}`,
    accent: color.hex,
    accent2: partner.hex,
    score: stateLike.score,
    place: `#${victoryRank.rank} of ${victoryRank.total}`,
    forms: formsCollected,
    reward: VICTORY_REWARD,
    art: winningForm?.asset ?? "./assets/blu-logo.png",
  };
}

let victoryShareData = null;

// Defensive color lookup for persisted leaderboard entries: a legacy or partial
// record (missing/renamed color field) must not crash the whole list render.
function colorLabel(id) {
  return getColor(id)?.label ?? "Unknown";
}

function renderLeaderboard() {
  if (currentScreen !== "leaderboard") {
    return;
  }

  const entries = remoteLeaderboard;

  const toRow = (entry, index, value, title) => ({
    rank: index + 1,
    account: escapeHtml(entry.accountName || "Guest"),
    avatarUrl: safeImgSrc(entry.avatarUrl || ""),
    title,
    value,
  });

  const sortByScore = [...entries]
    .sort((left, right) => right.score - left.score || left.movesUsed - right.movesUsed)
    .map((entry, index) => toRow(
      entry, index,
      `${entry.score}`,
      `${colorLabel(entry.t4Color)} + ${colorLabel(entry.t4Partner)}`,
    ));

  const sortBySpeed = [...entries]
    .sort((left, right) => left.movesUsed - right.movesUsed || right.score - left.score)
    .map((entry, index) => toRow(
      entry, index,
      `${entry.movesUsed} moves`,
      `${colorLabel(entry.t4Color)} sprint`,
    ));

  const emptyMsg = "Global leaderboard is disabled until trusted score validation is enabled.";

  const renderRows = (rows) =>
    rows.length === 0
      ? `<div class="leaderboard-empty">${emptyMsg}</div>`
      : rows
          .map((row) => {
            const tierClass =
              row.rank <= 3 ? ` is-top3 is-rank${row.rank}` : row.rank <= 10 ? " is-top10" : "";
            const rankCell =
              row.rank <= 3
                ? `<span class="leaderboard-medal" aria-hidden="true">${row.rank}</span><span class="sr-only">Rank ${row.rank}</span>`
                : `#${row.rank}`;
            const avatar = row.avatarUrl
              ? `<img class="leaderboard-avatar" src="${row.avatarUrl}" alt="" aria-hidden="true" />`
              : `<span class="leaderboard-avatar leaderboard-avatar--placeholder" aria-hidden="true"></span>`;
            return `
              <div class="leaderboard-row${tierClass}">
                <div class="leaderboard-rank">${rankCell}</div>
                ${avatar}
                <div class="leaderboard-user">
                  <span class="leaderboard-title">${row.account}</span>
                  <span class="leaderboard-meta">${escapeHtml(row.title)}</span>
                </div>
                <div class="leaderboard-value">${escapeHtml(row.value)}</div>
              </div>
            `;
          })
          .join("");

  elements.leaderboardContent.innerHTML = `
    <div class="leaderboard-columns">
      <section class="leaderboard-column">
        <div class="leaderboard-column-head">
          <h3>All Time</h3>
        </div>
        <div class="leaderboard-list">
          ${renderRows(sortByScore)}
        </div>
      </section>
      <section class="leaderboard-column">
        <div class="leaderboard-column-head">
          <h3>Speed Run</h3>
        </div>
        <div class="leaderboard-list">
          ${renderRows(sortBySpeed)}
        </div>
      </section>
    </div>
  `;
}

// Lifetime meta-progression banner shown on profile and leaderboard surfaces.
function renderStatsHeader() {
  const fewest = progress.fewestMovesWin;
  const stat = (label, value) =>
    `<div class="lifetime-stat"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
  return `
    <div class="lifetime-stats">
      ${stat("Best", String(progress.bestScore ?? 0))}
      ${stat("Wins", String(progress.wins ?? 0))}
      ${stat("Runs", String(progress.runs ?? 0))}
      ${stat("Forms", `${discoveredCount(progress)}/${TOTAL_APEX_FORMS}`)}
      ${fewest != null ? stat("Fastest", `${fewest} mv`) : ""}
    </div>
  `;
}

function renderCollectionGrid() {
  const entries = getCollectionEntries(progress);
  const cards = entries
    .map(
      (entry) => `
        <div class="collection-card ${entry.discovered ? "is-owned" : "is-locked"}" title="${escapeHtml(entry.discovered ? entry.name : "Undiscovered apex form")}">
          <div class="collection-art">
            ${
              entry.discovered
                ? `<img src="${entry.asset}" alt="${escapeHtml(entry.name)}" />`
                : `<img class="collection-art-blurred" src="${entry.asset}" alt="" aria-hidden="true" /><span class="collection-lock" aria-hidden="true">🔒</span>`
            }
            ${entry.count > 1 ? `<span class="collection-count">×${entry.count}</span>` : ""}
          </div>
          <span class="collection-name">${entry.discovered ? escapeHtml(entry.name) : "Locked"}</span>
        </div>
      `,
    )
    .join("");
  return `
    <div class="collection-grid">${cards}</div>
  `;
}

function render() {
  document.body.dataset.theme = document.body.dataset.theme || "light";
  if (state) {
    drainAutoSelections();
  }

  setScreen(currentScreen);
  renderAuth();
  renderLeaderboard();
  renderProfile();

  if (!state) {
    return;
  }

  if (currentScreen === "victory") {
    renderVictoryScreen(state);
    return;
  }

  if (currentScreen === "gameover") {
    renderGameoverScreen(state);
    return;
  }

  if (currentScreen !== "game") {
    return;
  }

  renderTopBar(state);
  renderColorRoster(state);
  renderVibeStrip(state);
  renderBoardGlow();
  renderBoard(state);
  renderStatus(state);
  renderModals(state);
  if (!elements.board.style.width || !elements.board.style.height) {
    scheduleBoardSizeSync();
  }
  syncHintLoop();
}

function scheduleBoardSizeSync() {
  if (boardSizeFrame !== null) {
    return;
  }

  boardSizeFrame = window.requestAnimationFrame(() => {
    boardSizeFrame = null;
    syncBoardSize();
  });
}

async function playResolutionAnimation(resolution, swappedBoard, first, second) {
  if (resolution.cascadeSteps.length === 0) {
    return;
  }

  // The board is already rendered in its post-swap layout, so each swapped tile
  // must start translated toward the cell it came from and slide into place.
  // The tile now sitting in `first` originated at `second` (and vice versa).
  setBoardAnimation({
    board: swappedBoard,
    activeCells: new Set([
      cellKey(first.row, first.col),
      cellKey(second.row, second.col),
    ]),
    swapVectors: {
      [cellKey(first.row, first.col)]: {
        dx: second.col - first.col,
        dy: second.row - first.row,
      },
      [cellKey(second.row, second.col)]: {
        dx: first.col - second.col,
        dy: first.row - second.row,
      },
    },
    phase: "swapping",
  });
  render();

  await delay(SWAP_ANIMATION_MS);

  for (let stepIndex = 0; stepIndex < resolution.cascadeSteps.length; stepIndex += 1) {
    const step = resolution.cascadeSteps[stepIndex];
    const clearingCells = getCellSet(step.clearedTiles);
    setBoardAnimation({
      board: step.boardAfterClear,
      activeCells: clearingCells,
      phase: "clearing",
      clearingGhosts: step.clearedTiles.map((position) => ({
        row: position.row,
        col: position.col,
        color: position.color,
      })),
    });
    render();
    pulseBoardImpact();

    // Audio + combo feedback rise with cascade depth.
    sfx(stepIndex === 0 ? "match" : "cascade", stepIndex);
    buzz(Math.min(45, 12 + stepIndex * 8));
    if (stepIndex >= 1) {
      spawnComboPopup(`Combo ×${stepIndex + 1}`, stepIndex);
    }

    await delay(CLEAR_ANIMATION_MS);

    const movedCells = getMovedTileCellSet(step.boardAfterClear, step.boardAfterCollapse);
    setBoardAnimation({
      board: step.boardAfterCollapse,
      activeCells: movedCells,
      phase: "falling",
    });
    render();

    await delay(DROP_ANIMATION_MS + DROP_STAGGER_MS);

    setBoardAnimation({
      board: step.boardAfterCollapse,
      settlingCells: movedCells,
    });
    render();

    await delay(CASCADE_SETTLE_MS);
  }

  const gained = resolution.scoreDelta ?? 0;
  if (gained > 0) {
    spawnScoreFloater(gained, resolution.cascadeSteps.length);
  }

  if (resolution.shuffled && resolution.boardAfterShuffle) {
    setBoardAnimation({
      board: resolution.boardAfterShuffle,
      activeCells: getFilledCellSet(resolution.boardAfterShuffle),
      phase: "reshuffling",
    });
    render();

    await delay(RESHUFFLE_ANIMATION_MS);
  }
}

async function playRejectAnimation(first, second) {
  if (!state) {
    return;
  }

  isAnimating = true;
  setBoardAnimation({
    board: state.board,
    activeCells: new Set([
      cellKey(first.row, first.col),
      cellKey(second.row, second.col),
    ]),
    swapVectors: {
      [cellKey(first.row, first.col)]: {
        dx: second.col - first.col,
        dy: second.row - first.row,
      },
      [cellKey(second.row, second.col)]: {
        dx: first.col - second.col,
        dy: first.row - second.row,
      },
    },
    phase: "rejecting",
  });
  render();

  await delay(REJECT_ANIMATION_MS);

  resetBoardAnimation();
  isAnimating = false;
}

async function performSwap(first, second) {
  const currentState = state;
  const nextState = attemptSwap(currentState, first, second, runRng);
  const resolution = nextState._lastResolution;
  const didMatch = nextState.movesUsed > currentState.movesUsed;

  if (!didMatch || !resolution) {
    selectedTile = null;
    sfx("invalid");
    buzz(40);
    await playRejectAnimation(first, second);
    applyState(nextState);
    return;
  }

  isAnimating = true;
  selectedTile = null;
  logRunAction({ type: "swap", first, second });
  sfx("swap");
  buzz(12);
  const swappedBoard = previewSwap(currentState.board, first, second);
  try {
    await playResolutionAnimation(resolution, swappedBoard, first, second);
  } catch (error) {
    console.error("Match animation failed", error);
  } finally {
    resetBoardAnimation();
    isAnimating = false;
    applyState(nextState);
  }
}

async function handleTapSelection(tile) {
  if (!selectedTile) {
    selectedTile = tile;
    render();
    return;
  }

  if (sameTile(selectedTile, tile)) {
    selectedTile = null;
    render();
    return;
  }

  if (!areAdjacent(selectedTile, tile, state?.diagonalAssist)) {
    selectedTile = tile;
    render();
    return;
  }

  const first = selectedTile;
  await performSwap(first, tile);
}

function canInteractWithBoard() {
  return Boolean(
    state &&
      currentScreen === "game" &&
      !state.gameOver &&
      !state.victory &&
      !isAnimating &&
      !vibeIntroOpen &&
      state.pendingEvolutionQueue.length === 0,
  );
}

function handleBoardPointerDown(event) {
  if (!canInteractWithBoard()) {
    return;
  }

  const pressedTile = getTileFromElement(event.target);
  if (!pressedTile) {
    return;
  }

  dragState = {
    pointerId: event.pointerId,
    originTile: pressedTile,
    pressedTile,
    currentTile: null,
    moved: false,
  };

  elements.board.setPointerCapture(event.pointerId);
  render();
}

function handleBoardPointerMove(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const hoveredTile = getTileFromPoint(event.clientX, event.clientY);
  const previousKey = dragState.currentTile ? cellKey(dragState.currentTile.row, dragState.currentTile.col) : "";
  if (hoveredTile && areAdjacent(dragState.originTile, hoveredTile, state?.diagonalAssist)) {
    dragState.currentTile = hoveredTile;
    dragState.moved = true;
  } else {
    dragState.currentTile = null;
  }

  const nextKey = dragState.currentTile ? cellKey(dragState.currentTile.row, dragState.currentTile.col) : "";
  if (previousKey !== nextKey) {
    render();
  }
}

async function handleBoardPointerUp(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  try {
    elements.board.releasePointerCapture(event.pointerId);
  } catch {}

  const activeDrag = dragState;
  dragState = null;

  if (activeDrag.moved && activeDrag.currentTile) {
    await performSwap(activeDrag.originTile, activeDrag.currentTile);
    return;
  }

  await handleTapSelection(activeDrag.pressedTile);
}

function handleBoardPointerCancel() {
  dragState = null;
  render();
}

function bindClick(element, listener) {
  element?.addEventListener("click", listener);
}

elements.board.addEventListener("pointerdown", handleBoardPointerDown);
elements.board.addEventListener("pointermove", handleBoardPointerMove);
elements.board.addEventListener("pointerup", handleBoardPointerUp);
elements.board.addEventListener("pointercancel", handleBoardPointerCancel);
bindClick(elements.startRun, () => startRun());
bindClick(elements.startGuide, () => startRun({ guided: true }));
bindClick(elements.startLeaderboard, () => openLeaderboard("start"));
bindClick(elements.authGoogleBtn, () => handleAuthProvider("google"));
bindClick(elements.authTwitterBtn, () => handleAuthProvider("x"));
bindClick(elements.authLogoutBtn, handleAuthLogout);
bindClick(elements.authSkipBtn, handleAuthSkip);
bindClick(elements.backToStart, goToStart);
bindClick(elements.leaderboardBackBtn, closeLeaderboard);
bindClick(elements.profileBackBtn, closeProfile);
bindClick(elements.profileSignInBtn, () => openAuthModal({ force: true }));
bindClick(elements.profileLogoutBtn, handleAuthLogout);
bindClick(elements.victoryLeaderboardBtn, () => openLeaderboard("victory"));
bindClick(elements.victoryBtn, () => startRun());
bindClick(elements.gameoverBtn, () => startRun());
bindClick(elements.vibeIntroBtn, () => dismissVibeIntro());
bindClick(elements.victoryShareBtn, () => shareVictory());
bindClick(elements.muteBtn, handleMuteToggle);
bindClick(elements.muteBtnGame, handleMuteToggle);
bindClick(elements.startMuteBtn, handleMuteToggle);
bindClick(elements.rerollHud, () => {
  if (!state) return;
  resetInteractionState();
  const nextState = rerollBoard(state, runRng);
  if (nextState !== state) logRunAction({ type: "reroll" });
  applyState(nextState);
});
bindClick(elements.profileChip, () => {
  if (authState.user) {
    openProfile("start");
  } else {
    openAuthModal({ force: true });
  }
});
// Audio playback is blocked until a user gesture — unlock on first touch, and
// kick off the start-screen ambience if we're still sitting on the menu.
window.addEventListener(
  "pointerdown",
  () => {
    unlockAudio();
    if ((currentScreen === "start" || currentScreen === "game") && !isMuted()) {
      startMusic();
    }
  },
  { once: true },
);
bindClick(elements.rerollRun, () => {
  if (!state) {
    return;
  }

  resetInteractionState();
  const nextState = rerollBoard(state, runRng);
  if (nextState !== state) logRunAction({ type: "reroll" });
  applyState(nextState);
});
elements.partnerOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-color-id][data-partner-id]");
  if (!button || !state) {
    return;
  }

  sfx("ui");
  const nextState = selectFusionPartner(state, button.dataset.colorId, button.dataset.partnerId);
  if (nextState !== state) {
    logRunAction({
      type: "partner",
      colorId: button.dataset.colorId,
      partnerId: button.dataset.partnerId,
    });
  }
  applyState(nextState);
});
elements.formOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-color-id][data-tier][data-form-key]");
  if (!button || !state) {
    return;
  }

  sfx("evolve");
  buzz([0, 30, 40, 30]);
  const nextState = selectEvolutionForm(
    state,
    button.dataset.colorId,
    Number(button.dataset.tier),
    button.dataset.formKey,
    runRng,
  );
  if (nextState !== state) {
    logRunAction({
      type: "form",
      colorId: button.dataset.colorId,
      tier: Number(button.dataset.tier),
      formKey: button.dataset.formKey,
    });
  }
  applyState(nextState);
});
window.addEventListener("resize", () => {
  if (currentScreen === "game" || currentScreen === "gameover") {
    scheduleBoardSizeSync();
  }
});

// Browser history routing: each screen push pushes a URL fragment so
// the browser back/forward buttons navigate between screens.
window.addEventListener("popstate", (e) => {
  const screen = e.state?.screen || "start";
  _inPopstate = true;
  _historyDepth = Math.max(0, _historyDepth - 1);
  if (screen === "start") {
    guideTour?.stop();
    resetInteractionState();
  }
  currentScreen = screen;
  setScreen(screen);
  render();
  _inPopstate = false;
});

// Set initial history entry (don't clobber OAuth fragment/code if redirect just landed).
// PKCE flow returns ?code=… in query string; implicit flow returns #access_token in hash.
const _hasOAuthCode = new URLSearchParams(location.search).has("code");
if (!_hasOAuthCode && !/access_token|error_description/.test(location.hash)) {
  // Restore navigable screens from the URL hash on page refresh.
  // Game/victory/gameover can't be restored (no persisted game state) — fall back to start.
  const hashScreen = location.hash.replace(/^#/, "") || "start";
  const initialScreen = ["profile", "leaderboard"].includes(hashScreen) ? hashScreen : "start";
  if (initialScreen === "leaderboard") lastScreenBeforeLeaderboard = "start";
  if (initialScreen === "profile") lastScreenBeforeProfile = "start";
  currentScreen = initialScreen;
  history.replaceState(
    { screen: initialScreen },
    "",
    location.pathname + (initialScreen !== "start" ? "#" + initialScreen : ""),
  );
}
syncMuteButton();
updateProfileChip();
initializeAuth();

render();

// If restored to leaderboard on refresh, kick off the remote data fetch.
if (currentScreen === "leaderboard") {
  fetchGlobalLeaderboard()
    .then((entries) => {
      remoteLeaderboard = entries;
      if (currentScreen === "leaderboard") renderLeaderboard();
    })
    .catch(() => {});
}

// Refresh profile data when the tab becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (currentScreen === "profile" && authState.user) {
    fetchUserProgress()
      .then(applyRemoteProgress)
      .catch(() => {})
      .then(() => { if (currentScreen === "profile") render(); });
  }
});
