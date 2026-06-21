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
  getTopPartnerOptions,
  previewSwap,
  rerollBoard,
  selectEvolutionForm,
  selectFusionPartner,
} from "./game.js?v=20260621-gameplay-8";
import { runTour } from "./coachmarks.js?v=20260618-1";
import { sfx, buzz, unlockAudio, isMuted, toggleMute, startMusic, stopMusic, isMusicPlaying } from "./audio.js?v=20260618-8";
import { initAuth, signInWithProvider, signOut } from "./auth.js?v=20260617-3";
import {
  loadProgress,
  saveProgress,
  setProgressUser,
  recordRunStart,
  recordWin,
  discoveredCount,
  getCollectionEntries,
  getFamilyByApexKey,
  TOTAL_APEX_FORMS,
} from "./progress.js?v=20260618-6";
import { createSeededRng, randomSeed } from "./rng.js";
import {
  fetchGlobalLeaderboard,
  fetchPublicUserEntries,
  fetchUserProgress,
  startTrustedRun,
  submitTrustedRun,
} from "./sync.js?v=20260618-12";

// TEMP TESTING KNOB: global slow-motion multiplier for the board-resolution
// animations (swap / clear / drop / cascade pause / reshuffle). Scales BOTH the
// JS pacing below AND the CSS animation durations (via the --anim-scale custom
// property, set at startup) so they stay in sync. Set back to 1 to restore
// normal speed.
const ANIM_SCALE = 1;
// Dedicated, stronger multiplier for JUST the tile DISAPPEARANCE animation (the
// clear/pop/dissolve), so you can watch exactly which tiles vanish. Independent
// of ANIM_SCALE. Set to 1 for normal speed.
const CLEAR_SCALE = 1;
const SWAP_ANIMATION_MS = 210 * ANIM_SCALE;
// Quick reject shake when a swap makes no match, so an illegal move reads as
// "tried, bounced back" instead of silently doing nothing.
const REJECT_ANIMATION_MS = 300 * ANIM_SCALE;
const CLEAR_ANIMATION_MS = 280 * CLEAR_SCALE;
const DROP_ANIMATION_MS = 360 * ANIM_SCALE;
// Falling tiles are staggered by --tile-delay (up to ~190ms for the bottom-right
// cell). Hold the drop phase long enough that the last-staggered tile's
// animation finishes instead of being cut off and snapping into place.
const DROP_STAGGER_MS = 150 * ANIM_SCALE;
const CASCADE_SETTLE_MS = 80 * ANIM_SCALE;
const RESHUFFLE_ANIMATION_MS = 320 * ANIM_SCALE;
// Push the same multiplier into CSS so the keyframe durations scale in lockstep
// with the JS pacing above (see styles.css: calc(<ms> * var(--anim-scale, 1))).
document.documentElement.style.setProperty("--anim-scale", String(ANIM_SCALE));
document.documentElement.style.setProperty("--clear-scale", String(CLEAR_SCALE));
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
  leaderboardTabsHost: document.querySelector("#leaderboard-tabs-host"),
  leaderboardScreen: document.querySelector("#leaderboardScreen"),
  publicProfileScreen: document.querySelector("#publicProfileScreen"),
  publicProfileBackBtn: document.querySelector("#publicProfileBackBtn"),
  publicProfileAvatarEl: document.querySelector("#publicProfileAvatarEl"),
  publicProfileNameEl: document.querySelector("#publicProfileNameEl"),
  publicProfileContent: document.querySelector("#public-profile-content"),
  evoTreeModal: document.querySelector("#evoTreeModal"),
  evoTreeContent: document.querySelector("#evoTreeContent"),
  evoTreeClose: document.querySelector("#evoTreeClose"),
  evoTreeBackdrop: document.querySelector("#evoTreeBackdrop"),
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
// Authoritative discovered-forms count from Supabase (`user_progress.forms`),
// captured every time remote progress arrives. Drives the victory card / share
// card so the "N/36" reflects the cloud, not a local union that guest play could
// inflate. Stays null until the first remote fetch (guests fall back to local).
let cloudFormsCount = null;
// "loading" | "ready" | "error" — drives distinct leaderboard placeholder copy
// so the user can tell apart fetching, an empty board, and a network failure.
let leaderboardStatus = "loading";
// Which leaderboard category is shown on mobile (where the two columns collapse
// into a tab switcher). "score" = All Time, "speed" = Speed Run. Persists across
// re-renders so a data refresh doesn't snap the user back to the first tab.
let leaderboardTab = "score";
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

// Merge authoritative Supabase data into local progress.
// Keeps local `runs` (which counts non-winning runs too; server only counts wins).
// Forms are unioned: local wins for conflicting keys (local has the asset path; server stores null).
function applyRemoteProgress(remote) {
  if (!remote) return;
  // Cloud-authoritative forms count — captured before the local union below so
  // the victory/share card can show the true server number.
  cloudFormsCount = Object.keys(remote.forms ?? {}).length;
  const localRuns = progress.runs;
  // Take the better of local/remote for each record so a sign-in merge can
  // never regress an unsynced local best (higher score, fewer moves).
  const localBest = progress.bestScore ?? 0;
  const localFewest = progress.fewestMovesWin;
  const remoteFewest = remote.fewestMovesWin;
  const mergedFewest =
    localFewest == null
      ? remoteFewest ?? null
      : remoteFewest == null
        ? localFewest
        : Math.min(localFewest, remoteFewest);
  progress = {
    ...progress,
    wins: Math.max(progress.wins ?? 0, remote.wins ?? 0),
    runs: Math.max(localRuns, remote.runs ?? 0),
    bestScore: Math.max(localBest, remote.bestScore ?? 0),
    fewestMovesWin: mergedFewest,
    forms: { ...(remote.forms ?? {}), ...(progress.forms ?? {}) },
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
    // Record this entry's depth as `idx` so popstate can recover the true
    // depth on BOTH back and forward navigation (a blind decrement would
    // desync on forward — see popstate handler).
    _historyDepth++;
    history.pushState({ screen, idx: _historyDepth }, "", location.pathname + (hash ? "#" + hash : ""));
  }
  // Keep the Blupix ambience through the menu and active run. Only poke the
  // audio layer on a real screen change — render() calls setScreen() every
  // frame, and the first-gesture pointerdown handler already kicks off ambience.
  if (changed) {
    if (screen === "start" || screen === "game" || screen === "leaderboard" || screen === "profile" || screen === "public-profile") {
      startMusic();
    } else {
      stopMusic();
    }
  }
  elements.startScreen.hidden = screen !== "start";
  elements.gameScreen.hidden = screen !== "game";
  elements.victoryScreen.hidden = screen !== "victory";
  elements.gameoverScreen.hidden = screen !== "gameover";
  elements.leaderboardScreen.hidden = screen !== "leaderboard";
  if (elements.profileScreen) {
    elements.profileScreen.hidden = screen !== "profile";
  }
  if (elements.publicProfileScreen) {
    elements.publicProfileScreen.hidden = screen !== "public-profile";
  }
}

async function startRun({ guided = false } = {}) {
  unlockAudio();
  sfx("ui");
  recordRunStart(progress);
  _prevScore = 0; // reset score-pop baseline for the new run
  runProof = null;
  let seed = randomSeed();
  if (authState.user) {
    try {
      // Bound the trusted-run handshake so a slow/blocked start-run (e.g. a
      // CORS-disallowed origin, or flaky network) can never hang the tap on
      // "Start Run" — it falls back to a local, unverified seed instead.
      runProof = await Promise.race([
        startTrustedRun(),
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error("start-run timed out")), 8000),
        ),
      ]);
      seed = runProof.seed;
    } catch (err) {
      // Trusted run unavailable — fall back to a local seed. Without runProof
      // the eventual win can't be verified, so this is the silent point where
      // a win later fails to reach the leaderboard. Surface it instead of
      // swallowing it so the cause is diagnosable.
      console.error("[sync] startTrustedRun failed — this run will NOT be verifiable:", err);
    }
  } else {
    console.warn("[sync] run started while signed out — win will be local-only.");
  }
  runRng = createSeededRng(seed);
  state = createInitialState({
    // Pure orthogonal match-3: diagonal matches AND diagonal swaps are both off.
    // Classic feel — lines only form horizontally/vertically. Difficulty is offset
    // by power-up tiles (rocket from a match-4, bomb from a match-5 / L-T) that
    // help clear the board.
    diagonalAssist: false,
    diagonalSwaps: false,
    specialTiles: true,
    // Soft-endless: reaching T4 is a milestone, the run continues until moves run out.
    endlessRun: true,
    rng: runRng,
  });
  resetInteractionState();
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
      body: "Matches charge the meter. When the button lights up you've earned a reroll — tap it to reshuffle the whole board. You can bank only one at a time, and you start with none.",
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

// True only while there is a live, unfinished run worth returning to.
function hasLiveRun() {
  return Boolean(state && !state.victory && !state.gameOver);
}

function goToStart() {
  guideTour?.stop();
  resetInteractionState();
  clearRunProof();
  // Drop the finished/abandoned run so nothing can navigate back into a frozen
  // board (close-button fallbacks and popstate both gate on a live run).
  state = null;
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
    setScreen(lastScreenBeforeProfile === "game" && hasLiveRun() ? "game" : "start");
    render();
  }
}

async function openLeaderboard(fromScreen = currentScreen) {
  lastScreenBeforeLeaderboard = fromScreen;
  leaderboardStatus = "loading";
  setScreen("leaderboard");
  renderLeaderboard();
  try {
    const entries = await fetchGlobalLeaderboard();
    remoteLeaderboard = entries;
    leaderboardStatus = "ready";
    if (currentScreen === "leaderboard") renderLeaderboard();
  } catch {
    leaderboardStatus = "error";
    if (currentScreen === "leaderboard") renderLeaderboard();
  }
}

function closeLeaderboard() {
  if (_historyDepth > 0) {
    history.back();
  } else {
    setScreen(lastScreenBeforeLeaderboard === "game" && hasLiveRun() ? "game" : "start");
    render();
  }
}

function openPublicProfile(userId, accountName, avatarUrl) {
  if (!elements.publicProfileScreen) return;
  if (elements.publicProfileAvatarEl) {
    elements.publicProfileAvatarEl.style.backgroundImage = safeCssUrl(avatarUrl || "");
  }
  if (elements.publicProfileNameEl) {
    elements.publicProfileNameEl.textContent = accountName;
  }
  if (elements.publicProfileContent) {
    elements.publicProfileContent.innerHTML = `<div class="leaderboard-empty">Loading…</div>`;
  }
  // Clear injected stats block from a previous visit.
  elements.publicProfileScreen.querySelector(".profile-stats")?.remove();

  setScreen("public-profile");

  // Viewing your own card? Reconcile against local progress so a freshly-won
  // form shows immediately, before submit-run has propagated to
  // leaderboard_entries (read-after-write lag would otherwise hide it).
  const isSelf = Boolean(authState.user && userId === authState.user.id);

  fetchPublicUserEntries(userId)
    .then((entries) => renderPublicProfile(entries, isSelf))
    .catch(() => {
      if (currentScreen === "public-profile" && elements.publicProfileContent) {
        elements.publicProfileContent.innerHTML = `<div class="leaderboard-empty">Could not load profile.</div>`;
      }
    });
}

function closePublicProfile() {
  if (_historyDepth > 0) {
    history.back();
  } else {
    setScreen("leaderboard");
    renderLeaderboard();
  }
}

function renderPublicProfile(entries, isSelf = false) {
  if (currentScreen !== "public-profile") return;

  // Build discovered-forms map from all their leaderboard entries.
  const forms = {};
  for (const e of entries) {
    if (!e.t4FormKey) continue;
    forms[e.t4FormKey] = { count: (forms[e.t4FormKey]?.count ?? 0) + 1 };
  }

  let wins = entries.length;
  let bestScore = entries.reduce((m, e) => Math.max(m, e.score || 0), 0);
  let fastestMoves = entries.reduce((m, e) => Math.min(m, e.movesUsed ?? Infinity), Infinity);

  // On your own card, union local progress so a just-won form / stat shows
  // even before its leaderboard_entries row is readable.
  if (isSelf) {
    for (const key of Object.keys(progress.forms ?? {})) {
      if (!forms[key]) forms[key] = { count: 1 };
    }
    wins = Math.max(wins, progress.wins ?? 0);
    bestScore = Math.max(bestScore, progress.bestScore ?? 0);
    if (progress.fewestMovesWin != null) {
      fastestMoves = Math.min(fastestMoves, progress.fewestMovesWin);
    }
  }

  const formsCount = Object.keys(forms).length;

  const stat = (label, val) =>
    `<div class="lifetime-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(val))}</strong></div>`;

  const sectionHead = elements.publicProfileScreen?.querySelector(".profile-section-head");
  if (sectionHead) {
    let statsBlock = elements.publicProfileScreen.querySelector(".profile-stats");
    if (!statsBlock) {
      statsBlock = document.createElement("div");
      statsBlock.className = "profile-stats";
      sectionHead.before(statsBlock);
    }
    statsBlock.innerHTML = `<div class="lifetime-stats">
      ${stat("Wins", wins)}
      ${stat("Best", bestScore)}
      ${fastestMoves < Infinity ? stat("Fastest", `${fastestMoves} mv`) : ""}
    </div>${renderCollectionProgress(formsCount, TOTAL_APEX_FORMS)}`;
  }

  if (elements.publicProfileContent) {
    const collectionEntries = getCollectionEntries({ forms });
    const cards = collectionEntries.map((entry) => `
      <div class="collection-card ${entry.discovered ? "is-owned" : "is-locked"}" data-form-key="${escapeHtml(entry.key)}" data-discovered="${entry.discovered ? "1" : ""}" role="button" tabindex="0" title="${escapeHtml(entry.discovered ? entry.name : "Undiscovered apex form")}">
        <div class="collection-art">
          ${
            entry.discovered
              ? `<img src="${entry.asset}" alt="${escapeHtml(entry.name)}" />`
              : `<img class="collection-art-blurred" src="${entry.asset}" alt="" aria-hidden="true" /><span class="collection-lock" aria-hidden="true">🔒</span>`
          }
        </div>
        <span class="collection-name">${entry.discovered ? escapeHtml(entry.name) : "Locked"}</span>
      </div>
    `).join("");
    elements.publicProfileContent.innerHTML = `<div class="collection-grid">${cards}</div>`;
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
    const result = {
      score: nextState.score,
      movesUsed: nextState.movesUsed,
      formKey: resolvedFormKey,
      formName: formName ?? resolvedFormKey,
      colorId,
      partnerColorId,
      vibe: nextState.vibe?.id ?? null,
    };
    console.info("[sync] submitting run result:", proof.runId, result);
    submitTrustedRun(proof.runId, result)
      .then((data) => {
        console.info("[sync] submit-run accepted:", data);
        if (data?.progress) {
          applyRemoteProgress(data.progress);
          render();
        }
        return fetchGlobalLeaderboard();
      })
      .then((entries) => { remoteLeaderboard = entries; })
      .catch((error) => {
        console.error("[sync] trusted submit failed:", error);
      })
      .finally(() => {
        if (runProof === proof) clearRunProof();
      });
  } else if (authState.user && !runProof) {
    // Signed in but no trusted run was ever established (startTrustedRun failed
    // or the run began before auth resolved). The win is recorded locally but
    // never submitted — make that visible instead of silently dropping it.
    console.error(
      "[sync] victory NOT submitted: signed in but no runProof. " +
        "startTrustedRun likely failed at run start, or the run began before sign-in.",
    );
  }
}


// One color reached T4 during a soft-endless run. Celebrate in place (no screen
// change) and record the apex form into the local cross-run collection. Does NOT
// submit to the leaderboard.
function recordEndlessT4(nextState, colorId) {
  const form = getChosenEvolutionForm(nextState, colorId, 4);
  const formKey = nextState.evolutionChoices[colorId]?.[4] ?? form?.key ?? "UNKNOWN";
  recordWin(progress, {
    formKey,
    formName: form?.name ?? formKey,
    asset: form?.asset ?? null,
    color: colorId,
    partner: nextState.evolutionFusions[colorId]?.partnerColorId ?? colorId,
    score: nextState.score,
    movesUsed: nextState.movesUsed,
  });
  updateProfileChip();
  celebrateEndlessT4();
}

// In-place T4 flash on the game frame + a celebratory sound/buzz, without leaving
// the board. Mirrors the pulseHatch animation-restart pattern.
let _t4FlashTimer = null;
function celebrateEndlessT4() {
  const frame = elements.gameFrame;
  if (frame) {
    frame.classList.remove("t4-flash");
    void frame.offsetWidth; // restart the animation if it fires twice in a row
    frame.classList.add("t4-flash");
    if (_t4FlashTimer) clearTimeout(_t4FlashTimer);
    _t4FlashTimer = setTimeout(() => {
      frame.classList.remove("t4-flash");
      _t4FlashTimer = null;
    }, 700);
  }
  sfx("victory");
  buzz([0, 80, 40, 120]);
}

function applyState(nextState) {
  const wasVictory = state?.victory;
  const prevCharges = state?.rerollCharges ?? 0;
  const prevTiers = state?.evolutionTiers ?? {};
  state = nextState;
  if ((nextState?.rerollCharges ?? 0) > prevCharges) {
    pulseHatch();
  }
  // Soft-endless: each color that newly reaches T4 this step celebrates in place
  // and is recorded into the local collection. No leaderboard submit (deferred to
  // the badge rework).
  if (nextState?.endlessRun && !nextState.victory) {
    for (const color of COLORS) {
      const before = prevTiers[color.id] ?? 1;
      const after = nextState.evolutionTiers?.[color.id] ?? 1;
      if (before < 4 && after >= 4) {
        recordEndlessT4(nextState, color.id);
      }
    }
  }
  if (!wasVictory && nextState?.victory) {
    recordVictory(nextState);
    setScreen("victory");
    sfx("victory");
    buzz([0, 90, 50, 90, 50, 160]);
    // Pull fresh cloud progress so the victory card's "N/36" reflects the
    // server count, then re-render the victory screen if we're still on it.
    // (The submit-run path in recordVictory also refreshes this once the win
    // is accepted; this covers the case where there was nothing to submit.)
    if (authState.user) {
      fetchUserProgress()
        .then((remote) => {
          applyRemoteProgress(remote);
          if (currentScreen === "victory") renderVictoryScreen(state);
        })
        .catch(() => {});
    }
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
let _scoreBumpTimer = null;
let _prevScore = 0;
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
    // Binary economy (max 1 charge): the lit button colour signals readiness,
    // so the numeric badge is only useful when there's actually a charge.
    elements.rerollHudBadge.hidden = charges <= 0;
  }

  if (elements.rerollPips?.length) {
    elements.rerollPips.forEach((pip, i) => pip.classList.toggle("is-active", i < charges));
    const pipsEl = elements.rerollPips[0]?.parentElement;
    if (pipsEl) pipsEl.dataset.charges = String(charges);
  }
  // No progress fill anymore — the button simply lights up (Enter-Run gradient)
  // once a charge is ready, and is neutral while the meter is still filling.
  elements.rerollRun.classList.toggle("has-charge", charges > 0);
  if (elements.rerollHud) {
    elements.rerollHud.classList.toggle("has-charge", charges > 0);
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
    const url = new URL(raw);
    // Return the normalized href, not the raw string: new URL() accepts
    // `"`, `<`, `>` in the path and only percent-encodes them in .href.
    // Returning raw would let those characters break out of an HTML attribute.
    return url.protocol === "https:" ? url.href : "";
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

// Floating "+score" tally that drifts up after a resolution settles. Deeper
// cascades spawn a slightly larger, hotter floater so big chains read bigger.
function spawnScoreFloater(amount, cascadeDepth = 1) {
  const layer = elements.fxLayer;
  if (!layer) {
    return;
  }
  const depth = Math.max(1, Math.min(cascadeDepth || 1, 6));
  const el = document.createElement("div");
  el.className = "fx-score";
  el.textContent = `+${amount}`;
  el.style.setProperty("--fx-x", "50%");
  el.style.setProperty("--fx-y", "60%");
  el.style.setProperty("--fx-scale", String(1 + (depth - 1) * 0.12));
  if (depth >= 3) el.classList.add("is-big-cascade");
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
            : "";
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
  syncAuthModalFocus(open);
}

// Scroll-lock + focus-trap for the auth modal, mirroring syncGameModalFocus.
// Escape dismisses the modal (same as Skip). Uses its own handler/state so it
// never collides with the game evolution modals (different screens anyway).
let _authModalOpen = false;
let _authModalKeyHandler = null;
function syncAuthModalFocus(open) {
  if (open === _authModalOpen) return;
  _authModalOpen = open;
  document.body.classList.toggle("modal-open", open);
  if (_authModalKeyHandler) {
    document.removeEventListener("keydown", _authModalKeyHandler, true);
    _authModalKeyHandler = null;
  }
  if (!open || !elements.authModal) return;
  const focusables = () => [...elements.authModal.querySelectorAll("button:not([disabled])")];
  focusables()[0]?.focus();
  _authModalKeyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAuthModal({ dismiss: true });
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (event.shiftKey && idx <= 0) {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (!event.shiftKey && idx === items.length - 1) {
      event.preventDefault();
      items[0].focus();
    } else if (idx === -1) {
      event.preventDefault();
      items[0].focus();
    }
  };
  document.addEventListener("keydown", _authModalKeyHandler, true);
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
    // Status line under the nickname removed — the old copy was misleading now
    // that cloud sync works, and the nickname alone reads cleaner.
    elements.profileStatus.hidden = true;
    elements.profileStatus.textContent = "";
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
  return {
    formName: stateLike.victoryMeta.formName,
    pair: `${color.label} + ${partner.label}`,
    accent: color.hex,
    accent2: partner.hex,
    score: stateLike.score,
    forms: `${collectedFormsCount()}/${TOTAL_APEX_FORMS}`,
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
    ["FORMS", data.forms],
  ];
  const colW = cardW / stats.length;
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
      state.diagonalSwaps,
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

          const specialClass = tile.special ? ` tile--special tile--${tile.special}` : "";
          const powerOverlay = tile.special
            ? `<span class="tile-power tile-power--${tile.special}" data-dir="${tile.dir ?? ""}" aria-hidden="true"></span>`
            : "";
          const powerLabel = tile.special === "rocket"
            ? " (rocket power-up)"
            : tile.special === "bomb"
              ? " (bomb power-up)"
              : "";

          return `
            <button
              type="button"
              class="tile ${isSelected ? "selected" : ""} ${isDragTarget ? "drag-target" : ""} ${animationClass} ${tier > 1 ? "evolved" : ""} ${isSettling ? "is-settling" : ""}${specialClass}"
              data-row="${rowIndex}"
              data-col="${colIndex}"
              ${tier > 1 ? `data-tier="T${tier}"` : ""}
              style="grid-row:${rowIndex + 1}; grid-column:${colIndex + 1}; --tile-accent:${color.hex}; --tile-delay:${rowIndex * 18 + colIndex * 8}ms; color:${color.hex};${swapStyle}"
              aria-label="${color.label} tile${powerLabel}"
              aria-selected="${isSelected ? "true" : "false"}"
            >
              <img class="tile-art" src="${getBlockAsset(tile.color, stateLike)}" alt="" />
              ${powerOverlay}
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

// Focus management + focus trap + scroll lock for the blocking evolution modals.
// renderModals runs every frame, so act only on open/close transitions to avoid
// stealing focus repeatedly. These modals require a choice, so there's no Escape
// cancel — focus is trapped on the option buttons until one is picked.
let _openGameModal = null;
let _gameModalKeyHandler = null;
function syncGameModalFocus(which) {
  if (which === _openGameModal) return;
  _openGameModal = which;
  document.body.classList.toggle("modal-open", Boolean(which));
  if (_gameModalKeyHandler) {
    document.removeEventListener("keydown", _gameModalKeyHandler, true);
    _gameModalKeyHandler = null;
  }
  if (!which) return;
  const modal = which === "partner" ? elements.modalPartner : elements.modalForm;
  if (!modal) return;
  const focusables = () => [...modal.querySelectorAll("button:not([disabled])")];
  focusables()[0]?.focus();
  _gameModalKeyHandler = (event) => {
    if (event.key !== "Tab") return;
    const items = focusables();
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (event.shiftKey && idx <= 0) {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (!event.shiftKey && idx === items.length - 1) {
      event.preventDefault();
      items[0].focus();
    } else if (idx === -1) {
      event.preventDefault();
      items[0].focus();
    }
  };
  document.addEventListener("keydown", _gameModalKeyHandler, true);
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
    syncGameModalFocus(null);
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
    syncGameModalFocus("partner");
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
  syncGameModalFocus("form");
}

function renderGameoverScreen(stateLike) {
  if (currentScreen !== "gameover" || !stateLike?.gameOver) {
    return;
  }

  elements.gameoverDetail.textContent = `${getBestProgressSummary(stateLike)} Start a new run.`;
  elements.gameoverScore.textContent = `${stateLike.score}`;
}

// Discovered-forms count for the victory/share card. Prefers the cloud number
// (`cloudFormsCount`) when signed in so a guest's local-only forms can't inflate
// it; falls back to the local collection for guests / before the first fetch.
function collectedFormsCount() {
  if (authState.user && cloudFormsCount != null) return cloudFormsCount;
  return discoveredCount(progress);
}

function renderVictoryScreen(stateLike) {
  if (currentScreen !== "victory" || !stateLike?.victoryMeta) {
    return;
  }

  const color = getColor(stateLike.victoryMeta.colorId);
  const partner = getColor(stateLike.victoryMeta.partnerColorId);
  const winningForm = getChosenEvolutionForm(stateLike, stateLike.victoryMeta.colorId, 4);
  const formsCollected = `${collectedFormsCount()}/${TOTAL_APEX_FORMS}`;

  elements.victoryTitle.textContent = "YOU WON!";
  elements.victoryDetail.textContent = `${color.label} + ${partner.label} → ${stateLike.victoryMeta.formName}`;
  elements.victoryScore.textContent = `${stateLike.score}`;
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
    userId: entry.userId ?? "",
    account: escapeHtml(entry.accountName || "Guest"),
    avatarUrl: safeImgSrc(entry.avatarUrl || ""),
    title,
    value,
  });

  // Dedup independently per section so a fast run isn't hidden by a higher-score run.
  const dedup = (arr, better) => [...arr.reduce((m, e) => {
    if (!m.has(e.userId) || better(e, m.get(e.userId))) m.set(e.userId, e);
    return m;
  }, new Map()).values()];

  const sortByScore = dedup(entries, (a, b) => a.score > b.score || (a.score === b.score && a.movesUsed < b.movesUsed))
    .sort((left, right) => right.score - left.score || left.movesUsed - right.movesUsed)
    .slice(0, 100)
    .map((entry, index) => toRow(
      entry, index,
      `${entry.score}`,
      `${colorLabel(entry.t4Color)} + ${colorLabel(entry.t4Partner)}`,
    ));

  const sortBySpeed = dedup(entries, (a, b) => a.movesUsed < b.movesUsed || (a.movesUsed === b.movesUsed && a.score > b.score))
    .sort((left, right) => left.movesUsed - right.movesUsed || right.score - left.score)
    .slice(0, 100)
    .map((entry, index) => toRow(
      entry, index,
      `${entry.movesUsed} moves`,
      `${colorLabel(entry.t4Color)} sprint`,
    ));

  const emptyMsg =
    leaderboardStatus === "loading"
      ? "Loading leaderboard…"
      : leaderboardStatus === "error"
        ? "Couldn’t load the leaderboard. Check your connection and reopen to retry."
        : "No scores yet — win a run to claim the first spot.";

  const renderRows = (rows) =>
    rows.length === 0
      ? `<div class="leaderboard-empty">${escapeHtml(emptyMsg)}</div>`
      : rows
          .map((row) => {
            const tierClass =
              row.rank <= 3 ? ` is-top3 is-rank${row.rank}` : row.rank <= 10 ? " is-top10" : "";
            const rankCell =
              row.rank <= 3
                ? `<span class="leaderboard-medal" aria-hidden="true">${row.rank}</span><span class="sr-only">Rank ${row.rank}</span>`
                : `#${row.rank}`;
            const avatar = row.avatarUrl
              ? `<img class="leaderboard-avatar" src="${escapeHtml(row.avatarUrl)}" alt="" aria-hidden="true" />`
              : `<span class="leaderboard-avatar leaderboard-avatar--placeholder" aria-hidden="true"></span>`;
            const userBtn = row.userId
              ? `<button class="leaderboard-user-btn" type="button" data-user-id="${escapeHtml(row.userId)}" data-account="${row.account}" data-avatar="${escapeHtml(row.avatarUrl)}" aria-label="View ${row.account}'s profile">${avatar}<div class="leaderboard-user"><span class="leaderboard-title">${row.account}</span><span class="leaderboard-meta">${escapeHtml(row.title)}</span></div></button>`
              : `${avatar}<div class="leaderboard-user"><span class="leaderboard-title">${row.account}</span><span class="leaderboard-meta">${escapeHtml(row.title)}</span></div>`;
            return `
              <div class="leaderboard-row${tierClass}">
                <div class="leaderboard-rank">${rankCell}</div>
                ${userBtn}
                <div class="leaderboard-value">${escapeHtml(row.value)}</div>
              </div>
            `;
          })
          .join("");

  // Tabs are visible only on mobile (CSS), where the two columns collapse into a
  // switcher; on desktop both columns show side-by-side and the tabs are hidden.
  const tab = (id, label) =>
    `<button class="leaderboard-tab${leaderboardTab === id ? " is-active" : ""}" type="button" role="tab" data-tab="${id}" aria-selected="${leaderboardTab === id ? "true" : "false"}">${label}</button>`;

  // Tabs render into their own host above the scroll container; the columns of
  // record cards render into the scrolling content below.
  if (elements.leaderboardTabsHost) {
    elements.leaderboardTabsHost.innerHTML = `
      <div class="leaderboard-tabs" role="tablist" aria-label="Leaderboard category">
        ${tab("score", "All Time")}
        ${tab("speed", "Speed Run")}
      </div>
    `;
  }

  elements.leaderboardContent.innerHTML = `
    <div class="leaderboard-columns" data-active="${leaderboardTab}">
      <section class="leaderboard-column" data-col="score">
        <div class="leaderboard-column-head">
          <h3>All Time</h3>
        </div>
        <div class="leaderboard-list">
          ${renderRows(sortByScore)}
        </div>
      </section>
      <section class="leaderboard-column" data-col="speed">
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

// Holographic collection-completion hero. Shared by own + public profile so the
// "journey to 36" reads the same everywhere. `discovered`/`total` are plain ints.
function renderCollectionProgress(discovered, total) {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((discovered / total) * 100))) : 0;
  const complete = total > 0 && discovered >= total;
  return `
    <div class="collection-progress${complete ? " is-complete" : ""}">
      <div class="cp-head">
        <span class="cp-label">Form Collection</span>
        <span class="cp-count"><strong>${discovered}</strong><span class="cp-total">/ ${total}</span></span>
      </div>
      <div class="cp-track" role="progressbar" aria-valuenow="${discovered}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Forms discovered">
        <div class="cp-fill" style="width:${pct}%"></div>
      </div>
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
      ${fewest != null ? stat("Fastest", `${fewest} mv`) : ""}
    </div>
    ${renderCollectionProgress(discoveredCount(progress), TOTAL_APEX_FORMS)}
  `;
}

function renderCollectionGrid() {
  const entries = getCollectionEntries(progress);
  const cards = entries
    .map(
      (entry) => `
        <div class="collection-card ${entry.discovered ? "is-owned" : "is-locked"}" data-form-key="${escapeHtml(entry.key)}" data-discovered="${entry.discovered ? "1" : ""}" role="button" tabindex="0" title="${escapeHtml(entry.discovered ? entry.name : "Undiscovered apex form")}">
          <div class="collection-art">
            ${
              entry.discovered
                ? `<img src="${entry.asset}" alt="${escapeHtml(entry.name)}" />`
                : `<img class="collection-art-blurred" src="${entry.asset}" alt="" aria-hidden="true" /><span class="collection-lock" aria-hidden="true">🔒</span>`
            }
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

// ── Evolution-tree popup ──────────────────────────────────────────────────
// Tapping a form card (own or public profile) opens its full canon evolution
// line: T1 base color pair → T2 (5) → T3 (3) → T4 apex. A locked apex is shown
// as a blurred silhouette so the gallery's reveal isn't spoiled, while the
// intermediate tiers stay visible as a hint of where the form grows from.
const EVO_COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c]));

function evoNode({ tier, asset, name, locked = false, blockColor = null }) {
  const art = locked
    ? `<img class="collection-art-blurred" src="${asset}" alt="" aria-hidden="true" /><span class="collection-lock" aria-hidden="true">🔒</span>`
    : `<img src="${asset}" alt="${escapeHtml(name)}" />`;
  return `
    <div class="evo-node${locked ? " is-locked" : ""}${blockColor ? " evo-node--base" : ""}">
      <span class="evo-tier-tag">${tier}</span>
      <div class="evo-node-art"${blockColor ? ` style="--evo-base:${escapeHtml(blockColor)}"` : ""}>${art}</div>
      <span class="evo-node-name">${locked ? "???" : escapeHtml(name)}</span>
    </div>`;
}

function buildEvoTree(family, apexDiscovered) {
  const apex = (family.forms?.[4] ?? [])[0];
  const t3 = family.forms?.[3] ?? [];
  const t2 = family.forms?.[2] ?? [];
  const pair = family.pair ?? [];

  const apexHtml = apex
    ? evoNode({ tier: "T4", asset: apex.asset, name: apex.name, locked: !apexDiscovered })
    : "";
  const t3Html = t3.map((f) => evoNode({ tier: "T3", asset: f.asset, name: f.name })).join("");
  const t2Html = t2.map((f) => evoNode({ tier: "T2", asset: f.asset, name: f.name })).join("");
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

let _evoKeyHandler = null;
function openEvoTree(apexKey, discovered) {
  const family = getFamilyByApexKey(apexKey);
  if (!family || !elements.evoTreeModal || !elements.evoTreeContent) return;
  elements.evoTreeContent.innerHTML = buildEvoTree(family, discovered);
  elements.evoTreeModal.hidden = false;
  elements.evoTreeModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  sfx("ui");
  elements.evoTreeClose?.focus();
  _evoKeyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEvoTree();
    }
  };
  document.addEventListener("keydown", _evoKeyHandler, true);
}

function closeEvoTree() {
  if (!elements.evoTreeModal || elements.evoTreeModal.hidden) return;
  elements.evoTreeModal.hidden = true;
  elements.evoTreeModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (_evoKeyHandler) {
    document.removeEventListener("keydown", _evoKeyHandler, true);
    _evoKeyHandler = null;
  }
}

function handleCollectionActivate(event) {
  const card = event.target.closest?.(".collection-card[data-form-key]");
  if (!card) return;
  if (event.type === "keydown") {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
  }
  openEvoTree(card.dataset.formKey, card.dataset.discovered === "1");
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

  if (!areAdjacent(selectedTile, tile, state?.diagonalSwaps)) {
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
  if (hoveredTile && areAdjacent(dragState.originTile, hoveredTile, state?.diagonalSwaps)) {
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
bindClick(elements.publicProfileBackBtn, closePublicProfile);
// Tabs now live in their own host above the scroll container, so switching
// categories doesn't scroll with (or get hidden by) the list of record cards.
elements.leaderboardTabsHost?.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".leaderboard-tab");
  if (!tabBtn?.dataset.tab) return;
  leaderboardTab = tabBtn.dataset.tab;
  const cols = elements.leaderboardContent.querySelector(".leaderboard-columns");
  if (cols) cols.dataset.active = leaderboardTab;
  elements.leaderboardTabsHost.querySelectorAll(".leaderboard-tab").forEach((t) => {
    const on = t.dataset.tab === leaderboardTab;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  sfx("ui");
});
elements.leaderboardContent?.addEventListener("click", (e) => {
  const btn = e.target.closest(".leaderboard-user-btn");
  if (btn?.dataset.userId) {
    openPublicProfile(btn.dataset.userId, btn.dataset.account, btn.dataset.avatar);
  }
});
elements.profileContent?.addEventListener("click", handleCollectionActivate);
elements.profileContent?.addEventListener("keydown", handleCollectionActivate);
elements.publicProfileContent?.addEventListener("click", handleCollectionActivate);
elements.publicProfileContent?.addEventListener("keydown", handleCollectionActivate);
bindClick(elements.evoTreeClose, closeEvoTree);
bindClick(elements.evoTreeBackdrop, closeEvoTree);
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
  // Only log when a charge was actually spent — a no-charge click returns a
  // status-only state that must not pollute the run action log / replay budget.
  if ((nextState.rerollCharges ?? 0) < (state.rerollCharges ?? 0)) logRunAction({ type: "reroll" });
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
// kick off the start-screen ambience if we're still sitting on the menu. We keep
// listening (not { once: true }) until music actually starts: the very first tap
// can be on an OAuth login button, which navigates away and aborts the music
// fetch, so a single-shot listener would leave the start screen permanently
// silent after the redirect returns. Self-removes once ambience is confirmed
// playing (or the player has muted).
function primeAudioOnGesture() {
  unlockAudio();
  if ((currentScreen === "start" || currentScreen === "game") && !isMuted()) {
    startMusic();
  }
  if (isMusicPlaying() || isMuted()) {
    window.removeEventListener("pointerdown", primeAudioOnGesture);
  }
}
window.addEventListener("pointerdown", primeAudioOnGesture);
bindClick(elements.rerollRun, () => {
  if (!state) {
    return;
  }

  resetInteractionState();
  const nextState = rerollBoard(state, runRng);
  // Only log when a charge was actually spent (see HUD reroll handler above).
  if ((nextState.rerollCharges ?? 0) < (state.rerollCharges ?? 0)) logRunAction({ type: "reroll" });
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

// Portrait-only on mobile. Best-effort native lock (Android Chrome / installed
// PWAs); iOS Safari ignores it, so the CSS `.rotate-lock` overlay is the real
// guarantee. Wrapped in try/catch because lock() rejects on unsupported
// browsers and throws synchronously in some engines.
(function lockPortrait() {
  try {
    const orientation = window.screen && window.screen.orientation;
    if (orientation && typeof orientation.lock === "function") {
      const result = orientation.lock("portrait");
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    }
  } catch (_) {
    /* unsupported — CSS overlay handles it */
  }
})();

// Browser history routing: each screen push pushes a URL fragment so
// the browser back/forward buttons navigate between screens.
window.addEventListener("popstate", (e) => {
  let screen = e.state?.screen || "start";
  _inPopstate = true;
  // Recover depth from the entry's recorded idx — correct for back AND forward.
  _historyDepth = Math.max(0, e.state?.idx ?? 0);
  // Never restore a finished or absent run into the live game screen: the board
  // would be frozen (victory/gameOver blocks interaction). Send them to start.
  if (screen === "game" && (!state || state.victory || state.gameOver)) {
    screen = "start";
    history.replaceState({ screen: "start", idx: _historyDepth }, "", location.pathname);
  }
  if (screen === "start") {
    guideTour?.stop();
    resetInteractionState();
  }
  currentScreen = screen;
  setScreen(screen);
  render();
  _inPopstate = false;
});

// Capture any demo-screen request BEFORE the history.replaceState below strips
// the query string from the URL (otherwise `?demo=…` is gone by the time
// maybeRunDemoScreen() reads it, and we'd fall back to the start/auth screen).
const _demoScreen = (() => {
  const q = new URLSearchParams(location.search).get("demo");
  if (q) return q;
  if (location.hash.startsWith("#demo-")) return location.hash.slice("#demo-".length);
  return null;
})();

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
  // Keep `?demo=…` in the URL so a refresh re-enters the demo; otherwise use the hash.
  const _suffix = _demoScreen
    ? "?demo=" + encodeURIComponent(_demoScreen)
    : (initialScreen !== "start" ? "#" + initialScreen : "");
  history.replaceState({ screen: initialScreen, idx: 0 }, "", location.pathname + _suffix);
}
syncMuteButton();
updateProfileChip();
initializeAuth();

render();

// ── Demo shortcut ─────────────────────────────────────────────────────────
// Jump straight to an end screen with sample data so the design can be reviewed
// without playing a full run. Use `?demo=victory` or `?demo=gameover` in the URL
// (also accepts `#demo-victory` / `#demo-gameover`). No effect when absent.
function maybeRunDemoScreen() {
  const which = _demoScreen;
  if (which !== "victory" && which !== "gameover") return;

  const demo = createInitialState({ diagonalAssist: true, rng: createSeededRng(12345) });
  // Give the leader-color summary something concrete to report.
  const leadId = COLORS[0].id;
  demo.evolutionTiers[leadId] = 3;
  demo.colorMatchCounts[leadId] = 24;

  if (which === "victory") {
    demo.score = 12840;
    demo.victory = true;
    demo.victoryMeta = {
      colorId: COLORS[0].id,
      partnerColorId: COLORS[1].id,
      formName: "Aurora Prime",
      formKey: "demo-apex",
    };
    state = demo;
    setScreen("victory");
  } else {
    demo.score = 7320;
    demo.gameOver = true;
    state = demo;
    setScreen("gameover");
  }
  render();
  // eslint-disable-next-line no-console
  console.info(`[demo] showing ${which} screen — clear ?demo= from the URL to exit.`);
}
maybeRunDemoScreen();

// If restored to leaderboard on refresh, kick off the remote data fetch.
if (currentScreen === "leaderboard") {
  leaderboardStatus = "loading";
  fetchGlobalLeaderboard()
    .then((entries) => {
      remoteLeaderboard = entries;
      leaderboardStatus = "ready";
      if (currentScreen === "leaderboard") renderLeaderboard();
    })
    .catch(() => {
      leaderboardStatus = "error";
      if (currentScreen === "leaderboard") renderLeaderboard();
    });
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
