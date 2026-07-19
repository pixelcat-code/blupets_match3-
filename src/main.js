import {
  activeBadgeFormKey,
  COLORS,
  VIBES,
  NEUTRAL_VIBE,
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
  selectEvolutionForm,
  selectFusionPartner,
} from "./game.js?v=20260717-special-spawn-1";
import { runTour } from "./coachmarks.js?v=20260618-1";
import { sfx, buzz, unlockAudio, isMuted, toggleMute, startMusic, stopMusic, isMusicPlaying } from "./audio.js?v=20260625-mobile-audio-2";
import { initAuth, signInWithProvider, signInWithUsername, signUpWithUsername, updateDisplayName, uploadAvatar, updateAvatarUrl, signOut } from "./auth.js?v=20260629-signin-guard-1";
import {
  loadProgress,
  setProgressUser,
  recordRunStart,
  recordWin,
  discoveredCount,
  getCollectionEntries,
  getCollectionTileEntries,
  getAscendedKeyByFormKey,
  getLineageByAscendedKey,
  TOTAL_APEX_FORMS,
  TOTAL_FAMILIES,
  TOTAL_INVENTORY_FORMS,
  COLLECTION_TIERS,
  COLLECTION_TIER_LABEL,
  SHARDS_PER_CAPSULE,
  foldRun,
  lineageStageLevel,
  collectionLineageStageLevel,
  ascendedLineageCount,
  collectionTileCount,
  openCapsule,
  exchangeShardsForCapsules,
  getMilestoneBadges,
  milestoneCapsuleReward,
  checkMilestoneCapsules,
  getSaraiHeartQuest,
  recordSaraiHeartMatches,
  SARAI_HEART_QUEST_ID,
  SARAI_HEART_QUEST_REWARD,
  SARAI_HEART_QUEST_TARGET,
} from "./progress.js?v=20260628-guest-gating-1";
import { createSeededRng, randomSeed } from "./rng.js?v=20260710-1";
import {
  fetchGlobalLeaderboard,
  fetchPublicUserEntries,
  fetchPublicCollectionTiles,
  fetchUserProgress,
  createTournamentRoom,
  fetchTournamentLeaderboard,
  getTournamentRoom,
  startTournamentRoom,
  removeTournamentPlayer,
  setTournamentReady,
  startGuestRun,
  startTournamentRun,
  startTrustedRun,
  submitGuestRun,
  submitTournamentRun,
  saveTournamentDraft,
  syncProfile,
  syncProgressSnapshot,
  submitTrustedRun,
  subscribeTournamentRoom,
  unsubscribeTournamentRoom,
  presenceTrack,
  sendTournamentBroadcast,
  fetchEventSnapshot,
} from "./sync.js?v=20260714-tournament-session-1";
import { normalizeEventSnapshot } from "./events.js?v=20260712-badges-1";
import { eventStore, resetEventStore } from "./event-store.js?v=20260712-1";
import { createComboFeedback } from "./combo-feedback.js?v=20260719-final-score-1";
import { escapeHtml, safeImgSrc, safeCssUrl } from "./ui/dom-safety.js?v=20260629-1";
import { renderShareCard, downloadBlob, copyShareText } from "./ui/share-card.js?v=20260706-card-1";
import { cellKey, sameTile } from "./util/tiles.js?v=20260629-1";
import { isTournamentEnded } from "./util/tournament-deadline.js?v=20260710-1";
import { tournamentUrlForScreen } from "./util/tournament-route.js?v=20260714-lobby-route-1";
import {
  TOURNAMENT_FINAL_REFRESH_GRACE_MS,
  TOURNAMENT_FINAL_REFRESH_MAX_RETRIES,
  TOURNAMENT_POLL_TICK_MS,
  TOURNAMENT_SESSION_HEARTBEAT_MS,
  isTournamentSessionConflictError,
  isTournamentTerminalDraftError,
  isTournamentTerminalRoomError,
  isTournamentTerminalSubmissionError,
  tournamentDraftSyncDelayMs,
  tournamentFinalRefreshRetryDelayMs,
  tournamentPollIntervalMs,
  tournamentSyncErrorCode,
} from "./util/tournament-sync-policy.js?v=20260714-session-hardening-1";
import {
  getTournamentRecovery,
  putTournamentRecovery,
  removeTournamentRecovery,
} from "./util/tournament-recovery.js?v=20260711-1";
import { replayRun } from "./run-replay-browser.js?v=20260717-replay-split-1";
import { elements } from "./ui/dom.js?v=20260712-event-popup-1";
import { app } from "./ui/store.js?v=20260629-5";
import { renderMetaNav, renderGlobalNav, metaTitle, metaStatus } from "./ui/render-meta.js?v=20260719-blupets-unify-1";
import { renderLeaderboard, renderLeaderboardContent } from "./ui/render-leaderboard.js?v=20260719-blupets-unify-1";
import { renderCollectionProgress, leaderboardRanksForUser, renderProfileStatsPanel } from "./ui/render-profile-stats.js?v=20260629-2";
import { renderOwnBlupetsCollection, renderPublicBlupetsCollection, renderCollectionGrid } from "./ui/render-collection.js?v=20260719-blupets-unify-1";
import { renderPublicProfile, renderPublicProfileHtml, renderMetaPublicProfileContent } from "./ui/render-public-profile.js?v=20260719-blupets-unify-1";
import { renderGuideSection } from "./ui/render-guide.js?v=20260719-blupets-unify-1";
import { renderCapsulesSection } from "./ui/render-capsules.js?v=20260719-blupets-unify-1";
import { renderCapsuleRevealOutput } from "./ui/render-capsule-reveal.js?v=20260706-nopedestal-1";
import { renderAccountSection } from "./ui/render-account.js?v=20260719-blupets-unify-1";
import { shortAuthLabel } from "./util/auth-label.js?v=20260629-1";
import { getBaseBlockAsset, getBlockAsset } from "./ui/block-assets.js?v=20260717-special-spawn-1";
import { buildEvoTree } from "./ui/render-evo-tree.js?v=20260717-special-spawn-1";
import { formatEventCountdown, renderEarnedEventBadge, renderEventBanner, renderEventPopup } from "./ui/render-event.js?v=20260713-layout-2";
import { getSupabaseConfig } from "./supabase-client.js?v=20260629-client-singleton-1";

const SPECIAL_TILE_ASSETS = Object.freeze({
  cross: "./assets/special-tiles/cross-symbol.png",
  bomb: "./assets/special-tiles/bomb-symbol.png",
});

import {
  getLeaderColorId,
  renderTopBar,
  renderColorRoster,
  renderVibeStrip,
  renderStatus,
  resetScoreBaseline,
} from "./ui/render-game.js?v=20260717-special-spawn-1";
import {
  renderQuestsSection,
  renderQuestStatsHeader,
  questCompletionSummary,
  normalizeQuestTab,
} from "./ui/render-quests.js?v=20260719-blupets-unify-1";

// Global pacing multiplier for the board-resolution
// animations (swap / clear / drop / cascade pause / reshuffle). Scales BOTH the
// JS pacing below AND the CSS animation durations (via the --anim-scale custom
// property, set at startup) so they stay in sync.
const ANIM_SCALE = 0.72;
// Dedicated, stronger multiplier for JUST the tile disappearance animation. It
// is intentionally faster than the board motion so combo praise carries the
// moment instead of the player watching every tile dissolve.
const CLEAR_SCALE = 0.55;
const SWAP_ANIMATION_MS = 210 * ANIM_SCALE;
// Quick reject shake when a swap makes no match, so an illegal move reads as
// "tried, bounced back" instead of silently doing nothing.
const REJECT_ANIMATION_MS = 300 * ANIM_SCALE;
const CLEAR_ANIMATION_MS = 280 * CLEAR_SCALE;
const DROP_ANIMATION_MS = 360 * ANIM_SCALE;
const BOMB_RIPPLE_MS = 720 * ANIM_SCALE;
// Falling tiles are lightly staggered by --tile-delay (up to ~80ms for the
// bottom-right cell). Hold the drop phase long enough that the last-staggered
// tile's animation finishes without making cascades feel slow.
const DROP_STAGGER_MS = 90 * ANIM_SCALE;
const CASCADE_SETTLE_MS = 80 * ANIM_SCALE;
const RESHUFFLE_ANIMATION_MS = 320 * ANIM_SCALE;
// Let the player read the final score gain before Game Over replaces the board.
const FINAL_SCORE_HOLD_MS = 850;
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
const IDLE_MICRO_MS = 900;
const IDLE_MIN_GAP_MS = 4200;
const IDLE_JITTER_MS = 2600;
const SARAI_HEART_ASSET = "./assets/evolution/crimson/t2/04-heart.svg";


// ── Combo feedback system — on-board praise (replaces static COMBO pill) ────
const feedback = createComboFeedback(
  elements.fxLayer,
  elements.board,
  elements.boardShell,
  { playSfx: sfx },
);
// ─────────────────────────────────────────────────────────────────────────────

app.state = null;
let lastScreenBeforeLeaderboard = "start";
let lastScreenBeforeProfile = "start";
let _inPopstate = false;
let _historyDepth = 0;
let boardAnimation = {
  board: null,
  clearingGhosts: [],
  activeCells: new Set(),
  settlingCells: new Set(),
  swapVectors: null,
  phase: "",
};
let dragState = null;
// Persistent DOM element caches for patchBoard — avoids innerHTML thrash every frame.
const _boardTileEls = new Map(); // "r:c" -> button|span element
const _boardGhostMap = new Map(); // "r:c" -> ghost span element
// remoteLeaderboard / leaderboardStatus / leaderboardTab now live in ui/store.js
// (app.*); their initial values are set there.
// Authoritative discovered-forms count from Supabase (`user_progress.forms`),
// captured every time remote progress arrives. Drives the victory card / share
// card so the "N/36" reflects the cloud, not a local union that guest play could
// inflate. Stays null until the first remote fetch (guests fall back to local).
let cloudFormsCount = null;
let profileTab = "collection";
let activeMetaOverlay = null;
app.progress = loadProgress();
app.authState = {
  configured: false,
  loading: true,
  user: null,
  label: "",
  avatarUrl: "",
  error: "",
};
let authModalDismissed = false;
let authModalForced = false;
let _authTab = "signin";
let boardSizeFrame = null;
let _lastRenderedScreen = null;
let _cachedBoardRect = null;
let _cachedShellRect = null;
let hintMoves = [];
let hintCursor = 0;
let hintTimer = null;
let idleTimer = null;
let vibeIntroOpen = false;
let runRng = Math.random;
let runProof = null;
let recentCapsuleResults = [];
let tournamentDraftSyncTimer = null;
let tournamentLeaseHeartbeatTimer = null;
let tournamentDraftSyncInFlight = false;
let tournamentDraftSyncDirty = false;
let tournamentDraftLastAttemptAt = 0;
let tournamentDraftSyncGeneration = 0;
let tournamentEmergencyDraftActionCount = -1;
let tournamentEmergencyDraftSentAt = 0;

function createTournamentClientSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const TOURNAMENT_CLIENT_SESSION_KEY = "blupets_tournament_client_session_v1";
const isTournamentSessionId = (value) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

let tournamentClientSessionId = (() => {
  try {
    const saved = sessionStorage.getItem(TOURNAMENT_CLIENT_SESSION_KEY);
    if (isTournamentSessionId(saved)) return saved;
    const created = createTournamentClientSessionId();
    sessionStorage.setItem(TOURNAMENT_CLIENT_SESSION_KEY, created);
    return created;
  } catch {
    return createTournamentClientSessionId();
  }
})();

// Duplicating a browser tab can clone sessionStorage. A tiny BroadcastChannel
// handshake makes the newcomer rotate its id while a normal refresh (where the
// old document is gone) keeps the same lease and resumes immediately.
if (typeof BroadcastChannel === "function") {
  const instanceId = createTournamentClientSessionId();
  const sessionChannel = new BroadcastChannel("blupets-tournament-session-v1");
  sessionChannel.addEventListener("message", ({ data }) => {
    if (!data || data.instanceId === instanceId) return;
    if (data.type === "probe" && data.sessionId === tournamentClientSessionId) {
      sessionChannel.postMessage({
        type: "present",
        targetInstanceId: data.instanceId,
        instanceId,
        sessionId: tournamentClientSessionId,
      });
      return;
    }
    if (data.type === "present" && data.targetInstanceId === instanceId && data.sessionId === tournamentClientSessionId) {
      tournamentClientSessionId = createTournamentClientSessionId();
      try { sessionStorage.setItem(TOURNAMENT_CLIENT_SESSION_KEY, tournamentClientSessionId); } catch {}
    }
  });
  sessionChannel.postMessage({ type: "probe", instanceId, sessionId: tournamentClientSessionId });
}

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
  persistTournamentRecovery();
}

function readTournamentRecovery({ userId, code, runId } = {}) {
  try {
    return getTournamentRecovery(localStorage, { userId, code, runId });
  } catch {
    return null;
  }
}

function clearTournamentRecovery(proof = runProof) {
  try {
    if (proof?.runId) removeTournamentRecovery(localStorage, { runId: proof.runId });
  } catch { /* Storage can be disabled in private browsing. */ }
}

// The action log is saved after every player decision. It lets a tab reload
// replay the exact seeded state, and it keeps a finished result queued until
// the server confirms it received the score.
function persistTournamentRecovery({ pendingResult = null, abandoned = false } = {}) {
  if (!runProof?.tournament || !app.authState.user?.id) return;
  try {
    const previous = readTournamentRecovery({ runId: runProof.runId });
    const result = pendingResult ?? previous?.pendingResult ?? null;
    const payload = {
      version: 1,
      userId: app.authState.user.id,
      code: runProof.code ?? app.tournamentRoom?.code ?? "",
      runId: runProof.runId,
      seed: Number(runProof.seed) >>> 0,
      vibeId: runProof.vibeId ?? null,
      rules: runProof.rules ?? app.tournamentRoom?.rules ?? {},
      startedAt: runProof.startedAt ?? runProof.started_at ?? app.tournamentRoom?.playerState?.startedAt ?? null,
      expiresAt: runProof.expiresAt ?? runProof.expires_at ?? app.tournamentRoom?.playerState?.expiresAt ?? null,
      actions: Array.isArray(runProof.actions) ? runProof.actions : [],
      pendingResult: result,
      abandoned: Boolean(abandoned || previous?.abandoned),
      clientSessionId: tournamentClientSessionId,
      savedAt: Date.now(),
    };
    putTournamentRecovery(localStorage, payload);
  } catch { /* A run still works when browser storage is unavailable. */ }
}

function scheduleTournamentLeaseHeartbeat() {
  if (tournamentLeaseHeartbeatTimer) clearTimeout(tournamentLeaseHeartbeatTimer);
  if (!runProof?.tournament || !app.state || app.state.gameOver || app.state.victory) return;
  tournamentLeaseHeartbeatTimer = window.setTimeout(() => {
    tournamentLeaseHeartbeatTimer = null;
    scheduleTournamentDraftSync({ immediate: true });
  }, TOURNAMENT_SESSION_HEARTBEAT_MS);
}

function scheduleTournamentDraftSync({ immediate = false } = {}) {
  if (!runProof?.tournament || !app.state || app.state.gameOver || app.state.victory) return;
  tournamentDraftSyncDirty = true;
  if (tournamentDraftSyncInFlight || tournamentDraftSyncTimer) return;
  const delayMs = tournamentDraftSyncDelayMs({
    immediate,
    lastAttemptAt: tournamentDraftLastAttemptAt,
  });
  tournamentDraftSyncTimer = window.setTimeout(() => {
    tournamentDraftSyncTimer = null;
    syncTournamentDraft();
  }, delayMs);
}

async function syncTournamentDraft() {
  if (tournamentDraftSyncInFlight || !tournamentDraftSyncDirty) return;
  if (!runProof?.tournament || !app.state || app.state.gameOver || app.state.victory) return;
  const proof = runProof;
  const generation = tournamentDraftSyncGeneration;
  const result = buildTournamentResultFromState(app.state);
  if (!result) return;
  const actionCount = proof.actions.length;
  tournamentDraftSyncDirty = false;
  tournamentDraftSyncInFlight = true;
  tournamentDraftLastAttemptAt = Date.now();
  try {
    await saveTournamentDraft(proof.runId, result, proof.actions, {
      clientSessionId: tournamentClientSessionId,
    });
    scheduleTournamentLeaseHeartbeat();
  } catch (error) {
    if (isTournamentSessionConflictError(error)) {
      console.info("[tournament] draft lease moved to another tab");
      showToast("This tournament attempt continued in another tab.");
    } else if (isTournamentTerminalDraftError(error)) {
      // A closed/missing attempt cannot accept another checkpoint. Cron keeps
      // the latest verified draft, so retrying the same request only creates a
      // stream of expected 4xx responses after the deadline.
      console.info("[tournament] draft checkpoint closed:", tournamentSyncErrorCode(error));
    } else {
      // Local recovery still has every action. Keep the draft dirty so the
      // batched retry runs later; pagehide also sends the full current log.
      if (generation === tournamentDraftSyncGeneration) tournamentDraftSyncDirty = true;
      console.warn("[tournament] draft checkpoint deferred:", error);
    }
  } finally {
    if (generation !== tournamentDraftSyncGeneration) return;
    tournamentDraftSyncInFlight = false;
    if (runProof === proof && proof.actions.length > actionCount) {
      tournamentDraftSyncDirty = true;
    }
    if (tournamentDraftSyncDirty) scheduleTournamentDraftSync();
  }
}

function resetTournamentDraftSyncState() {
  tournamentDraftSyncGeneration += 1;
  if (tournamentDraftSyncTimer) clearTimeout(tournamentDraftSyncTimer);
  if (tournamentLeaseHeartbeatTimer) clearTimeout(tournamentLeaseHeartbeatTimer);
  tournamentDraftSyncTimer = null;
  tournamentLeaseHeartbeatTimer = null;
  tournamentDraftSyncInFlight = false;
  tournamentDraftSyncDirty = false;
  tournamentDraftLastAttemptAt = 0;
  tournamentEmergencyDraftActionCount = -1;
  tournamentEmergencyDraftSentAt = 0;
}

function sendTournamentDraftOnPagehide() {
  if (!isTournamentRunInProgress()) return;
  persistTournamentRecovery();
  const proof = runProof;
  const result = buildTournamentResultFromState(app.state);
  if (!proof || !result) return;
  const now = Date.now();
  if (
    proof.actions.length === tournamentEmergencyDraftActionCount &&
    now - tournamentEmergencyDraftSentAt < 5_000
  ) return;
  tournamentEmergencyDraftActionCount = proof.actions.length;
  tournamentEmergencyDraftSentAt = now;
  const cfg = getSupabaseConfig();
  if (!cfg.configured) return;
  let token = app.authState?.session?.access_token;
  if (!token) {
    try {
      const raw = localStorage.getItem("sb-yccfnorilbisrxbwtlwv-auth-token");
      if (raw) token = JSON.parse(raw)?.access_token;
    } catch { /* Best effort only. */ }
  }
  if (!token) return;
  try {
    fetch(`${cfg.supabaseUrl}/functions/v1/save-tournament-draft`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: cfg.supabaseAnonKey,
      },
      body: JSON.stringify({
        runId: proof.runId,
        result,
        actions: proof.actions,
        clientSessionId: tournamentClientSessionId,
      }),
    }).catch(() => {});
  } catch { /* local recovery remains available */ }
}

function recoveryOptions(recovery, room) {
  const rules = recovery?.rules && typeof recovery.rules === "object"
    ? recovery.rules
    : room?.rules && typeof room.rules === "object" ? room.rules : {};
  return {
    diagonalAssist: Boolean(rules.diagonalAssist),
    diagonalSwaps: Boolean(rules.diagonalSwaps),
    specialTiles: rules.specialTiles !== false,
    endlessRun: rules.endlessRun !== false,
    vibe: getVibeById(recovery?.vibeId ?? room?.vibe_id),
  };
}

function restoreTournamentRecovery(room) {
  const userId = app.authState.user?.id ?? "";
  const saved = readTournamentRecovery({ userId, code: room?.code ?? "" });
  if (!saved || saved.pendingResult) {
    return false;
  }
  // A recovery created by another tab/device must first claim the server lease
  // through start-tournament-run. Never let two boards advance independently.
  if (saved.clientSessionId && saved.clientSessionId !== tournamentClientSessionId) return false;
  if (room?.playerState?.hasSubmitted) {
    clearTournamentRecovery({ runId: saved.runId });
    return false;
  }
  const serverRunId = room?.playerState?.resume?.runId;
  if (serverRunId && saved.runId !== serverRunId) return false;
  const expiresAt = new Date(saved.expiresAt ?? "").getTime();
  const replay = replayRun(saved.seed, saved.actions, recoveryOptions(saved, room));
  if (!Number.isFinite(expiresAt) || tournamentNow() >= expiresAt) {
    // A reload after the cutoff cannot reopen the board, but its persisted
    // actions are still an honest partial run. Queue that score for the same
    // idempotent retry path instead of silently losing it.
    const result = buildTournamentResultFromState(replay.state);
    if (result && Number(result.score) >= 0) {
      try {
        putTournamentRecovery(localStorage, {
          ...saved,
          actions: replay.actions,
          pendingResult: result,
          abandoned: true,
          savedAt: Date.now(),
        });
      } catch { /* Storage fallback is intentionally best-effort. */ }
    }
    return false;
  }

  runProof = {
    runId: saved.runId,
    code: saved.code,
    seed: saved.seed,
    vibeId: saved.vibeId,
    rules: saved.rules,
    startedAt: saved.startedAt,
    expiresAt: saved.expiresAt,
    actions: replay.actions,
    tournament: true,
  };
  runRng = replay.rng;
  app.tournamentRunProof = runProof;
  app.state = replay.state;
  app.tournamentRoom = {
    ...room,
    playerState: {
      ...(room.playerState ?? {}),
      hasStarted: true,
      startedAt: saved.startedAt,
      expiresAt: saved.expiresAt,
    },
  };
  resetTournamentDraftSyncState();
  scheduleTournamentDraftSync({ immediate: true });
  resetInteractionState();
  setScreen("game");
  render();
  showToast("Tournament run restored.");
  return true;
}

async function retryPendingTournamentSubmission(room = app.tournamentRoom) {
  const saved = readTournamentRecovery({
    userId: app.authState.user?.id ?? "",
    code: room?.code ?? "",
  });
  if (!saved?.pendingResult) {
    return false;
  }
  if (saved.clientSessionId && saved.clientSessionId !== tournamentClientSessionId) return false;
  try {
    const data = await submitTournamentRun(saved.runId, saved.pendingResult, saved.actions, {
      abandoned: saved.abandoned,
      clientSessionId: tournamentClientSessionId,
    });
    clearTournamentRecovery({ runId: saved.runId });
    markTournamentSubmissionAccepted(data?.entry, saved.pendingResult);
    showToast("Tournament score saved.");
    return true;
  } catch (error) {
    if (isTournamentSessionConflictError(error)) {
      console.info("[tournament] queued submit belongs to another active tab");
      return false;
    }
    if (isTournamentTerminalSubmissionError(error)) {
      clearTournamentRecovery({ runId: saved.runId });
      console.info("[tournament] queued submit closed:", tournamentSyncErrorCode(error));
      return false;
    }
    console.error("[tournament] queued submit failed:", error);
    return false;
  }
}

function applyRemoteProgress(remote) {
  if (!remote) return;
  cloudFormsCount = Object.keys(remote.forms ?? {}).length;
  const local = loadProgress();
  const merged = {
    ...local,
    ...remote,
    // Collection ownership is monotonic. Preserve a just-opened local tile
    // until the canonical server union echoes it back; stale devices cannot
    // remove keys already known on either side.
    collectionTiles: {
      ...(local.collectionTiles ?? {}),
      ...(remote.collectionTiles ?? {}),
      ...(remote.publicCollectionTiles ?? {}),
    },
  };
  // Quest progress can only go forward: keep whichever side is further ahead
  // so a stale server snapshot never resets a locally-completed quest.
  const lq = getSaraiHeartQuest(local);
  const rq = getSaraiHeartQuest(remote);
  if (lq.matches > rq.matches || (lq.completed && !rq.completed)) {
    merged.saraiHeartQuest = local.saraiHeartQuest;
  }
  app.progress = merged;
}

let _eventCountdownTimer = null;
let _eventReturnFocus = null;
let _eventKeyHandler = null;
let _eventExpiryRefreshPending = false;

function eventNow() {
  return Date.now() + (Number(eventStore.serverOffsetMs) || 0);
}

function updateEventCountdowns() {
  const nodes = [elements.eventBannerHost, elements.eventPopupContent].filter(Boolean);
  let expired = false;
  for (const root of nodes) {
    root.querySelectorAll?.("[data-event-countdown]").forEach((node) => {
      node.textContent = formatEventCountdown(node.dataset.target, eventNow());
      const target = Date.parse(node.dataset.target ?? "");
      if (Number.isFinite(target) && target <= eventNow()) expired = true;
    });
  }
  if (expired && !_eventExpiryRefreshPending && app.authState.user) {
    _eventExpiryRefreshPending = true;
    refreshEventState().finally(() => { _eventExpiryRefreshPending = false; });
  }
}

function syncEventCountdownTimer() {
  const visible = Boolean(
    (!elements.eventBannerHost?.hidden && eventStore.snapshot) ||
    (!elements.eventPopup?.hidden && eventStore.open)
  );
  if (visible && _eventCountdownTimer === null) {
    _eventCountdownTimer = window.setInterval(updateEventCountdowns, 1000);
  } else if (!visible && _eventCountdownTimer !== null) {
    window.clearInterval(_eventCountdownTimer);
    _eventCountdownTimer = null;
  }
  if (visible) updateEventCountdowns();
}

function setEventPopupVisible(open) {
  if (!elements.eventPopup) return;
  eventStore.open = Boolean(open && eventStore.snapshot && app.authState.user);
  elements.eventPopup.hidden = !eventStore.open;
  elements.eventPopup.setAttribute("aria-hidden", eventStore.open ? "false" : "true");
  document.body.classList.toggle("modal-open", eventStore.open);
  if (!eventStore.open) {
    if (_eventKeyHandler) document.removeEventListener("keydown", _eventKeyHandler, true);
    _eventKeyHandler = null;
    const focusTarget = _eventReturnFocus;
    _eventReturnFocus = null;
    focusTarget?.focus?.();
  }
  syncEventCountdownTimer();
}

function renderEventUi() {
  const snapshot = app.authState.user ? eventStore.snapshot : null;
  if (elements.eventBannerHost) {
    const showBanner = Boolean(snapshot?.event?.id);
    elements.eventBannerHost.hidden = !showBanner;
    elements.eventBannerHost.innerHTML = showBanner ? renderEventBanner(snapshot, eventNow()) : "";
  }
  if (elements.eventPopupContent) {
    elements.eventPopupContent.innerHTML = eventStore.open && snapshot
      ? renderEventPopup(snapshot, { userId: app.authState.user?.id ?? "", now: eventNow() })
      : "";
  }
  if (!snapshot && eventStore.open) setEventPopupVisible(false);
  syncEventCountdownTimer();
}

async function refreshEventState() {
  if (!app.authState.user) {
    resetEventStore();
    renderEventUi();
    return null;
  }
  eventStore.status = "loading";
  try {
    const response = await fetchEventSnapshot(100);
    eventStore.snapshot = normalizeEventSnapshot(response?.snapshot);
    eventStore.serverTime = response?.serverTime ?? null;
    const serverTime = Date.parse(eventStore.serverTime ?? "");
    eventStore.serverOffsetMs = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
    eventStore.status = "ready";
    eventStore.error = "";
    if (!eventStore.snapshot) setEventPopupVisible(false);
    renderEventUi();
    return eventStore.snapshot;
  } catch (error) {
    eventStore.status = "error";
    eventStore.error = error?.message || "event_unavailable";
    eventStore.snapshot = null;
    setEventPopupVisible(false);
    renderEventUi();
    return null;
  }
}

function openEventPopup({ pushHistory = true } = {}) {
  if (!app.authState.user || !eventStore.snapshot || !elements.eventPopup) return;
  _eventReturnFocus = document.activeElement;
  eventStore.open = true;
  renderEventUi();
  setEventPopupVisible(true);
  elements.eventPopupClose?.focus();
  _eventKeyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEventPopup();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...elements.eventPopup.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", _eventKeyHandler, true);
  if (pushHistory && !_inPopstate && !history.state?.event) {
    _historyDepth++;
    history.pushState(
      { ...(history.state ?? {}), screen: app.currentScreen, event: true, idx: _historyDepth },
      "",
      location.pathname + "#event",
    );
  }
  refreshEventState();
}

function closeEventPopup({ fromHistory = false } = {}) {
  if (!eventStore.open) return;
  if (!fromHistory && !_inPopstate && history.state?.event && _historyDepth > 0) {
    history.back();
    return;
  }
  setEventPopupVisible(false);
  renderEventUi();
}

// Called after sign-in when a guest completed a run just before logging in.
// Applies the stashed run (badges, capsules, quest) to the now-authenticated progress.
function applyPendingGuestRun() {
  // OAuth reloads the page, losing in-memory state — restore from localStorage.
  if (!pendingGuestRun) {
    try {
      const raw = localStorage.getItem("blupets_pending_run");
      if (raw) {
        const item = JSON.parse(raw);
        if (item.exp && Date.now() < item.exp) {
          pendingGuestRun = item.v.run;
          pendingGuestQuestMatches = item.v.questMatches ?? 0;
        }
        localStorage.removeItem("blupets_pending_run");
      }
    } catch {}
  }
  if (!pendingGuestRun || !app.authState.user) return;
  const run = pendingGuestRun;
  pendingGuestRun = null;
  const guestQuestMatches = pendingGuestQuestMatches;
  pendingGuestQuestMatches = 0;
  if (guestQuestMatches > 0) {
    recordSaraiHeartMatches(app.progress, guestQuestMatches);
  }
  const fold = foldRun(app.progress, run.foldArgs);
  lastRunSummary = {
    score: run.score,
    movesUsed: run.movesUsed,
    maxCombo: run.maxCombo,
    specials: run.specials,
    newBadges: fold.newBadges,
    capsulesEarned: fold.capsulesEarned ?? 0,
    bonusCapsules: fold.newBadges.reduce((sum, badge) => sum + (Number(badge.capsules) || 0), 0),
    ascendedCount: ascendedLineageCount(app.progress),
    blupetsCount: collectionTileCount(app.progress),
  };
  persistProgress();
  if (run.leaderResult && Number(run.leaderResult.score) > 0) {
    submitGuestRun(run.leaderResult, {
      guestRunId: run.runProof?.runId ?? null,
      actions: run.runProof?.actions ?? [],
      familyBadges: run.familyBadges ?? {},
      blupetsCount: run.blupetsCount ?? 0,
      progress: app.progress,
    })
      .then((data) => {
        console.info("[sync] guest run submitted:", data);
        if (data?.progress) { applyRemoteProgress(data.progress); render(); }
        return fetchGlobalLeaderboard();
      })
      .then((entries) => { app.remoteLeaderboard = entries; render(); })
      .catch((err) => console.error("[sync] guest run submit failed:", err));
  }
  updateProfileChip();
  if (app.currentScreen === "gameover") renderGameoverScreen(app.state);
}

function persistProgress() {
  if (!app.authState.user) return;
  syncProgressSnapshot(app.progress).catch((error) => {
    console.error("[sync] progress snapshot failed:", error);
  });
}

function clearRunProof() {
  resetTournamentDraftSyncState();
  runProof = null;
  runRng = Math.random;
}

function countSaraiHeartMatchGroups(stateBefore, resolution) {
  if (getSaraiHeartQuest(app.progress).completed) {
    return 0;
  }
  let matches = 0;
  for (const step of resolution?.cascadeSteps ?? []) {
    for (const group of step.groups ?? []) {
      const first = group[0];
      const tile = first ? step.boardBeforeClear?.[first.row]?.[first.col] : null;
      if (!tile) continue;
      const form = getChosenEvolutionForm(stateBefore, tile.color);
      if (form?.key === "T2_CRIMSON_HEART") {
        matches += 1;
      }
    }
  }
  return matches;
}

function collectSaraiHeartQuestProgress(stateBefore, resolution) {
  if (runProof?.tournament || app.tournamentRunProof) {
    return;
  }
  const matches = countSaraiHeartMatchGroups(stateBefore, resolution);
  if (!app.authState.user) {
    // Accumulate for later application if the guest signs in after the run.
    if (matches > 0) pendingGuestQuestMatches += matches;
    return;
  }
  if (matches <= 0) {
    return;
  }
  const result = recordSaraiHeartMatches(app.progress, matches);
  if (result.reward > 0) {
    spawnSaraiHeartPopup(`Sarai Heart Complete! +${result.reward} Blupets`, true);
    updateProfileChip();
    persistProgress();
    return;
  }
  if (result.matched > 0) {
    spawnSaraiHeartPopup("Collected Heart for Sarai");
  }
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
  app.selectedTile = null;
  resetBoardAnimation();
  dragState = null;
  app.isAnimating = false;
  hideVibeIntro();
  clearTimeout(hintTimer);
  hintTimer = null;
  clearTimeout(idleTimer);
  idleTimer = null;
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
  const changed = screen !== app.currentScreen;
  app.currentScreen = screen;
  if (changed && !_inPopstate) {
    const url = tournamentUrlForScreen({
      screen,
      pathname: location.pathname,
      tournamentCode: app.tournamentRoom?.code || app.tournamentCodeInput,
    });
    // Record this entry's depth as `idx` so popstate can recover the true
    // depth on BOTH back and forward navigation (a blind decrement would
    // desync on forward — see popstate handler).
    _historyDepth++;
    history.pushState({ screen, idx: _historyDepth }, "", url);
  }
  // Keep the Blupix ambience through the menu, active run, and result screens. Only poke the
  // audio layer on a real screen change — render() calls setScreen() every
  // frame, and the first-gesture pointerdown handler already kicks off ambience.
  if (changed) {
    if (screen === "start" || screen === "game" || screen === "victory" || screen === "gameover" || screen === "leaderboard" || screen === "profile" || screen === "public-profile" || screen === "collection" || screen === "quests" || screen === "guide" || screen === "tournament") {
      startMusic();
    } else {
      stopMusic();
    }
  }
  // Keep the start screen only for actual menu/result backdrops. Lobby is its
  // own page on both desktop and mobile, so the start art must not stay mounted
  // behind it like a popup backdrop.
  const keepStartBehind =
    screen === "start" ||
    screen === "gameover";
  elements.startScreen.hidden = !keepStartBehind;
  elements.startScreen.classList.toggle("is-end-backdrop", screen === "gameover");
  document.body.classList.toggle("is-game-screen", screen === "game");
  document.body.classList.toggle("is-gameover-backdrop", screen === "gameover");
  elements.gameScreen.hidden = screen !== "game";
  elements.victoryScreen.hidden = screen !== "victory";
  elements.gameoverScreen.hidden = screen !== "gameover";
  elements.leaderboardScreen.hidden = screen !== "leaderboard";
  if (elements.tournamentScreen) {
    elements.tournamentScreen.hidden = screen !== "tournament";
  }
  if (elements.profileScreen) {
    elements.profileScreen.hidden = screen !== "profile";
  }
  if (elements.publicProfileScreen) {
    elements.publicProfileScreen.hidden = screen !== "public-profile";
  }
  if (elements.collectionScreen) {
    elements.collectionScreen.hidden = screen !== "collection";
  }
  if (elements.questsScreen) {
    elements.questsScreen.hidden = screen !== "quests";
  }
  if (elements.guideScreen) {
    elements.guideScreen.hidden = screen !== "guide";
  }
  // Mobile nav: show on non-gameplay screens, highlight active item
  const _mobileNavScreens = new Set(["start", "collection", "quests", "leaderboard", "profile", "guide", "public-profile", "tournament"]);
  if (elements.mobileNav) {
    elements.mobileNav.hidden = !_mobileNavScreens.has(screen);
    const _navActive = screen === "public-profile" ? "leaderboard" : screen;
    elements.mobileNav.querySelectorAll("[data-mobile-nav]").forEach((btn) => {
      const active = btn.dataset.mobileNav === _navActive;
      const section = btn.dataset.mobileNav === "leaderboard" ? "rank" : btn.dataset.mobileNav;
      const locked = AUTH_REQUIRED_META_SECTIONS.has(section) && !app.authState.user;
      btn.classList.toggle("is-active", active);
      btn.classList.toggle("is-locked", locked);
      btn.disabled = locked;
      btn.setAttribute("aria-current", active ? "page" : "false");
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
    });
  }
  // Desktop sweeping top navbar: shown on the non-gameplay screens AND on the
  // Lobby room, so the room wears the same top nav as the section popups (you
  // tab in/out of it through the same navigation). Mobile keeps it display:none
  // via CSS regardless. On the room, "Lobby" is the active tab; elsewhere the
  // active section is tracked by activeMetaOverlay (renderStartMetaTabs keeps it
  // in sync when overlays open/close).
  if (elements.globalMetaNav) {
    const showGlobalNav = _mobileNavScreens.has(screen) || screen === "tournament";
    elements.globalMetaNav.hidden = !showGlobalNav;
    const showGlobalActions = showGlobalNav && (!isMobileViewport() || screen === "start");
    if (elements.globalNavActions) elements.globalNavActions.hidden = !showGlobalActions;
    renderGlobalNav(elements.globalMetaNav, screen === "tournament" ? "tournament" : (activeMetaOverlay || "home"));
  }
}

// True while a Start tap is awaiting the start-run / start-guest-run handshake.
// The handshake is a network round-trip awaited before the game screen appears,
// so without feedback the start screen reads as frozen. This drives a loading
// state on the button and blocks re-taps until the run actually begins.
let _runStarting = false;

function setStartRunLoading(loading) {
  _runStarting = loading;
  const btn = elements.startRun;
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
  btn.setAttribute("aria-busy", loading ? "true" : "false");
}

async function startRun({ guided = false } = {}) {
  if (activeMetaOverlay && app.currentScreen === "start") {
    return;
  }
  // A start is already mid-handshake — ignore the extra tap rather than kicking
  // off a second run (which would consume another server seed).
  if (_runStarting) {
    return;
  }
  unlockAudio();
  sfx("ui");
  closeMetaOverlay();
  app.tournamentRunProof = null;
  // Set the loading state AFTER closeMetaOverlay — it calls renderStartMetaTabs,
  // which would otherwise re-enable the button. The synchronous prelude above
  // can't re-enter (no awaits yet), so guarding here is sufficient.
  setStartRunLoading(true);
  const autoGuide = !guided && !app.progress.tutorialSeen;
  resetScoreBaseline(); // reset score-pop baseline for the new run
  lastRunSummary = null;
  pendingGuestRun = null;
  pendingGuestQuestMatches = 0;
  clearBoardDom();
  runProof = null;
  gameoverRevealResult = null;
  gameoverRevealBatch = [];
  let seed;
  if (app.authState.user) {
    try {
      // A trusted seed is mandatory: starting locally after a handshake error
      // would let the player finish a run that can never reach the leaderboard.
      runProof = await Promise.race([
        startTrustedRun(),
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error("start-run timed out")), 8000),
        ),
      ]);
      seed = runProof.seed;
    } catch (err) {
      console.error("[sync] startTrustedRun failed:", err);
      setStartRunLoading(false);
      showToast("Couldn’t start a saveable run. Check your connection and try again.");
      return;
    }
  } else {
    try {
      runProof = await Promise.race([
        startGuestRun(),
        new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error("start-guest-run timed out")), 8000),
        ),
      ]);
      seed = runProof.seed;
    } catch (err) {
      console.error("[sync] startGuestRun failed:", err);
      setStartRunLoading(false);
      showToast("Couldn’t start a saveable run. Check your connection and try again.");
      return;
    }
  }
  runRng = createSeededRng(seed);
  try {
    app.state = createInitialState({
      // Pure orthogonal match-3: diagonal matches AND diagonal swaps are both off.
      // Classic feel — lines only form horizontally/vertically. Difficulty is offset
      // by power-up tiles (cross from a match-4, bomb from a match-5 / L-T) that
      // help clear the board.
      diagonalAssist: false,
      diagonalSwaps: false,
      specialTiles: true,
      // Soft-endless: reaching T4 is a milestone, the run continues until moves run out.
      endlessRun: true,
      rng: runRng,
    });
  } catch (err) {
    // createBoard throws after exhausting its playable-board attempts. This is
    // extremely rare, but if it happens we must not leave the player staring at a
    // blank game screen (the throw would otherwise escape startRun as an unhandled
    // rejection). Stay on the start screen and let them tap Start Run again.
    console.error("[game] could not create a playable board:", err);
    setStartRunLoading(false);
    showToast("Couldn’t deal a board — tap Start Run to try again.");
    return;
  }
  if (guided || autoGuide) app.progress.tutorialSeen = true;
  recordRunStart(app.progress);
  persistProgress();
  // Handshake + board are ready; the game screen is about to take over. Clear the
  // loading state so a later return to the start screen finds the button live.
  setStartRunLoading(false);
  resetInteractionState();
  setScreen("game");
  render();
  if (guided || autoGuide) {
    startGuideTour();
  } else {
    showVibeIntro();
  }
}

async function startTournamentAttempt() {
  const room = app.tournamentRoom;
  if (!room?.code || _runStarting) return;
  const roomGeneration = tournamentRoomOpenGeneration;
  const allowLocalGuestTournament = room.local || isLocalDevHost() || !getSupabaseConfig().configured;
  if (!app.authState.user && !allowLocalGuestTournament) {
    openAuthModal({ force: true });
    return;
  }

  unlockAudio();
  sfx("ui");
  app.tournamentStatus = "starting";
  setStartRunLoading(true);
  renderTournamentRoom();
  clearBoardDom();
  resetScoreBaseline();
  lastRunSummary = null;
  pendingGuestRun = null;
  pendingGuestQuestMatches = 0;
  gameoverRevealResult = null;
  gameoverRevealBatch = [];
  runProof = null;
  _tournamentAbandonSent = false;
  tournamentTimeExpired = false;
  tournamentTimeExpiryQueued = false;
  resetTournamentDraftSyncState();
  app.tournamentRunProof = null;

  try {
    const proof = await Promise.race([
      startTournamentRun(room.code, tournamentClientSessionId),
      new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error("start-tournament-run timed out")), 8000),
      ),
    ]);
    if (roomGeneration !== tournamentRoomOpenGeneration || app.tournamentRoom?.code !== room.code) {
      setStartRunLoading(false);
      return;
    }
    runProof = proof;
    app.tournamentRunProof = proof;
    syncTournamentServerClock(proof.serverNow);
    const attemptStartedAt = proof.startedAt ?? proof.started_at ?? new Date().toISOString();
    const attemptDurationMs = Math.max(1, Number(room.duration_minutes || 30)) * 60_000;
    const attemptExpiresAt = proof.expiresAt ?? proof.expires_at ??
      new Date(new Date(attemptStartedAt).getTime() + attemptDurationMs).toISOString();
    app.tournamentRoom = {
      ...room,
      playerState: {
        ...(room.playerState ?? {}),
        hasStarted: true,
        startedAt: attemptStartedAt,
        expiresAt: attemptExpiresAt,
      },
    };
    trackTournamentPresence("playing");
    const rules = proof.rules && typeof proof.rules === "object" ? proof.rules : {};
    const options = {
      diagonalAssist: Boolean(rules.diagonalAssist),
      diagonalSwaps: Boolean(rules.diagonalSwaps),
      specialTiles: rules.specialTiles !== false,
      endlessRun: rules.endlessRun !== false,
      vibe: getVibeById(proof.vibeId),
    };
    if (proof.resumed) {
      const replay = replayRun(proof.seed, proof.actions, options);
      proof.actions = replay.actions;
      runRng = replay.rng;
      app.state = replay.state;
    } else {
      runRng = createSeededRng(proof.seed);
      app.state = createInitialState({ ...options, rng: runRng });
    }
    persistTournamentRecovery();
    scheduleTournamentDraftSync({ immediate: true });
    app.tournamentStatus = "ready";
    setStartRunLoading(false);
    resetInteractionState();
    setScreen("game");
    render();
    if (proof.resumed) showToast("Tournament run restored.");
    else showVibeIntro();
  } catch (error) {
    console.error("[tournament] start failed:", error);
    app.tournamentStatus = "ready";
    setStartRunLoading(false);
    showToast(
      error.message === "attempt_already_used" ? "Attempt already used." :
      error.message === "attempt_active_elsewhere" ? "This attempt is active in another tab or device." :
      error.message === "start_race_retry" ? "Another tab started this attempt. Try again to resume it." :
      error.message === "not_registered_for_room" ? "Tournament already started. Only lobby players can enter." :
      "Could not start tournament attempt.",
    );
    await openTournamentRoom(room.code);
  }
}

// First-run onboarding: show coachmarks only when the related mechanic actually
// appears during the match. This keeps the first run teachable without front-
// loading a long static tour.
let guideTour = null;
let tutorialRun = null;

function startGuideTour() {
  guideTour?.stop();
  tutorialRun = {
    active: true,
    seen: new Set(),
    queue: Promise.resolve(),
  };
  showTutorialCoachmark("swap", {
    target: () => elements.board,
    title: "Make matches",
    body: "Swap two touching blocks to line up 3 or more of the same color. Only real matches spend a move.",
    placement: "top",
  });
  showTutorialCoachmark("vibe", {
    target: () => elements.vibeStrip && !elements.vibeStrip.hidden ? elements.vibeStrip : document.querySelector(".game-frame"),
    title: "Run vibe",
    body: "Each run rolls a vibe bonus. It can change essence, moves, decay, or scoring behavior.",
  });
}

function stopTutorialRun() {
  if (tutorialRun) {
    tutorialRun.active = false;
  }
  guideTour?.stop();
  guideTour = null;
  tutorialRun = null;
}

function tutorialTileTarget(spawn) {
  return () =>
    document.querySelector(
      `.tile[data-row="${spawn.row}"][data-col="${spawn.col}"]`,
    ) ?? elements.board;
}

function showTutorialCoachmark(key, step) {
  if (!tutorialRun?.active || tutorialRun.seen.has(key)) {
    return Promise.resolve();
  }
  tutorialRun.seen.add(key);
  tutorialRun.queue = tutorialRun.queue.then(
    () =>
      new Promise((resolve) => {
        if (!tutorialRun?.active) {
          resolve();
          return;
        }
        guideTour?.stop();
        guideTour = runTour([step], {
          onDone: () => {
            guideTour = null;
            resolve();
          },
        });
      }),
  );
  return tutorialRun.queue;
}

async function showTutorialForResolutionStep(step, stepIndex) {
  if (!tutorialRun?.active) {
    return;
  }

  if (stepIndex >= 1) {
    await showTutorialCoachmark("combo", {
      target: () => document.querySelector(".stat-pill--combo") ?? elements.board,
      title: "Combo",
      body: "Cascades after your match raise the combo multiplier and add more score.",
    });
  }

  const cross = step.specialSpawns?.find((spawn) => spawn.special === "cross");
  if (cross) {
    await showTutorialCoachmark("cross", {
      target: tutorialTileTarget(cross),
      title: "Match 4: Cross",
      body: "A straight match of 4 creates a cross tile. Match it later to clear its row and column.",
    });
  }

  const bomb = step.specialSpawns?.find((spawn) => spawn.special === "bomb");
  if (bomb) {
    await showTutorialCoachmark("bomb", {
      target: tutorialTileTarget(bomb),
      title: "Match 5+: Bomb",
      body: "A match of 5, L shape, or T shape creates a bomb. Match it later to clear a 3 by 3 area.",
    });
  }
}

async function showTutorialForStateTransition(previousState, nextState) {
  if (!tutorialRun?.active || !nextState) {
    return;
  }

  if (nextState.gameOver) {
    await showTutorialCoachmark("rewards", {
      target: () => null,
      title: "Rewards",
      body: "After the run, score thresholds and quests can award Blupets. Reveal them to grow your collection; duplicates become shards.",
    });
    stopTutorialRun();
  }
}

// Reveal the rolled vibe as a one-time overlay at the top of each run, so the
// player knows which bonuses they're playing with before touching the board.
function showVibeIntro() {
  if (!app.state?.vibe || !elements.vibeIntro) {
    return;
  }

  elements.vibeIntroName.textContent = app.state.vibe.label;
  elements.vibeIntroBlurb.textContent = app.state.vibe.blurb || "A balanced run with no extra perks.";
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
  return Boolean(app.state && !app.state.victory && !app.state.gameOver);
}

let tournamentPollTimer = null;
let tournamentLastRefreshAt = 0;
let tournamentRefreshInFlight = null;
let tournamentRefreshInFlightCode = "";
let tournamentFinalRefreshTimer = null;
let tournamentFinalRefreshEndsAt = "";
let tournamentFinalRefreshRetryCount = 0;
let tournamentReadyUpdateInFlight = false;
let tournamentRoomOpenGeneration = 0;
let tournamentServerClockOffsetMs = 0;

function syncTournamentServerClock(serverNow) {
  const serverMs = new Date(serverNow ?? "").getTime();
  if (!Number.isFinite(serverMs)) return;
  const offset = serverMs - Date.now();
  if (Math.abs(offset) <= 24 * 60 * 60_000) tournamentServerClockOffsetMs = offset;
}

function tournamentNow() {
  return Date.now() + tournamentServerClockOffsetMs;
}

function normalizeTournamentCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function getVibeById(vibeId) {
  return VIBES.find((vibe) => vibe.id === vibeId) ?? NEUTRAL_VIBE;
}

function isLocalDevHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function formatTimeLeft(endValue) {
  const ms = new Date(endValue).getTime() - tournamentNow();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "ended";
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function stopTournamentPolling() {
  unsubscribeTournamentRoom().catch(() => {});
  app.tournamentChannel = null;
  stopTournamentCountdownTicker();
  if (tournamentPollTimer) {
    clearInterval(tournamentPollTimer);
    tournamentPollTimer = null;
  }
  if (tournamentFinalRefreshTimer) {
    clearTimeout(tournamentFinalRefreshTimer);
    tournamentFinalRefreshTimer = null;
  }
  tournamentFinalRefreshEndsAt = "";
  tournamentFinalRefreshRetryCount = 0;
  tournamentLastRefreshAt = 0;
}

function handleTournamentRefreshFailure(error) {
  if (!isTournamentTerminalRoomError(error)) return false;
  const code = tournamentSyncErrorCode(error);
  console.info("[tournament] room refresh stopped:", code);
  leaveTournament();
  showToast(
    code === "room_not_found"
      ? "Tournament room is no longer available."
      : code === "unauthorized"
        ? "Sign in again to rejoin the tournament."
        : "You are no longer registered in this tournament.",
  );
  return true;
}

function runTournamentFinalRefresh() {
  tournamentFinalRefreshTimer = null;
  refreshTournamentLeaderboard()
    .then(() => { tournamentFinalRefreshRetryCount = 0; })
    .catch((error) => {
      if (handleTournamentRefreshFailure(error)) return;
      console.error("[tournament] final standings refresh failed:", error);
      if (tournamentFinalRefreshRetryCount >= TOURNAMENT_FINAL_REFRESH_MAX_RETRIES) return;
      const delayMs = tournamentFinalRefreshRetryDelayMs(tournamentFinalRefreshRetryCount);
      tournamentFinalRefreshRetryCount += 1;
      tournamentFinalRefreshTimer = window.setTimeout(runTournamentFinalRefresh, delayMs);
    });
}

function scheduleTournamentFinalRefresh(room = app.tournamentRoom) {
  const endsAt = room?.ends_at ?? "";
  const endMs = new Date(endsAt).getTime();
  if (!Number.isFinite(endMs) || !endsAt || tournamentFinalRefreshEndsAt === endsAt) return;
  if (tournamentFinalRefreshTimer) clearTimeout(tournamentFinalRefreshTimer);
  tournamentFinalRefreshEndsAt = endsAt;
  tournamentFinalRefreshRetryCount = 0;
  const delayMs = Math.max(0, endMs - tournamentNow() + TOURNAMENT_FINAL_REFRESH_GRACE_MS);
  tournamentFinalRefreshTimer = window.setTimeout(runTournamentFinalRefresh, delayMs);
}

function startTournamentPolling() {
  stopTournamentPolling();
  const code = app.tournamentRoom?.code;
  if (!code) return;
  tournamentLastRefreshAt = Date.now();
  scheduleTournamentFinalRefresh();
  tournamentPollTimer = window.setInterval(() => {
    // Realtime is primary. Poll only as a safety net: frequently while the
    // channel is unavailable, every 30s in the lobby (so a missed Start/Ready
    // broadcast self-heals), and only every ten minutes during live play.
    if (document.visibilityState === "hidden") return;
    const intervalMs = tournamentPollIntervalMs({
      channelJoined: app.tournamentChannel?.state === "joined",
      roomStatus: app.tournamentRoom?.status,
    });
    if (Date.now() - tournamentLastRefreshAt < intervalMs) return;
    refreshTournamentLeaderboard().catch((error) => {
      if (handleTournamentRefreshFailure(error)) return;
      console.error("[tournament] leaderboard refresh failed:", error);
    });
  }, TOURNAMENT_POLL_TICK_MS);
}

let tournamentCountdownTimer = null;
function stopTournamentCountdownTicker() {
  if (tournamentCountdownTimer) { clearInterval(tournamentCountdownTimer); tournamentCountdownTimer = null; }
}
function startTournamentCountdownTicker() {
  stopTournamentCountdownTicker();
  renderTournamentCountdown();
  tournamentCountdownTimer = window.setInterval(() => {
    if (app.currentScreen !== "tournament" || !app.tournamentRoom) {
      stopTournamentCountdownTicker();
      return;
    }
    renderTournamentCountdown();
  }, 1000);
}

function tournamentPresencePayload(state = "lobby") {
  const u = app.authState.user;
  return {
    id: u?.id || "",
    name: u?.user_metadata?.display_name || u?.user_metadata?.full_name || u?.email || "Player",
    avatar: u?.user_metadata?.avatar_url || u?.user_metadata?.picture || "",
    state,
    updatedAt: Date.now(),
  };
}

function trackTournamentPresence(state = app.tournamentReady ? "ready" : "lobby") {
  if (!app.tournamentChannel) return;
  presenceTrack(app.tournamentChannel, tournamentPresencePayload(state));
}

function tournamentReadyCounts() {
  const hostId = app.tournamentRoom?.creator_user_id || "";
  const roster = app.tournamentRoster ?? [];
  if (roster.length) {
    const eligible = roster.filter((player) => player.userId !== hostId && !player.removedAt);
    return { ready: eligible.filter((player) => player.ready).length, total: eligible.length };
  }
  const players = app.tournamentPresence ?? [];
  const eligible = players.filter((player) =>
    (!hostId || player.id !== hostId) &&
    player.state !== "finished" &&
    player.state !== "playing"
  );
  const total = eligible.length;
  const ready = eligible.filter((player) => player.state === "ready").length;
  return { ready, total };
}

async function maybeAutoStartTournamentAttempt() {
  const room = app.tournamentRoom;
  if (!room || room.status !== "live" || !room.started_at) return;
  // The host stays in the lobby after opening the tournament and joins the
  // board deliberately with the Enter game button. Every other player is
  // moved into their attempt automatically.
  if (app.tournamentIsHost) return;
  if (app.currentScreen !== "tournament") return;
  if (app.tournamentAutoStarting || app.tournamentRunProof || runProof?.tournament) return;
  if (room.playerState?.hasSubmitted || room.playerState?.hasStarted) return;
  app.tournamentAutoStarting = true;
  try {
    await startTournamentAttempt();
  } finally {
    app.tournamentAutoStarting = false;
  }
}

async function handleHostStartTournament() {
  const code = app.tournamentRoom?.code;
  if (!code || !app.tournamentIsHost || app.tournamentStatus === "starting-room") return;
  const roomGeneration = tournamentRoomOpenGeneration;
  app.tournamentStatus = "starting-room";
  renderTournamentRoom();
  try {
    const data = await startTournamentRoom(code);
    if (roomGeneration !== tournamentRoomOpenGeneration || app.tournamentRoom?.code !== code) return;
    syncTournamentServerClock(data?.serverNow);
    const room = data.room ?? data;
    app.tournamentRoom = { ...app.tournamentRoom, ...room };
    scheduleTournamentFinalRefresh(app.tournamentRoom);
    app.tournamentReady = false;
    app.tournamentStatus = "ready";
    renderTournamentRoom();
    // Wake connected players immediately. Polling remains the fallback for a
    // reconnect or a browser that cannot keep a Realtime channel alive.
    const broadcastRoomLive = () => {
      if (app.tournamentRoom?.code !== room.code || app.tournamentRoom?.status !== "live") return;
      sendTournamentBroadcast("room-live", { code: room.code }).catch((error) => {
        console.error("[tournament] room-live broadcast failed:", error);
      });
    };
    broadcastRoomLive();
    window.setTimeout(broadcastRoomLive, 1_500);
    window.setTimeout(broadcastRoomLive, 4_000);
    maybeAutoStartTournamentAttempt().catch((error) => {
      console.error("[tournament] auto start failed:", error);
    });
  } catch (error) {
    if (roomGeneration !== tournamentRoomOpenGeneration || app.tournamentRoom?.code !== code) return;
    console.error("[tournament] host start failed:", error);
    app.tournamentStatus = "ready";
    if (error.message === "already_started") {
      try {
        await refreshTournamentLeaderboard();
      } catch (refreshError) {
        if (!handleTournamentRefreshFailure(refreshError)) {
          console.error("[tournament] already-started refresh failed:", refreshError);
        }
      }
      return;
    }
    if (error.message === "players_not_ready") {
      try {
        await refreshTournamentLeaderboard();
      } catch (refreshError) {
        if (handleTournamentRefreshFailure(refreshError)) return;
        console.error("[tournament] readiness refresh failed:", refreshError);
      }
    }
    const { ready, total } = tournamentReadyCounts();
    showToast(
      error.message === "not_host" ? "Only the host can start." :
      error.message === "players_not_ready" ? `Waiting for all players: ${ready}/${total} ready.` :
      "Could not start the tournament.",
    );
    renderTournamentRoom();
  }
}

async function refreshTournamentLeaderboard() {
  const code = app.tournamentRoom?.code;
  if (!code) return null;
  if (tournamentRefreshInFlight && tournamentRefreshInFlightCode === code) return tournamentRefreshInFlight;
  const request = (async () => {
    const data = await fetchTournamentLeaderboard(code);
    // Ignore a response if the user switched rooms while it was in flight.
    if (app.tournamentRoom?.code !== code) return data;
    syncTournamentServerClock(data?.serverNow);
    tournamentLastRefreshAt = Date.now();
    app.tournamentLeaderboard = data?.entries ?? [];
    if (data?.room) {
      app.tournamentRoom = { ...app.tournamentRoom, ...data.room };
      app.tournamentRoster = data?.players ?? app.tournamentRoster;
      const ownPlayer = app.tournamentRoster.find((player) => player.userId === app.authState.user?.id);
      if (ownPlayer) app.tournamentReady = Boolean(ownPlayer.ready);
      scheduleTournamentFinalRefresh(app.tournamentRoom);
    }
    renderTournamentRoom();
    maybeAutoStartTournamentAttempt().catch((error) => {
      console.error("[tournament] auto start failed:", error);
    });
    return data;
  })();
  tournamentRefreshInFlight = request;
  tournamentRefreshInFlightCode = code;
  request.then(() => {
    if (tournamentRefreshInFlight === request) {
      tournamentRefreshInFlight = null;
      tournamentRefreshInFlightCode = "";
    }
  }, () => {
    if (tournamentRefreshInFlight === request) {
      tournamentRefreshInFlight = null;
      tournamentRefreshInFlightCode = "";
    }
  });
  return request;
}

function applyTournamentLeaderboardInsert(row) {
  if (!row || row.room_id !== app.tournamentRoom?.id || !row.user_id) return;
  const entry = {
    userId: row.user_id,
    accountName: row.account_name || "Player",
    avatarUrl: row.avatar_url || "",
    score: Number(row.score) || 0,
    movesUsed: Number(row.moves_used) || 0,
    submittedAt: row.created_at || new Date().toISOString(),
    isPlayer: row.user_id === app.authState.user?.id,
  };
  const entries = (app.tournamentLeaderboard ?? [])
    .filter((current) => current.userId !== entry.userId)
    .concat(entry)
    .sort((a, b) =>
      (Number(b.score) || 0) - (Number(a.score) || 0) ||
      (Number(a.movesUsed) || 0) - (Number(b.movesUsed) || 0) ||
      String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")),
    )
    .map((current, index) => ({ ...current, rank: index + 1 }));
  app.tournamentLeaderboard = entries;
  renderTournamentRoom();
}

function markTournamentSubmissionAccepted(rawEntry, result) {
  if (app.tournamentRoom) {
    app.tournamentRoom = {
      ...app.tournamentRoom,
      playerState: {
        ...(app.tournamentRoom.playerState ?? {}),
        hasStarted: true,
        hasSubmitted: true,
        score: Number(rawEntry?.score ?? result?.score ?? 0),
      },
    };
  }
  if (rawEntry?.room_id && rawEntry?.user_id) applyTournamentLeaderboardInsert(rawEntry);
}

function renderTournamentLeaderboardRows() {
  const rows = app.tournamentLeaderboard ?? [];
  if (rows.length === 0) {
    return `<div class="leaderboard-empty">No submitted scores yet.</div>`;
  }
  return rows.map((entry) => (
    (() => {
      const avatar = entry.avatarUrl
        ? `<img class="leaderboard-avatar" src="${escapeHtml(entry.avatarUrl)}" alt="" aria-hidden="true" />`
        : `<span class="leaderboard-avatar leaderboard-avatar--placeholder" aria-hidden="true"></span>`;
      return (
    `<div class="leaderboard-row tournament-leaderboard-row${entry.isPlayer ? " is-player" : ""}${entry.rank <= 3 ? ` is-top3 is-rank${entry.rank}` : ""}">` +
      `<div class="leaderboard-rank">` +
        (entry.rank <= 3
          ? `<span class="leaderboard-medal" aria-hidden="true">${entry.rank}</span><span class="sr-only">Rank ${entry.rank}</span>`
          : `#${entry.rank}`) +
      `</div>` +
      avatar +
      `<div class="leaderboard-user">` +
        `<span class="leaderboard-title">${escapeHtml(entry.accountName || "Player")}</span>` +
        `<span class="leaderboard-meta">${Number(entry.movesUsed || 0)} moves · ${entry.isPlayer ? "Your run" : "Tournament run"}</span>` +
      `</div>` +
      `<div class="leaderboard-value">${Number(entry.score || 0).toLocaleString()}</div>` +
    `</div>`
      );
    })()
  )).join("");
}

function renderTournamentRoom() {
  if (app.currentScreen !== "tournament") return;
  const room = app.tournamentRoom;
  elements.tournamentScreen?.classList.toggle("has-room", Boolean(room));
  const status = elements.tournamentStatusText;
  if (status) {
    status.textContent =
      app.tournamentStatus === "loading" ? "Loading room…" :
      app.tournamentStatus === "error" ? "Room unavailable." : "";
  }
  if (!elements.tournamentRoomPanel) return;
  elements.tournamentRoomPanel.hidden = !room;
  // Copy invite lives in the always-visible header now, so toggle it with the room.
  if (elements.tournamentCopyBtn) elements.tournamentCopyBtn.hidden = !room;
  if (!room) return;

  if (elements.tournamentRoomTitle) elements.tournamentRoomTitle.textContent = room.title || "Tournament Room";

  renderTournamentPlayers();
  renderTournamentCountdown();

  if (elements.tournamentLeaderboard) {
    elements.tournamentLeaderboard.innerHTML =
      `<div class="leaderboard-list">${renderTournamentLeaderboardRows()}</div>`;
  }

  const started = room.status === "live" && room.started_at;
  const ended = room.status === "ended";
  const hasSubmitted = Boolean(room.playerState?.hasSubmitted);
  const readyCounts = tournamentReadyCounts();

  if (elements.tournamentReadyBtn) {
    const showReady = room.status === "lobby" && !app.tournamentIsHost;
    elements.tournamentReadyBtn.hidden = !showReady;
    elements.tournamentReadyBtn.disabled = tournamentReadyUpdateInFlight;
    elements.tournamentReadyBtn.classList.toggle("is-ready", Boolean(app.tournamentReady));
    elements.tournamentReadyBtn.setAttribute("aria-pressed", String(Boolean(app.tournamentReady)));
    elements.tournamentReadyBtn.setAttribute("aria-busy", String(tournamentReadyUpdateInFlight));
    elements.tournamentReadyBtn.textContent = tournamentReadyUpdateInFlight
      ? "Updating…"
      : app.tournamentReady ? "Ready ✓" : "Ready";
  }

  // Host sees Start Tournament while the room is still in lobby.
  if (elements.tournamentHostStartBtn) {
    elements.tournamentHostStartBtn.hidden = !(app.tournamentIsHost && room.status === "lobby");
    // The server performs the authoritative atomic readiness check. Never trap
    // the host behind a stale local roster if a broadcast was missed.
    elements.tournamentHostStartBtn.disabled = app.tournamentStatus === "starting-room";
    elements.tournamentHostStartBtn.textContent = app.tournamentStatus === "starting-room"
      ? "Starting…"
      : readyCounts.total > 0
        ? `Start Tournament · ${readyCounts.ready}/${readyCounts.total} ready`
        : "Start Tournament";
  }
  // Start Attempt is live only once the host has started and the player hasn't run.
  if (elements.tournamentStartBtn) {
    elements.tournamentStartBtn.hidden = room.status === "lobby";
    const pastDeadline = isTournamentEnded(room.ends_at, tournamentNow());
    elements.tournamentStartBtn.disabled = !started || ended || pastDeadline || hasSubmitted || app.tournamentStatus === "starting";
    elements.tournamentStartBtn.textContent =
      hasSubmitted ? "Attempt used" :
      ended || pastDeadline ? "Tournament ended" :
      !started ? "Waiting for host…" :
      app.tournamentStatus === "starting" ? "Starting…" :
      app.tournamentIsHost ? "Enter game" : "Start Attempt";
  }
}

function renderTournamentPlayers() {
  if (!elements.tournamentPlayers) return;
  const room = app.tournamentRoom;
  const presence = app.tournamentPresence ?? [];
  const presenceById = new Map(presence.map((player) => [player.id, player]));
  const roster = (app.tournamentRoster ?? []).filter((player) => !player.removedAt);
  const players = roster.length
    ? roster.map((player) => {
      const live = presenceById.get(player.userId);
      return {
        id: player.userId,
        name: live?.name || player.accountName || "Player",
        avatar: live?.avatar || player.avatarUrl || "",
        state: live?.state || (player.ready ? "ready" : "lobby"),
        updatedAt: live?.updatedAt || 0,
      };
    })
    : presence;
  if (!players.length) {
    elements.tournamentPlayers.innerHTML = `<li class="tournament-player is-empty">No one connected yet…</li>`;
    return;
  }
  elements.tournamentPlayers.innerHTML = players.map((p) => {
    const rosterPlayer = (app.tournamentRoster ?? []).find((entry) => entry.userId === p.id);
    const effectiveState = p.state === "playing" || p.state === "finished"
      ? p.state
      : rosterPlayer?.ready ? "ready" : "lobby";
    const name = escapeHtml(p.name || "Player");
    const id = escapeHtml(p.id || "");
    const initial = escapeHtml((p.name || "?").slice(0, 1).toUpperCase());
    const avatar = p.avatar
      ? `<img src="${safeImgSrc(p.avatar)}" alt="" />`
      : `<span class="tournament-player-avatar">${initial}</span>`;
    const state = effectiveState === "playing" ? "playing" :
      effectiveState === "finished" ? "finished" :
      effectiveState === "ready" ? "ready" : "in lobby";
    const stateClass = effectiveState === "ready" ? " is-ready" :
      effectiveState === "playing" ? " is-playing" :
      effectiveState === "finished" ? " is-finished" : "";
    const canKick = app.tournamentIsHost && room?.status === "lobby" && p.id && p.id !== room.creator_user_id;
    const kick = canKick
      ? `<button class="tournament-player-kick" type="button" data-tournament-player-kick="${id}" aria-label="Remove ${name} from the lobby" title="Remove player"></button>`
      : "";
    return `<li class="tournament-player${stateClass}" title="${name} · ${state}" aria-label="${name}, ${state}">` +
      `${avatar}${kick}<span class="sr-only">${name}, ${state}</span></li>`;
  }).join("");
}

async function handleTournamentPlayerAction(event) {
  const button = event.target.closest("[data-tournament-player-kick]");
  if (!button || !app.tournamentIsHost || app.tournamentRoom?.status !== "lobby") return;
  const userId = button.dataset.tournamentPlayerKick;
  const code = app.tournamentRoom?.code;
  if (!userId || !code) return;
  button.disabled = true;
  try {
    await removeTournamentPlayer(code, userId);
    if (app.tournamentRoom?.code !== code || app.currentScreen !== "tournament") return;
    app.tournamentPresence = (app.tournamentPresence ?? []).filter((player) => player.id !== userId);
    app.tournamentRoster = (app.tournamentRoster ?? []).map((player) =>
      player.userId === userId ? { ...player, removedAt: new Date().toISOString(), ready: false } : player,
    );
    sendTournamentBroadcast("kick", { code, userId }).catch((error) => {
      console.error("[tournament] kick broadcast failed:", error);
    });
    renderTournamentRoom();
  } catch (error) {
    console.error("[tournament] remove player failed:", error);
    showToast(error.message === "not_host" ? "Only the host can remove players." : "Could not remove player.");
    button.disabled = false;
  }
}

async function toggleTournamentReady() {
  const room = app.tournamentRoom;
  if (!room || room.status !== "lobby" || app.tournamentIsHost || tournamentReadyUpdateInFlight) return;
  const code = room.code;
  const userId = app.authState.user?.id;
  const next = !app.tournamentReady;
  tournamentReadyUpdateInFlight = true;
  renderTournamentRoom();
  try {
    const data = await setTournamentReady(code, next);
    if (app.tournamentRoom?.code !== code) return;
    const ready = Boolean(data?.ready);
    const readyUpdatedAt = data?.readyUpdatedAt || new Date().toISOString();
    app.tournamentReady = ready;
    app.tournamentRoster = (app.tournamentRoster ?? []).map((player) =>
      player.userId === userId ? { ...player, ready, readyUpdatedAt } : player,
    );
    sendTournamentBroadcast("ready", { code, userId, ready, readyUpdatedAt }).catch((error) => {
      console.error("[tournament] ready broadcast failed:", error);
    });
  } catch (error) {
    console.error("[tournament] ready update failed:", error);
    if (!handleTournamentRefreshFailure(error)) showToast("Could not update readiness.");
  } finally {
    if (app.tournamentRoom?.code === code) {
      tournamentReadyUpdateInFlight = false;
      renderTournamentRoom();
    }
  }
}

function renderTournamentCountdown() {
  if (!elements.tournamentRoomCountdown) return;
  const room = app.tournamentRoom;
  if (!room) {
    elements.tournamentRoomCountdown.textContent = "";
    return;
  }
  if (room.status === "lobby") {
    elements.tournamentRoomCountdown.textContent = "Waiting for host";
    return;
  }
  if (room.status === "ended" || isTournamentEnded(room.ends_at, tournamentNow())) {
    elements.tournamentRoomCountdown.textContent = "Tournament ended";
    return;
  }
  const timeLeft = formatTimeLeft(room.ends_at);
  elements.tournamentRoomCountdown.textContent = timeLeft ? `Ends in ${timeLeft}` : "Tournament live";
}

// In-run tournament ticker: refreshes ONLY the #timerValue text every second so
// the time-left card counts down live, independent of moves/actions. Separate
// from the lobby countdown ticker (startTournamentCountdownTicker).
let tournamentRunTicker = null;
let tournamentTimeExpired = false;
let tournamentTimeExpiryQueued = false;
function stopTournamentRunTicker() {
  if (tournamentRunTicker) { clearInterval(tournamentRunTicker); tournamentRunTicker = null; }
}
function updateTournamentRunTimer() {
  const proof = app.tournamentRunProof;
  const room = app.tournamentRoom;
  if (!elements.timerValue || !room) return;
  const endValue = proof?.expiresAt ?? proof?.expires_at ?? room.playerState?.expiresAt;
  elements.timerValue.textContent = endValue ? formatTimeLeft(endValue) : "--:--";
  const expiresAt = new Date(endValue ?? "").getTime();
  if (Number.isFinite(expiresAt) && tournamentNow() >= expiresAt && !tournamentTimeExpiryQueued) {
    // renderTournamentHud() calls this synchronously during render(), so defer
    // the state transition to avoid rendering recursively from inside render.
    tournamentTimeExpiryQueued = true;
    queueMicrotask(() => {
      tournamentTimeExpiryQueued = false;
      endTournamentForTimeLimit();
    });
  }
}

function endTournamentForTimeLimit() {
  if (tournamentTimeExpired || !app.state || app.state.gameOver || app.state.victory) return;
  tournamentTimeExpired = true;
  stopTournamentRunTicker();
  resetInteractionState();
  // Time, not moves, ended this attempt. Keep the remaining-moves value for
  // the result record, but lock the board and submit the replay as partial.
  applyState({
    ...app.state,
    gameOver: true,
    tournamentTimedOut: true,
    status: "Tournament time is up — run over.",
    _lastResolution: null,
  });
}
function startTournamentRunTicker() {
  stopTournamentRunTicker();
  tournamentRunTicker = window.setInterval(() => {
    // Self-stop once the run/tournament is gone or the player left the board.
    if (app.currentScreen !== "game" || !app.tournamentRunProof || !app.tournamentRoom) {
      stopTournamentRunTicker();
      return;
    }
    updateTournamentRunTimer();
  }, 1000);
}

function renderTournamentHud() {
  // Legacy topbar-right HUD is retired: title now lives in the full-width bar
  // right of the back button, time in its own stat card.
  if (elements.tournamentHud) {
    elements.tournamentHud.hidden = true;
    elements.tournamentHud.textContent = "";
  }
  const proof = app.tournamentRunProof;
  const room = app.tournamentRoom;
  if (!proof || !room) {
    if (elements.tournamentTitleBar) elements.tournamentTitleBar.hidden = true;
    if (elements.timerPill) elements.timerPill.hidden = true;
    stopTournamentRunTicker();
    return;
  }
  const title = String(room.title || "Tournament Room").trim();
  if (elements.tournamentTitleText) elements.tournamentTitleText.textContent = title;
  if (elements.tournamentTitleBar) elements.tournamentTitleBar.hidden = false;
  updateTournamentRunTimer();
  if (elements.timerPill) elements.timerPill.hidden = false;
  startTournamentRunTicker();
}

async function openTournamentRoom(code) {
  // Keep the auth boundary here as well as in the Lobby button and invite
  // handler. That way no future call site can reveal or request a room for a
  // guest by accidentally bypassing the outer UI guards.
  if (!app.authState.user) {
    openAuthModal({ force: true });
    return;
  }
  const openGeneration = ++tournamentRoomOpenGeneration;
  // The Lobby is a standalone screen: tear down the join/create modal and any
  // open desktop section overlay first, so the room never mounts UNDER them.
  // Both are no-ops on mobile (sections are full screens there, no overlay).
  closeTournamentModal();
  if (activeMetaOverlay) closeMetaOverlay();
  const normalized = normalizeTournamentCode(code);
  if (!normalized) {
    setScreen("tournament");
    render();
    return;
  }
  app.tournamentCodeInput = normalized;
  app.tournamentStatus = "loading";
  setScreen("tournament");
  render();
  try {
    const data = await getTournamentRoom(normalized);
    if (openGeneration !== tournamentRoomOpenGeneration) return;
    syncTournamentServerClock(data?.serverNow);
    app.tournamentRoom = { ...data.room, playerState: data.playerState };
    app.tournamentRoster = data.players ?? [];
    app.tournamentIsHost = Boolean(
      app.authState.user && data.room.creator_user_id === app.authState.user.id,
    );
    app.tournamentLeaderboard = data.entries ?? [];
    app.tournamentStatus = "ready";
    app.tournamentReady = Boolean(app.tournamentRoster.find((player) => player.userId === app.authState.user?.id)?.ready);
    tournamentReadyUpdateInFlight = false;
    if (restoreTournamentRecovery(app.tournamentRoom)) {
      return;
    }
    // A server-only draft (another tab/device) is resumed only through the
    // Start Attempt button, which atomically claims its short session lease.
    // A completed card survives a network outage or a tab reload. Retry its
    // idempotent server submission as soon as the player is back in the room.
    await retryPendingTournamentSubmission(app.tournamentRoom);
    if (openGeneration !== tournamentRoomOpenGeneration) return;
    startTournamentPolling();
    startTournamentCountdownTicker();
    try {
      const channel = await subscribeTournamentRoom(normalized, app.tournamentRoom.id, {
        // Every participant needs fresh standings after finishing early. One
        // Postgres change is cheaper and more immediate than every browser
        // polling the Edge Function after every result.
        onLeaderboardInsert: applyTournamentLeaderboardInsert,
        onPresenceSync: (state) => {
          // Everyone shares the room-code presence key, so metas arrive in one
          // array. Collapse to one row per user by the newest meta; this lets
          // Ready toggle both ways. Older clients without updatedAt fall back to
          // state rank so playing/finished still win over stale lobby metas.
          const rank = { finished: 4, playing: 3, ready: 2, lobby: 1 };
          const byUser = new Map();
          for (const m of Object.values(state || {}).flat()) {
            const key = m.id || m.name || "?";
            const prev = byUser.get(key);
            const currentUpdated = Number(m.updatedAt) || 0;
            const prevUpdated = Number(prev?.updatedAt) || 0;
            const isNewer = currentUpdated && currentUpdated >= prevUpdated;
            const isRankedFallback = !currentUpdated && !prevUpdated && ((rank[m.state] || 0) > (rank[prev?.state] || 0));
            if (!prev || isNewer || isRankedFallback) {
              byUser.set(key, {
                id: m.id,
                name: m.name,
                avatar: m.avatar,
                state: m.state,
                updatedAt: currentUpdated,
              });
            }
          }
          app.tournamentPresence = [...byUser.values()];
          renderTournamentPlayers();
          renderTournamentRoom();
        },
        onBroadcast: ({ event, payload }) => {
          if (payload?.code !== normalized) return;
          if (event === "kick") {
            // Broadcast wakes clients but is not the authority. Confirm the
            // durable membership snapshot before hiding a player or ejecting
            // this tab, so a forged/stale channel message cannot remove anyone.
            refreshTournamentLeaderboard().catch((error) => {
              if (!handleTournamentRefreshFailure(error)) {
                console.error("[tournament] kick confirmation failed:", error);
              }
            });
            return;
          }
          if (event === "ready") {
            app.tournamentRoster = (app.tournamentRoster ?? []).map((player) => {
              if (player.userId !== payload?.userId) return player;
              const incomingAt = new Date(payload?.readyUpdatedAt ?? 0).getTime();
              const currentAt = new Date(player.readyUpdatedAt ?? 0).getTime();
              if (Number.isFinite(currentAt) && currentAt > 0 && (!Number.isFinite(incomingAt) || incomingAt < currentAt)) {
                return player;
              }
              return {
                ...player,
                ready: Boolean(payload.ready),
                readyUpdatedAt: payload?.readyUpdatedAt || player.readyUpdatedAt || new Date().toISOString(),
              };
            });
            if (payload?.userId === app.authState.user?.id) {
              app.tournamentReady = Boolean(payload.ready);
            }
            renderTournamentRoom();
            return;
          }
          if (event === "room-live") {
            // The broadcast contains no room data/seed. Fetch the authenticated
            // room view immediately instead of waiting up to five seconds for
            // the polling fallback.
            refreshTournamentLeaderboard().catch((error) => {
              console.error("[tournament] room-live refresh failed:", error);
            });
          }
        },
      });
      if (openGeneration !== tournamentRoomOpenGeneration) {
        await unsubscribeTournamentRoom();
        return;
      }
      app.tournamentChannel = channel;
      // Ready is durable server state and travels through the dedicated
      // broadcast/snapshot path. Presence only describes connection/gameplay,
      // avoiding the Free-plan presence burst when a lobby readies together.
      presenceTrack(channel, tournamentPresencePayload("lobby"));
    } catch (error) {
      if (openGeneration !== tournamentRoomOpenGeneration) return;
      console.error("[tournament] realtime subscribe failed:", error);
      // Poll fallback (startTournamentPolling) keeps the room usable.
    }
    render();
  } catch (error) {
    if (openGeneration !== tournamentRoomOpenGeneration) return;
    console.error("[tournament] room load failed:", error);
    app.tournamentRoom = null;
    app.tournamentLeaderboard = [];
    app.tournamentRoster = [];
    app.tournamentStatus = "error";
    showToast(
      error.message === "room_not_found" ? "Tournament room not found." :
      error.message === "removed_from_room" ? "You were removed from this lobby." :
      error.message === "room_full" ? "Tournament room is full." :
      "Could not load tournament room.",
    );
    render();
  }
}

// Segmented Create/Join switch — show one form at a time. `focus` is false on
// the initial open (avoids yanking focus before the modal animates in).
function setTournamentModalTab(tab, { focus = true } = {}) {
  const isJoin = tab === "join";
  if (elements.tournamentTabCreate) {
    elements.tournamentTabCreate.classList.toggle("is-active", !isJoin);
    elements.tournamentTabCreate.setAttribute("aria-selected", String(!isJoin));
  }
  if (elements.tournamentTabJoin) {
    elements.tournamentTabJoin.classList.toggle("is-active", isJoin);
    elements.tournamentTabJoin.setAttribute("aria-selected", String(isJoin));
  }
  if (elements.tournamentModalCreateForm) elements.tournamentModalCreateForm.hidden = isJoin;
  if (elements.tournamentModalJoinForm) elements.tournamentModalJoinForm.hidden = !isJoin;
  if (focus) {
    const field = isJoin ? elements.tournamentModalJoinCode : elements.tournamentModalCreateTitle;
    field?.focus();
  }
}

function openTournamentModal() {
  app.tournamentModalOpen = true;
  setTournamentModalTab("join", { focus: false });
  if (elements.tournamentModal) {
    elements.tournamentModal.hidden = false;
    elements.tournamentModal.setAttribute("aria-hidden", "false");
  }
}

function closeTournamentModal() {
  app.tournamentModalOpen = false;
  if (elements.tournamentModal) {
    elements.tournamentModal.hidden = true;
    elements.tournamentModal.setAttribute("aria-hidden", "true");
  }
}

// Entry point for the "Lobby" nav/button. The create/join modal is shown ONLY
// when there's no joined room yet; once you're in a room, re-clicking Lobby
// (from Home, a section page, etc.) drops you straight back into that room
// instead of re-prompting. Leaving the room (leaveTournament) is what re-arms
// the modal.
function enterTournament() {
  // Guests must sign in first: pop the auth modal, then re-enter the Lobby
  // automatically once signed in (handled in the auth onChange / init paths).
  if (!app.authState.user) {
    setAfterAuthAction("lobby");
    openAuthModal({ force: true });
    return;
  }
  const code = app.tournamentRoom?.code;
  if (code) {
    openTournamentRoom(code);
    return;
  }
  openTournamentModal();
}

// Explicit "Leave lobby" from inside the room: fully drop the joined room so the
// next Lobby entry starts fresh (modal again), then return to the start screen.
function leaveTournament() {
  tournamentRoomOpenGeneration += 1;
  stopTournamentPolling();
  app.tournamentRoom = null;
  app.tournamentLeaderboard = [];
  app.tournamentPresence = [];
  app.tournamentRoster = [];
  app.tournamentReady = false;
  tournamentReadyUpdateInFlight = false;
  app.tournamentIsHost = false;
  app.tournamentStatus = "idle";
  app.tournamentCodeInput = "";
  goToStart();
}

async function handleModalCreate(event) {
  event.preventDefault();
  if (!app.authState.user) { openAuthModal({ force: true }); return; }
  const btn = elements.tournamentModalCreateForm?.querySelector("button[type=submit]");
  if (btn) btn.disabled = true;
  try {
    const data = await createTournamentRoom({
      title: elements.tournamentModalCreateTitle?.value,
      durationMinutes: 10,
    });
    const room = data.room ?? data;
    closeTournamentModal();
    if (elements.tournamentModalCreateTitle) elements.tournamentModalCreateTitle.value = "";
    await openTournamentRoom(room.code);
    showToast(`Tournament room ${room.code} created.`);
  } catch (error) {
    console.error("[tournament] create failed:", error);
    showToast(error.message || "Could not create tournament room.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleModalJoin(event) {
  event.preventDefault();
  const code = normalizeTournamentCode(elements.tournamentModalJoinCode?.value);
  if (!code) { showToast("Enter a room code."); return; }
  closeTournamentModal();
  await openTournamentRoom(code);
}

async function copyTournamentInvite() {
  const room = app.tournamentRoom;
  if (!room?.code) return;
  const url = `${location.origin}/t/${room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Invite link copied.");
  } catch {
    showToast(`Code: ${room.code}`);
  }
}

function backToTournamentRoom() {
  const code = app.tournamentRoom?.code;
  submitTournamentAbandon();
  if (!code) {
    goToStart();
    return;
  }
  app.state = null;
  clearRunProof();
  app.tournamentRunProof = null;
  setScreen("tournament");
  render();
  openTournamentRoom(code);
}

const AUTH_REQUIRED_META_SECTIONS = new Set(["quests"]);

function renderStartMetaTabs(active = activeMetaOverlay) {
  if (elements.startRun) {
    elements.startRun.disabled = Boolean(active);
  }
  elements.startScreen?.classList.toggle("has-meta-popup", Boolean(active));
  // Refresh the desktop top navbar's active underline (desktop tracks the open
  // section via activeMetaOverlay). Visibility is owned by the screen-change
  // block + CSS media query.
  renderGlobalNav(elements.globalMetaNav, active || "home");
  const map = [
    [elements.startQuests, "quests"],
    [elements.startLeaderboard, "rank"],
    [elements.startTournament, "tournament"],
    [elements.startGuide, "guide"],
  ];
  const normalizedActive = active === "public-profile" ? "rank" : active;
  for (const [button, id] of map) {
    if (!button) continue;
    const current = normalizedActive === id;
    button.classList.toggle("is-active", current);
    button.setAttribute("aria-current", current ? "page" : "false");
    if (AUTH_REQUIRED_META_SECTIONS.has(id)) {
      button.classList.toggle("is-locked", !app.authState.user);
      button.setAttribute("aria-disabled", app.authState.user ? "false" : "true");
    }
  }
}

function scrollToPageStart(...containers) {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  for (const element of [document.scrollingElement, document.documentElement, document.body, ...containers]) {
    if (!element) continue;
    element.scrollTop = 0;
    element.scrollLeft = 0;
  }
}

function resetMetaScroll() {
  scrollToPageStart(
    // On desktop the meta-popup / tournament screen ARE the scroll containers
    // (overflow-y:auto). They must be reset too, or switching tabs while
    // scrolled down opens the new tab still scrolled (updatePageScrolledState
    // reads these same elements).
    elements.metaPopup,
    elements.tournamentScreen,
    elements.leaderboardContent,
    elements.profileContent,
    elements.metaPopupContent,
    elements.collectionContent,
    elements.questsContent,
    elements.guideContent,
    elements.publicProfileContent,
  );
  updatePageScrolledState();
}

// Only a currently-visible scroller counts: a hidden screen retains its old
// scrollTop, and including it would keep the navbar in its solid "scrolled"
// state on a different screen that's actually at its top (e.g. Profile).
function visibleScrollTop(el) {
  if (!el || el.hidden) return 0;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return 0;
  return el.scrollTop || 0;
}

function updatePageScrolledState() {
  const scrollTop = Math.max(
    window.scrollY || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0,
    visibleScrollTop(elements.metaPopup),
    visibleScrollTop(elements.tournamentScreen),
    visibleScrollTop(elements.leaderboardContent),
    visibleScrollTop(elements.profileContent),
  );
  document.body.classList.toggle("is-page-scrolled", scrollTop > 18);
}

function openMetaSection(section, fromScreen = app.currentScreen) {
  if (section === "play") {
    closeMetaOverlay();
    return;
  }
  // "home" is the navbar's Home entry, not a section — route to the start screen.
  if (section === "home") {
    goToStart();
    return;
  }
  // Quests require a logged-in account.
  if ((section === "quests" || section === "capsules") && !app.authState.user) {
    openAuthModal();
    return;
  }
  // On mobile, route to full screens instead of meta-popup
  if (isMobileViewport()) {
    switch (section) {
      case "collection":
      case "capsules":
        setScreen("collection");
        render();
        resetMetaScroll();
        return;
      case "quests":
        setScreen("quests");
        render();
        resetMetaScroll();
        return;
      case "guide":
        setScreen("guide");
        render();
        resetMetaScroll();
        return;
      case "rank":
        openLeaderboard(fromScreen);
        resetMetaScroll();
        return;
      case "account":
        openProfile(fromScreen, "account");
        resetMetaScroll();
        return;
    }
  }
  // Desktop: use meta-popup as before
  profileTab =
    section === "account" ? "account" :
    section === "rank" ? "rank" :
    section === "quests" ? "quests" :
    section === "capsules" ? "capsules" :
    section === "guide" ? "guide" :
    "collection";
  openMetaOverlay(profileTab);
  resetMetaScroll();
}

function closeMetaOverlay() {
  activeMetaOverlay = null;
  app.metaPublicProfile = null;
  if (elements.metaPopup) {
    elements.metaPopup.hidden = true;
    elements.metaPopup.setAttribute("aria-hidden", "true");
    delete elements.metaPopup.dataset.section;
  }
  renderStartMetaTabs(null);
}

function handleMetaPopupClose() {
  if (activeMetaOverlay === "public-profile") {
    app.metaPublicProfile = null;
    activeMetaOverlay = "rank";
    renderMetaOverlay();
    return;
  }
  // The desktop page pushed a history entry when it opened — pop it so the
  // back-stack and address fragment stay consistent (popstate then closes the
  // popup). Mirrors the mobile back-button pattern. Falls back to a direct close
  // when there's no such entry (e.g. mid-popstate, or no history depth).
  if (!_inPopstate && _historyDepth > 0 && history.state?.meta) {
    history.back();
    return;
  }
  closeMetaOverlay();
}

async function openMetaOverlay(section) {
  app.metaPublicProfile = null;
  const wasOpen = Boolean(elements.metaPopup && !elements.metaPopup.hidden);
  activeMetaOverlay =
    section === "account" ? "account" :
    section === "rank" ? "rank" :
    section === "quests" ? "quests" :
    section === "capsules" ? "capsules" :
    section === "guide" ? "guide" :
    "collection";
  if (elements.metaPopup) {
    elements.metaPopup.hidden = false;
    elements.metaPopup.setAttribute("aria-hidden", "false");
    elements.metaPopup.dataset.section = activeMetaOverlay;
  }
  // Desktop: the section popups are full-screen PAGES, so they get a real
  // browser history entry (address fragment + working Back button). Opening the
  // page from a non-page state pushes one entry; switching sections while a page
  // is already open replaces it (so Back leaves the pages instead of stepping
  // through every section visited). popstate closes the popup when the restored
  // entry has no `meta`. Guarded by _inPopstate so history-driven opens (Back to
  // a page) don't re-push. Mobile routes through setScreen (never reaches here).
  if (!_inPopstate) {
    const entry = { screen: "start", meta: activeMetaOverlay };
    const url = location.pathname + "#" + activeMetaOverlay;
    if (wasOpen) {
      history.replaceState({ ...entry, idx: _historyDepth }, "", url);
    } else {
      _historyDepth++;
      history.pushState({ ...entry, idx: _historyDepth }, "", url);
    }
  }
  if (activeMetaOverlay === "rank" && app.leaderboardStatus !== "ready") {
    app.leaderboardStatus = "loading";
    renderMetaOverlay();
    try {
      app.remoteLeaderboard = await fetchGlobalLeaderboard();
      app.leaderboardStatus = "ready";
    } catch {
      app.leaderboardStatus = "error";
    }
  }
  renderMetaOverlay();
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 699px)").matches;
}

function goToStart() {
  tournamentRoomOpenGeneration += 1;
  submitTournamentAbandon();
  stopTutorialRun();
  stopTournamentPolling();
  closeMetaOverlay();
  resetInteractionState();
  clearRunProof();
  app.tournamentRunProof = null;
  // Drop the finished/abandoned run so nothing can navigate back into a frozen
  // board (close-button fallbacks and popstate both gate on a live run).
  app.state = null;
  setScreen("start");
  render();
}

function exitTournamentGame() {
  if (isTournamentRunInProgress()) {
    const confirmed = window.confirm(
      "Exit game? Your current tournament score will be saved and this attempt cannot be continued.",
    );
    if (!confirmed) return;
  }
  goToStart();
}

function openProfile(fromScreen = app.currentScreen, section = profileTab) {
  lastScreenBeforeProfile = fromScreen;
  profileTab =
    section === "account" ? "account" :
    section === "quests" ? "quests" :
    section === "capsules" ? "capsules" :
    "collection";
  setScreen("profile");
  render();
  if (app.authState.user) {
    fetchUserProgress()
      .then(applyRemoteProgress)
      .catch(() => {})
      .then(() => { if (app.currentScreen === "profile") render(); });
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

async function openLeaderboard(fromScreen = app.currentScreen) {
  lastScreenBeforeLeaderboard = fromScreen;
  app.leaderboardStatus = "loading";
  setScreen("leaderboard");
  renderLeaderboard();
  try {
    const entries = await fetchGlobalLeaderboard();
    app.remoteLeaderboard = entries;
    app.leaderboardStatus = "ready";
    if (app.currentScreen === "leaderboard") renderLeaderboard();
  } catch {
    app.leaderboardStatus = "error";
    if (app.currentScreen === "leaderboard") renderLeaderboard();
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
  const inMetaPopup = app.currentScreen === "start" && elements.metaPopup && !elements.metaPopup.hidden;
  if (inMetaPopup) {
    app.metaPublicProfile = {
      userId,
      accountName,
      avatarUrl,
      entries: null,
      loading: true,
      error: false,
    };
    activeMetaOverlay = "public-profile";
    renderMetaOverlay();
    Promise.all([fetchPublicUserEntries(userId), fetchPublicCollectionTiles(userId)])
      .then(([entries, storedCollectionTiles]) => {
        if (!app.metaPublicProfile || app.metaPublicProfile.userId !== userId) return;
        app.metaPublicProfile = { ...app.metaPublicProfile, entries, storedCollectionTiles, loading: false, error: false };
        renderMetaOverlay();
      })
      .catch(() => {
        if (!app.metaPublicProfile || app.metaPublicProfile.userId !== userId) return;
        app.metaPublicProfile = { ...app.metaPublicProfile, entries: [], storedCollectionTiles: null, loading: false, error: true };
        renderMetaOverlay();
      });
    return;
  }
  if (!elements.publicProfileScreen) return;
  if (elements.publicProfileAvatarEl) {
    elements.publicProfileAvatarEl.style.backgroundImage = safeCssUrl(avatarUrl || "");
    elements.publicProfileAvatarEl.hidden = false;
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

  // Viewing your own card? Reconcile against in-memory progress so a freshly-won
  // form shows immediately, before submit-run has propagated to
  // leaderboard_entries (read-after-write lag would otherwise hide it).
  const isSelf = Boolean(app.authState.user && userId === app.authState.user.id);

  Promise.all([fetchPublicUserEntries(userId), fetchPublicCollectionTiles(userId)])
    .then(([entries, storedCollectionTiles]) => renderPublicProfile(entries, isSelf, userId, storedCollectionTiles))
    .catch(() => {
      if (app.currentScreen === "public-profile" && elements.publicProfileContent) {
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

function collectionFamilySnapshot(progressLike = app.progress) {
  const counts = {};
  for (const entry of getCollectionTileEntries(progressLike)) {
    if (!entry.discovered || !entry.familyId) continue;
    counts[entry.familyId] = (counts[entry.familyId] ?? 0) + 1;
  }
  return counts;
}

function recordVictory(nextState) {
  if (!nextState?.victory || !nextState.victoryMeta) {
    return;
  }

  const { colorId, partnerColorId, formKey, formName } = nextState.victoryMeta;
  const resolvedFormKey = formKey ?? nextState.evolutionChoices[colorId]?.[4] ?? "UNKNOWN";
  // Persist the apex form into the cross-run collection / lifetime stats.
  recordWin(app.progress, {
    formKey: resolvedFormKey,
    formName: formName ?? resolvedFormKey,
    asset: getChosenEvolutionForm(nextState, colorId, 4)?.asset ?? null,
    color: colorId,
    partner: partnerColorId,
    score: nextState.score,
    movesUsed: nextState.movesUsed,
  });
  updateProfileChip();

  submitRunToLeaderboard(nextState, {
    formKey: resolvedFormKey,
    formName: formName ?? resolvedFormKey,
    colorId,
    partnerColorId,
  });
}

function submitRunToLeaderboard(stateLike, formMeta = null) {
  if (runProof?.tournament) {
    submitTournamentResult(stateLike, formMeta, { abandoned: Boolean(stateLike?.tournamentTimedOut) });
    return;
  }
  if (!app.authState.user) return;
  if (!runProof) {
    console.error(
      "[sync] run NOT submitted: signed in but no runProof. " +
        "startTrustedRun likely failed at run start, or the run began before sign-in.",
    );
    return;
  }
  if (!stateLike || !Number.isFinite(Number(stateLike.score)) || Number(stateLike.score) <= 0) {
    clearRunProof();
    return;
  }

  const proof = runProof;
  const best = formMeta ?? getBestRunForm(stateLike);
  const colorId = best.colorId ?? getLeaderColorId(stateLike) ?? "blue";
  const partnerColorId = best.partnerColorId ?? colorId;
  const result = {
    score: stateLike.score,
    movesUsed: stateLike.movesUsed ?? 0,
    formKey: best.formKey ?? "RUN_COMPLETE",
    formName: best.formName ?? best.name ?? "Run Complete",
    colorId,
    partnerColorId,
    vibe: stateLike.vibe?.id ?? null,
  };
  const familyBadges = collectionFamilySnapshot(app.progress);
  console.info("[sync] submitting run result:", proof.runId, result);
  submitTrustedRun(proof.runId, result, proof.actions, {
    familyBadges,
    blupetsCount: collectionTileCount(app.progress),
    progress: app.progress,
  })
    .then((data) => {
      console.info("[sync] submit-run accepted:", data);
      if (data?.eventBadge) {
        refreshEventState();
        if (runProof === proof && app.currentScreen === "gameover") {
          lastRunSummary = { ...(lastRunSummary ?? {}), eventBadge: data.eventBadge };
          renderGameoverScreen(app.state);
        }
      }
      if (data?.progress) {
        applyRemoteProgress(data.progress);
        render();
      }
      return fetchGlobalLeaderboard();
    })
    .then((entries) => { app.remoteLeaderboard = entries; })
    .catch((error) => {
      console.error("[sync] trusted submit failed:", error);
    })
    .finally(() => {
      if (runProof === proof) clearRunProof();
    });
}

function submitTournamentResult(stateLike, formMeta = null, { abandoned = false } = {}) {
  if (!app.authState.user || !runProof?.tournament) return;
  if (!stateLike || !Number.isFinite(Number(stateLike.score)) || Number(stateLike.score) < 0) {
    clearRunProof();
    app.tournamentRunProof = null;
    return;
  }

  const proof = runProof;
  const best = formMeta ?? getBestRunForm(stateLike);
  const colorId = best.colorId ?? getLeaderColorId(stateLike) ?? "blue";
  const partnerColorId = best.partnerColorId ?? colorId;
  const result = {
    score: stateLike.score,
    movesUsed: stateLike.movesUsed ?? 0,
    formKey: best.formKey ?? "RUN_COMPLETE",
    formName: best.formName ?? best.name ?? "Run Complete",
    colorId,
    partnerColorId,
    vibe: stateLike.vibe?.id ?? null,
  };

  console.info("[tournament] submitting run result:", proof.runId, result);
  persistTournamentRecovery({ pendingResult: result, abandoned });
  submitTournamentRun(proof.runId, result, proof.actions, {
    abandoned,
    clientSessionId: tournamentClientSessionId,
  })
    .then(async (data) => {
      console.info("[tournament] submit accepted:", data);
      clearTournamentRecovery(proof);
      markTournamentSubmissionAccepted(data?.entry, result);
      const code = proof.code ?? app.tournamentRoom?.code;
      if (!code) return null;
      // Submission and UI refresh are separate outcomes. Once the server has
      // accepted the score, a failed follow-up read must never tell the player
      // that their score was lost.
      try {
        const roomData = await getTournamentRoom(code);
        if (proof !== app.tournamentRunProof || app.tournamentRoom?.code !== code) return data;
        syncTournamentServerClock(roomData?.serverNow);
        app.tournamentRoom = { ...roomData.room, playerState: roomData.playerState };
        app.tournamentRoster = roomData.players ?? app.tournamentRoster;
        app.tournamentLeaderboard = roomData.entries ?? [];
        if (app.currentScreen === "gameover") renderGameoverScreen(app.state);
      } catch (refreshError) {
        console.warn("[tournament] score saved; standings refresh deferred:", refreshError);
        showToast("Tournament score saved. Standings will refresh shortly.");
      }
      return data;
    })
    .catch((error) => {
      if (isTournamentSessionConflictError(error)) {
        console.info("[tournament] submit blocked by another active tab");
        showToast("This tournament attempt is active in another tab.");
        return;
      }
      if (isTournamentTerminalSubmissionError(error)) {
        clearTournamentRecovery(proof);
        console.info("[tournament] submit closed:", tournamentSyncErrorCode(error));
        showToast(
          tournamentSyncErrorCode(error) === "attempt_expired"
            ? "Tournament closed. Your last verified checkpoint will be used."
            : "Tournament result could not be verified.",
        );
        return;
      }
      console.error("[tournament] submit failed:", error);
      showToast("Score saved on this device. It will retry when the room is reopened.");
    })
    .finally(() => {
      if (runProof === proof) {
        clearRunProof();
      }
    });
}

let _tournamentAbandonSent = false;

// Leaving an in-progress tournament run records the score reached so far.
// Runs through the same replay-verified path (abandoned:true skips the
// "complete" gate). Guarded so a normal finish + a later exit don't double-submit.
function buildTournamentResultFromState(stateLike) {
  if (!stateLike) return null;
  const best = getBestRunForm(stateLike);
  const colorId = best.colorId ?? getLeaderColorId(stateLike) ?? "blue";
  return {
    score: stateLike.score,
    movesUsed: stateLike.movesUsed ?? 0,
    formKey: best.formKey ?? "RUN_COMPLETE",
    formName: best.formName ?? best.name ?? "Run Complete",
    colorId,
    partnerColorId: best.partnerColorId ?? colorId,
    vibe: stateLike.vibe?.id ?? null,
  };
}

function isTournamentRunInProgress() {
  return Boolean(
    runProof?.tournament && app.tournamentRunProof &&
    app.state && !app.state.victory && !app.state.gameOver &&
    Number.isFinite(Number(app.state.score)),
  );
}

async function submitTournamentAbandon() {
  if (_tournamentAbandonSent) return;
  if (!isTournamentRunInProgress()) return;
  _tournamentAbandonSent = true;
  const proof = runProof;
  const result = buildTournamentResultFromState(app.state);
  if (!result || Number(result.score) < 0) return;
  persistTournamentRecovery({ pendingResult: result, abandoned: true });
  try {
    await submitTournamentRun(proof.runId, result, proof.actions, {
      abandoned: true,
      clientSessionId: tournamentClientSessionId,
    });
    clearTournamentRecovery(proof);
  } catch (error) {
    if (isTournamentSessionConflictError(error)) {
      console.info("[tournament] abandon ignored for an inactive tab session");
      return;
    }
    if (isTournamentTerminalSubmissionError(error)) {
      clearTournamentRecovery(proof);
      console.info("[tournament] abandon submit closed:", tournamentSyncErrorCode(error));
    } else {
      console.error("[tournament] abandon submit failed:", error);
    }
  } finally {
    if (runProof === proof) clearRunProof();
    if (app.tournamentRunProof === proof) app.tournamentRunProof = null;
  }
}

// One color reached T4 during a soft-endless run. Celebrate in place (no screen
// change). The actual run result is recorded only when moves run out.
function recordEndlessT4(nextState, colorId) {
  void nextState;
  void colorId;
  celebrateEndlessT4();
}

// In-place T4 flash on the game frame + a celebratory sound/buzz, without leaving
// the board. Restarts the animation if it fires twice in a row.
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
  // A timer can expire in the middle of an animation. Never let that in-flight
  // resolution revive the board after the authoritative tournament cutoff.
  if (tournamentTimeExpired && !nextState?.tournamentTimedOut) {
    render();
    return;
  }
  const wasVictory = app.state?.victory;
  const prevTiers = app.state?.evolutionTiers ?? {};
  app.state = nextState;
  if (runProof?.tournament && !nextState?.gameOver && !nextState?.victory) {
    scheduleTournamentDraftSync();
  }
  // Soft-endless: each color that newly reaches T4 this step celebrates in place
  // and continues the same run. Leaderboard/result submit happens only at gameOver.
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
    if (app.authState.user) {
      fetchUserProgress()
        .then((remote) => {
          applyRemoteProgress(remote);
          if (app.currentScreen === "victory") renderVictoryScreen(app.state);
        })
        .catch(() => {});
    }
  } else if (nextState?.gameOver) {
    // Endless run ended (moves = 0). Fold this run into the lifetime badge store
    // exactly once and capture the summary the end screen renders.
    if (runProof?.tournament) {
      lastRunSummary = {
        score: nextState.score,
        movesUsed: nextState.movesUsed ?? 0,
        maxCombo: nextState.runMaxCombo ?? 0,
        specials: nextState.runSpecials ?? { cross: 0, bomb: 0 },
        newBadges: [],
        capsulesEarned: 0,
        bonusCapsules: 0,
        ascendedCount: ascendedLineageCount(app.progress),
        blupetsCount: collectionTileCount(app.progress),
      };
    } else if (nextState.endlessRun) {
      const reachedForms = [];
      for (const color of COLORS) {
        const tier = nextState.evolutionTiers?.[color.id] ?? 1;
        for (let formTier = 2; formTier <= Math.min(4, tier); formTier += 1) {
          const key =
            nextState.evolutionChoices?.[color.id]?.[formTier] ??
            getChosenEvolutionForm(nextState, color.id, formTier)?.key ??
            (formTier === tier ? activeBadgeFormKey(nextState, color.id) : null);
          if (key) reachedForms.push({ key, tier: formTier });
        }
      }
      const foldArgs = {
        score: nextState.score,
        reachedForms,
        maxCombo: nextState.runMaxCombo ?? 0,
        specials: nextState.runSpecials ?? { cross: 0, bomb: 0 },
        tileClears: nextState.runTileClears ?? {},
      };
      if (app.authState.user) {
        const fold = foldRun(app.progress, foldArgs);
        lastRunSummary = {
          score: nextState.score,
          movesUsed: nextState.movesUsed ?? 0,
          maxCombo: nextState.runMaxCombo ?? 0,
          specials: nextState.runSpecials ?? { cross: 0, bomb: 0 },
          newBadges: fold.newBadges,
          capsulesEarned: fold.capsulesEarned ?? 0,
          bonusCapsules: fold.newBadges.reduce((sum, badge) => sum + (Number(badge.capsules) || 0), 0),
          ascendedCount: ascendedLineageCount(app.progress),
          blupetsCount: collectionTileCount(app.progress),
        };
        updateProfileChip();
        persistProgress();
      } else {
        // Guest: stash the run so it can be applied if they sign in now.
        const best = getBestRunForm(nextState);
        const gColorId = best.colorId ?? getLeaderColorId(nextState) ?? "blue";
        const gPartnerColorId = best.partnerColorId ?? gColorId;
        pendingGuestRun = {
          runProof: runProof ? { runId: runProof.runId, actions: [...runProof.actions] } : null,
          foldArgs,
          score: nextState.score,
          movesUsed: nextState.movesUsed ?? 0,
          maxCombo: nextState.runMaxCombo ?? 0,
          specials: nextState.runSpecials ?? { cross: 0, bomb: 0 },
          questMatches: pendingGuestQuestMatches,
          leaderResult: {
            score: nextState.score,
            movesUsed: nextState.movesUsed ?? 0,
            formKey: best.formKey ?? "RUN_COMPLETE",
            formName: best.formName ?? best.name ?? "Run Complete",
            colorId: gColorId,
            partnerColorId: gPartnerColorId,
            vibe: nextState.vibe?.id ?? null,
          },
          familyBadges: collectionFamilySnapshot(app.progress),
          blupetsCount: collectionTileCount(app.progress),
        };
      }
    }
    submitRunToLeaderboard(nextState);
    setScreen("gameover");
  }
  render();
}

// Desktop COMBO card: shows the SCORE multiplier this swap earned — the same
// cascade-depth value from game.js comboMultiplier (×1 per single match, +1 per
// cascade step, capped at ×4) that the score is actually multiplied by, and the
// same number the "Combo ×N" popup escalates to. ×1 reads as a dash. Resets on
// the next swap. Hidden on mobile via CSS, so this is a no-op there.
function setComboDisplay(level) {
  const el = elements.comboValue;
  if (!el) return;
  const pill = el.closest(".stat-pill--combo");
  if (level && level >= 2) {
    el.textContent = "×" + level;
    if (pill) {
      pill.classList.remove("is-active");
      requestAnimationFrame(() => pill.classList.add("is-active"));
    }
  } else {
    el.textContent = "—";
    if (pill) pill.classList.remove("is-active");
  }
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
  shell.classList.toggle("is-cascade-active", app.isAnimating);
}

// One-shot board flinch when a match clears. Restart the CSS animation by
// removing the class, forcing a reflow, then re-adding it.
function pulseBoardImpact() {
  const shell = elements.boardShell;
  if (!shell) {
    return;
  }
  shell.classList.remove("is-impact");
  // rAF lets the removal paint before re-adding, avoiding a forced layout read.
  requestAnimationFrame(() => shell.classList.add("is-impact"));
}

function isMobilePopupLayout() {
  return window.matchMedia?.("(max-width: 699px)")?.matches ?? window.innerWidth < 700;
}

function syncMobilePerfMode() {
  document.body.classList.toggle("mobile-perf-mode", isMobilePopupLayout());
}

function getMobileFxTopCenter() {
  const boardRect = elements.board?.getBoundingClientRect();
  if (boardRect?.width && boardRect?.height) {
    const inset = Math.max(28, Math.min(boardRect.height * 0.11, 44));
    return {
      x: boardRect.left + boardRect.width / 2,
      y: boardRect.top + inset,
    };
  }
  const viewportTop = Math.max(96, Math.min(window.innerHeight * 0.22, 148));
  return {
    x: window.innerWidth / 2,
    y: viewportTop,
  };
}

// Floating "Combo ×N" popup over the board during a cascade chain.
function spawnComboPopup(text, level) {
  const layer = elements.fxLayer;
  const shell = elements.boardShell;
  if (!layer || !shell) {
    return;
  }
  const el = document.createElement("div");
  el.className = "fx-combo";
  el.textContent = text;
  const lift = Math.min(level, 5) * 7;
  if (isMobilePopupLayout()) {
    const pos = getMobileFxTopCenter();
    el.style.position = "fixed";
    el.style.zIndex = "260";
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
  } else {
    el.style.setProperty("--fx-x", `${50 + (level % 2 ? 7 : -7)}%`);
    el.style.setProperty("--fx-y", `${48 - lift}%`);
  }
  el.style.setProperty("--fx-lift", `${Math.max(28, lift + 26)}px`);
  el.style.setProperty("--fx-lift-mid", `${Math.max(14, Math.round((lift + 26) * 0.48))}px`);
  el.style.setProperty("--fx-hue", String(Math.max(0, 46 - level * 9)));
  (isMobilePopupLayout() ? document.body : layer).appendChild(el);
  window.setTimeout(() => el.remove(), 1150);
}

function spawnSaraiHeartPopup(message, complete = false) {
  const layer = elements.fxLayer;
  const shell = elements.boardShell;
  const board = elements.board;
  if (!layer || !shell || !board) {
    showToast(message);
    return;
  }

  const shellRect = _cachedShellRect ?? shell.getBoundingClientRect();
  const boardRect = _cachedBoardRect ?? board.getBoundingClientRect();
  const fixedToViewport = isMobilePopupLayout();
  const saraiMobilePos = fixedToViewport && boardRect.width && boardRect.height
    ? {
      x: boardRect.left + boardRect.width / 2,
      y: boardRect.top + Math.max(56, Math.min(boardRect.height * 0.18, 76)),
    }
    : null;
  const mobilePos = fixedToViewport ? saraiMobilePos ?? getMobileFxTopCenter() : null;
  const x = mobilePos?.x ?? (boardRect.width
    ? (boardRect.left - shellRect.left) + boardRect.width / 2
    : shellRect.width / 2);
  const y = mobilePos?.y ?? (boardRect.height
    ? (boardRect.top - shellRect.top) + boardRect.height * (complete ? 0.36 : 0.42)
    : shellRect.height / 2);

  const el = document.createElement("div");
  el.className = `fx-sarai-heart${complete ? " is-complete" : ""}${fixedToViewport ? " is-mobile" : ""}`;
  if (fixedToViewport) {
    el.style.position = "fixed";
    el.style.zIndex = "260";
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = `
    <img class="fx-sarai-heart-icon" src="${SARAI_HEART_ASSET}" alt="" aria-hidden="true" />
    <span class="fx-sarai-heart-text">${escapeHtml(message)}</span>
  `;
  (fixedToViewport ? document.body : layer).appendChild(el);
  window.setTimeout(() => el.remove(), complete ? 1800 : 1400);
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
    elements.profileChipAvatar.src = safeImgSrc(app.authState.avatarUrl) || "./assets/blu-logo.png";
  }
  if (elements.profileChip) {
    elements.profileChip.classList.toggle("is-signed-in", Boolean(app.authState.user));
  }
  if (elements.profileChipCount) {
    elements.profileChipCount.textContent = `${collectionTileCount(app.progress)}/${TOTAL_INVENTORY_FORMS}`;
  }
}

function renderAuth() {
  if (!elements.authPanel) {
    return;
  }

  const configured = app.authState.configured;
  const signedIn = Boolean(app.authState.user);
  if (signedIn) {
    authModalForced = false;
    authModalDismissed = false;
  }
  elements.authPanel.classList.toggle("is-configured", configured);
  elements.authPanel.classList.toggle("is-signed-in", signedIn);
  elements.authPanel.classList.toggle("has-error", Boolean(app.authState.error));

  if (elements.authActions) {
    elements.authActions.hidden = signedIn;
  }
  if (elements.authEmailForm) {
    elements.authEmailForm.hidden = signedIn;
  }
  if (elements.authEmailTabs) {
    elements.authEmailTabs.hidden = signedIn;
    for (const tab of elements.authEmailTabs.querySelectorAll(".auth-tab")) {
      tab.classList.toggle("is-active", tab.dataset.authTab === _authTab);
    }
  }
  if (elements.authPasswordConfirmInput) {
    elements.authPasswordConfirmInput.hidden = _authTab !== "signup";
  }
  if (elements.authEmailSubmitBtn) {
    elements.authEmailSubmitBtn.textContent = _authTab === "signup" ? "Sign up" : "Sign in";
  }
  if (elements.authEmailError) {
    elements.authEmailError.hidden = true;
    elements.authEmailError.textContent = "";
  }
  if (elements.authUser) {
    elements.authUser.hidden = !signedIn;
  }
  if (elements.authLogoutBtn) {
    elements.authLogoutBtn.hidden = !signedIn;
  }

  if (elements.authName) {
    elements.authName.textContent = signedIn ? shortAuthLabel(app.authState.label) : "";
  }
  if (elements.authAvatar) {
    elements.authAvatar.style.backgroundImage = safeCssUrl(app.authState.avatarUrl);
  }

  const disabled = app.authState.loading || !configured;
  for (const button of [elements.authGoogleBtn, elements.authTwitterBtn]) {
    if (button) {
      button.disabled = disabled;
    }
  }
  if (elements.authLogoutBtn) {
    elements.authLogoutBtn.disabled = app.authState.loading || !configured;
  }

  if (elements.authStatus) {
    elements.authStatus.textContent = !configured
      ? "Auth config missing"
      : app.authState.loading
        ? "Checking login..."
        : app.authState.error
          ? app.authState.error
          : signedIn
            ? "Signed in"
            : "";
  }

  renderAuthModal();
  renderProfile();
  updateProfileChip();
}

function renderAuthModal() {
  if (!elements.authModal) {
    return;
  }

  const open = authModalForced;
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
  _authTab = "signin";
  renderAuth();
}

function closeAuthModal({ dismiss = false } = {}) {
  authModalForced = false;
  authModalDismissed = dismiss ? true : authModalDismissed;
  // User bailed on the auth prompt — drop any queued post-sign-in action (e.g.
  // "open Lobby") so it doesn't fire on some later, unrelated sign-in.
  if (dismiss) consumeAfterAuthAction();
  renderAuthModal();
}

function renderProfile() {
  if (!elements.profileScreen) {
    return;
  }

  const signedIn = Boolean(app.authState.user);
  const section =
    profileTab === "quests" ? "quests" :
    profileTab === "account" ? "account" :
    profileTab === "capsules" ? "capsules" :
    "collection";
  elements.profileScreen.dataset.section = section;
  if (elements.profileAvatar) {
    elements.profileAvatar.style.backgroundImage = safeCssUrl(app.authState.avatarUrl);
    elements.profileAvatar.hidden = section !== "account";
  }
  if (elements.profileName) {
    elements.profileName.textContent =
      section === "collection" ? "Collection" :
      section === "capsules" ? "Blupets" :
      section === "quests" ? "Quests" :
      signedIn ? shortAuthLabel(app.authState.label) : "Guest";
  }
  if (elements.profileStatus) {
    elements.profileStatus.hidden = false;
    elements.profileStatus.textContent =
      section === "collection"
        ? `${collectionTileCount(app.progress)}/${TOTAL_INVENTORY_FORMS} Blupets opened`
        : section === "capsules"
          ? `${Math.max(0, Math.floor(Number(app.progress.capsules) || 0))} reveals ready, ${Math.max(0, Math.floor(Number(app.progress.shards) || 0))}/${SHARDS_PER_CAPSULE} shards`
        : section === "quests"
          ? `${questCompletionSummary().label} quests complete`
          : signedIn ? "Cloud profile connected" : "Local guest profile";
  }
  if (elements.profileLogoutBtn) {
    elements.profileLogoutBtn.hidden = section !== "account" || !signedIn;
    elements.profileLogoutBtn.disabled = app.authState.loading || !app.authState.configured || !signedIn;
  }
  if (elements.profileSignInBtn) {
    elements.profileSignInBtn.hidden = section !== "account" || signedIn;
    elements.profileSignInBtn.disabled = app.authState.loading || !app.authState.configured;
  }
  if (elements.profileContent) {
    elements.profileContent.innerHTML =
      section === "quests" ? renderQuestsSection() :
      section === "account" ? renderAccountSection() :
      section === "capsules" ? renderCapsulesSection() :
      renderCollectionGrid();
  }
  if (elements.profileScreen) {
    const stats = elements.profileScreen.querySelector(".profile-section-head");
    if (stats) {
      let statsBlock = elements.profileScreen.querySelector(".profile-stats");
      if (!statsBlock) {
        statsBlock = document.createElement("div");
        statsBlock.className = "profile-stats";
        stats.after(statsBlock);
      }
      statsBlock.hidden = section !== "quests";
      statsBlock.innerHTML = section === "quests" ? renderQuestStatsHeader() : "";
    }
  }
  renderMetaNav(elements.profileMetaNav, section);
}

async function initializeAuth() {
  renderAuth();
  app.authState = await initAuth({
    onChange(nextState) {
      const prevUser = app.authState.user;
      app.authState = { ...app.authState, ...nextState, loading: false };
      if (prevUser?.id !== app.authState.user?.id) {
        setProgressUser(app.authState.user?.id ?? null);
        app.progress = loadProgress();
        if (app.authState.user) {
          fetchUserProgress()
            .then(applyRemoteProgress)
            .then(refreshEventState)
            .catch(() => {})
            .then(() => {
              applyPendingGuestRun();
              syncCollectionLeaderboard();
              render();
            });
        } else {
          resetEventStore();
          renderEventUi();
        }
      }
      renderAuth();
      render();
      if (!prevUser && app.authState.user) {
        const returnTo = consumeReturnTo();
        if (returnTo === "game") startRun();
        if (consumeAfterAuthAction() === "lobby") enterTournament();
      }
      handleInviteDeepLink();
      maybeResumeSavedTournament();
    },
  });
  app.authState.loading = false;
  setProgressUser(app.authState.user?.id ?? null);
  app.progress = loadProgress();
  renderAuth();
  renderAuthModal();
  if (app.authState.user) {
    fetchUserProgress()
      .then(applyRemoteProgress)
      .then(refreshEventState)
      .catch(() => {})
      .then(() => {
        applyPendingGuestRun();
        syncCollectionLeaderboard();
        render();
      });
  }
  // Clean up OAuth fragment/code now that Supabase has consumed the tokens.
  if (/access_token|error_description/.test(location.hash) || new URLSearchParams(location.search).has("code")) {
    history.replaceState({ screen: "start" }, "", location.pathname);
  }
  if (app.authState.user) {
    const returnTo = consumeReturnTo();
    // After OAuth redirect: return to where the user was (game -> start a new run).
    if (returnTo === "game") startRun();
    if (consumeAfterAuthAction() === "lobby") enterTournament();
  }
  // Invite deep-link: open the room for a signed-in visitor, or gate a guest
  // behind the auth modal. (onChange also calls this; the latch dedupes.)
  handleInviteDeepLink();
  maybeResumeSavedTournament();
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

// A one-shot action to run right after a guest signs in (e.g. "open the Lobby
// modal"). Kept separate from `blupets_return` because the OAuth path overwrites
// that key with the current screen; this survives an OAuth reload (10-min expiry)
// and also fires immediately on an in-page username/password sign-in.
const AFTER_AUTH_KEY = "blupets_after_auth";
function setAfterAuthAction(action) {
  try { localStorage.setItem(AFTER_AUTH_KEY, JSON.stringify({ v: action, exp: Date.now() + 600_000 })); } catch {}
}
function consumeAfterAuthAction() {
  try {
    const raw = localStorage.getItem(AFTER_AUTH_KEY);
    localStorage.removeItem(AFTER_AUTH_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw);
    return item.exp && Date.now() < item.exp ? item.v : null;
  } catch { return null; }
}

// Invite deep-link gate. When the page was opened via `/t/CODE`
// (`_initialTournamentCode` set), route based on auth state ONCE it's known:
//   • signed-in  → drop straight into that lobby room and retain `/t/CODE`;
//   • guest      → force the auth modal first, then open the room the moment
//                  they sign in (this fn is re-run from the auth onChange).
// The `_inviteHandled` latch fires the room-open exactly once even though both
// the initial auth resolve and onChange call this. Survives the OAuth reload
// because the code is re-parsed from the still-present `/t/CODE` pathname.
let _inviteHandled = false;
let _tournamentRecoveryOpened = false;
function handleInviteDeepLink() {
  if (_inviteHandled || !_initialTournamentCode || app.authState.loading) return;
  if (app.authState.user) {
    _inviteHandled = true;
    openTournamentRoom(_initialTournamentCode);
  } else {
    openAuthModal({ force: true });
  }
}

function maybeResumeSavedTournament() {
  if (_tournamentRecoveryOpened || _initialTournamentCode || !app.authState.user) return;
  const saved = readTournamentRecovery({ userId: app.authState.user.id });
  if (!saved) return;
  _tournamentRecoveryOpened = true;
  openTournamentRoom(saved.code);
}

async function handleAuthProvider(provider) {
  app.authState = { ...app.authState, loading: true, error: "" };
  renderAuth();
  // Save where the user was so we can return after the OAuth redirect reloads the page.
  // localStorage survives tab kills on mobile (sessionStorage does not).
  const _returnPayload = JSON.stringify({ v: lastScreenBeforeProfile || app.currentScreen, exp: Date.now() + 600_000 });
  try { localStorage.setItem("blupets_return", _returnPayload); } catch {}
  // Persist any in-progress guest run so it can be applied after the OAuth reload.
  if (pendingGuestRun) {
    try {
      const payload = JSON.stringify({
        v: { run: pendingGuestRun, questMatches: pendingGuestQuestMatches },
        exp: Date.now() + 600_000,
      });
      localStorage.setItem("blupets_pending_run", payload);
    } catch {}
  }
  try {
    await signInWithProvider(provider);
  } catch (error) {
    app.authState = {
      ...app.authState,
      loading: false,
      error: error?.message || "Sign in failed.",
    };
    renderAuth();
    showToast(app.authState.error);
  }
}

function setAuthError(msg) {
  if (elements.authEmailError) {
    elements.authEmailError.textContent = msg;
    elements.authEmailError.hidden = !msg;
  }
}

async function handleAuthEmailPassword(event) {
  event.preventDefault();
  const username = elements.authUsernameInput?.value?.trim() ?? "";
  const password = elements.authPasswordInput?.value ?? "";
  if (!username) { setAuthError("Enter a username."); return; }
  if (!password) { setAuthError("Enter a password."); return; }
  if (_authTab === "signup") {
    const confirm = elements.authPasswordConfirmInput?.value ?? "";
    if (password !== confirm) { setAuthError("Passwords do not match."); return; }
    if (password.length < 6) { setAuthError("Password must be at least 6 characters."); return; }
  }
  setAuthError("");
  app.authState = { ...app.authState, loading: true, error: "" };
  renderAuth();
  if (pendingGuestRun) {
    try {
      localStorage.setItem("blupets_pending_run", JSON.stringify({
        v: { run: pendingGuestRun, questMatches: pendingGuestQuestMatches },
        exp: Date.now() + 600_000,
      }));
    } catch {}
  }
  try {
    if (_authTab === "signup") {
      await signUpWithUsername(username, password);
    } else {
      await signInWithUsername(username, password);
    }
    app.authState = { ...app.authState, loading: false };
    renderAuth();
  } catch (error) {
    app.authState = { ...app.authState, loading: false };
    const raw = error?.message || "";
    const alreadyTaken = _authTab === "signup" &&
      (raw.toLowerCase().includes("already registered") || raw.toLowerCase().includes("already exists"));
    const msg = alreadyTaken ? "That username is already taken." : (raw || (_authTab === "signup" ? "Sign up failed." : "Sign in failed."));
    setAuthError(msg);
    renderAuth();
  }
}

function handleAuthTabSwitch(event) {
  const tab = event.target.closest("[data-auth-tab]");
  if (!tab) return;
  _authTab = tab.dataset.authTab;
  setAuthError("");
  renderAuth();
}

function handleAuthSkip() {
  closeAuthModal({ dismiss: true });
}

async function handleAuthLogout() {
  app.authState = { ...app.authState, loading: true, error: "" };
  renderAuth();
  try {
    await signOut();
    app.authState = {
      ...app.authState,
      loading: false,
      user: null,
      label: "",
      avatarUrl: "",
    };
    setProgressUser(null);
    app.progress = loadProgress();
    authModalDismissed = true;  // don't pop auth modal immediately after sign-out
    setScreen("start");
    render();
  } catch (error) {
    app.authState = {
      ...app.authState,
      loading: false,
      error: error?.message || "Sign out failed.",
    };
    renderAuth();
    showToast(app.authState.error);
  }
}

async function handleAvatarFileChange(file) {
  if (!app.authState.user) return;
  if (file.size > 2 * 1024 * 1024) { showToast("Image too large (max 2MB)."); return; }
  showToast("Uploading avatar…");
  try {
    const url = await uploadAvatar(file, app.authState.user.id);
    await updateAvatarUrl(url);
    syncProfile({ avatarUrl: url }).catch(() => {});
    showToast("Avatar updated!");
  } catch (err) {
    showToast(err?.message || "Failed to upload avatar.");
  }
}

function showUsernameEditInline(container) {
  const row = container?.querySelector(".account-name-row");
  if (!row) return;
  const current = app.authState.label || "";
  row.innerHTML = `
    <input class="profile-name-input" id="inlineNameInput" type="text" value="${escapeHtml(current)}" maxlength="32" autocomplete="off" />
    <button class="btn btn--primary btn--xs" type="button" data-account-action="save-name">Save</button>
    <button class="btn btn--ghost btn--xs" type="button" data-account-action="cancel-name">✕</button>
  `;
  row.querySelector("#inlineNameInput")?.focus();
}

async function handleUsernameSaveInline(container) {
  const input = container?.querySelector("#inlineNameInput");
  const name = input?.value?.trim() ?? "";
  if (!name) { showToast("Name cannot be empty."); return; }
  try {
    // Check uniqueness server-side before touching auth metadata.
    // syncProfile throws with error code "name_taken" if another player owns this name.
    await syncProfile({ name });
    await updateDisplayName(name);
    showToast("Username updated!");
  } catch (error) {
    if (error?.message === "name_taken") {
      showToast("That username is already taken.");
    } else {
      showToast(error?.message || "Failed to update username.");
    }
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
    if (app.currentScreen === "start" || app.currentScreen === "game") {
      startMusic();
    }
  }
}

async function shareVictory() {
  unlockAudio();
  sfx("ui");

  const data = victoryShareData ?? buildShareDataFromState(app.state);
  const form = data?.formName ?? "an apex form";
  const score = data?.score ?? 0;
  const url = `${window.location.origin}${window.location.pathname}`;
  const text = `Merged to ${form} and scored ${Number(score).toLocaleString("en-US")} in Blupets Match. Collection: ${data?.forms ?? ""} Blupets. Play: ${url}`;

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
    const copied = await copyShareText(text);
    showToast(copied ? "Card saved — caption copied!" : "Card saved — share it anywhere!");
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
    await navigator.clipboard.writeText(text);
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
    title: "ASCENDED!",
    formName: stateLike.victoryMeta.formName,
    pair: `${color.label} + ${partner.label}`,
    subtitle: `Merged to ${stateLike.victoryMeta.formName}`,
    accent: color.hex,
    accent2: partner.hex,
    score: stateLike.score,
    forms: `${collectedFormsCount()}/${TOTAL_APEX_FORMS}`,
    reward: VICTORY_REWARD,
    art: getChosenEvolutionForm(stateLike, stateLike.victoryMeta.colorId, 4)?.asset ?? "./assets/blu-logo.png",
  };
}

function buildRunShareData(summary, stateLike) {
  const bestForm = getBestRunForm(stateLike);
  return {
    title: "RUN COMPLETE",
    formName: bestForm.name,
    subtitle: `Merged to ${bestForm.name}`,
    accent: getColor(bestForm.colorId ?? "cyan")?.hex ?? "#68d8ff",
    accent2: "#ff9be8",
    score: summary.score,
    forms: `${summary.blupetsCount ?? collectionTileCount(app.progress)}/${TOTAL_INVENTORY_FORMS}`,
    art: bestForm.asset,
  };
}

function clearHintJitter() {
  elements.board
    ?.querySelectorAll(".tile.hint-jitter")
    .forEach((el) => el.classList.remove("hint-jitter"));
}

function clearIdleMicro() {
  elements.board
    ?.querySelectorAll(".tile.idle-blink, .tile.idle-bob")
    .forEach((el) => el.classList.remove("idle-blink", "idle-bob"));
}

function canShowHints() {
  return canInteractWithBoard() && !app.selectedTile && !dragState;
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
      app.state.board,
      app.state.diagonalAssist,
      getStateMatchResolver(app.state),
      app.state.diagonalSwaps,
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

function scheduleIdleMicro(delay = IDLE_MIN_GAP_MS + Math.random() * IDLE_JITTER_MS) {
  if (idleTimer !== null) return;
  idleTimer = window.setTimeout(idleMicroTick, delay);
}

function idleMicroTick() {
  idleTimer = null;
  clearIdleMicro();

  if (!canShowHints()) {
    scheduleIdleMicro(1200);
    return;
  }

  const tiles = [
    ...elements.board.querySelectorAll(
      ".tile:not(.tile--empty):not(.tile--ghost):not(.is-swapping):not(.is-falling):not(.clearing)",
    ),
  ];
  if (tiles.length === 0) {
    scheduleIdleMicro(1200);
    return;
  }

  const count = Math.random() < 0.82 ? 1 : 2;
  for (let i = 0; i < count && tiles.length > 0; i += 1) {
    const index = Math.floor(Math.random() * tiles.length);
    const tile = tiles.splice(index, 1)[0];
    tile.classList.add(Math.random() < 0.58 ? "idle-blink" : "idle-bob");
  }

  window.setTimeout(() => {
    clearIdleMicro();
    scheduleIdleMicro();
  }, IDLE_MICRO_MS);
}

function syncIdleLoop() {
  scheduleIdleMicro();
}

function clearBoardDom() {
  for (const el of _boardTileEls.values()) el.remove();
  _boardTileEls.clear();
  for (const el of _boardGhostMap.values()) el.remove();
  _boardGhostMap.clear();
}

function patchBoard(stateLike) {
  const boardState = boardAnimation.board ?? stateLike.board;
  const blocked =
    app.isAnimating ||
    stateLike.pendingEvolutionQueue.length > 0 ||
    stateLike.victory ||
    stateLike.gameOver;

  elements.board.classList.toggle("blocked", blocked);

  boardState.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      const key = cellKey(rowIndex, colIndex);
      let el = _boardTileEls.get(key);

      if (!tile) {
        // Want an empty span — replace button if type changed
        if (el && el.tagName !== "SPAN") {
          el.remove();
          el = null;
          _boardTileEls.delete(key);
        }
        if (!el) {
          const span = document.createElement("span");
          span.className = "tile tile--empty";
          span.dataset.row = rowIndex;
          span.dataset.col = colIndex;
          span.setAttribute("aria-hidden", "true");
          span.style.cssText = `grid-row:${rowIndex + 1}; grid-column:${colIndex + 1};`;
          elements.board.appendChild(span);
          _boardTileEls.set(key, span);
        }
        return;
      }

      const color = getColor(tile.color);
      const tier = stateLike.evolutionTiers[tile.color];
      const pos = { row: rowIndex, col: colIndex };
      const isSelected = sameTile(app.selectedTile, pos) || sameTile(dragState?.originTile, pos);
      const isDragTarget = sameTile(dragState?.currentTile, pos);
      const isActive = boardAnimation.activeCells.has(key);
      const isSettling = boardAnimation.settlingCells.has(key);
      const animationClass = isActive && boardAnimation.phase ? `is-${boardAnimation.phase}` : "";
      const swapVector = isActive ? boardAnimation.swapVectors?.[key] : null;

      // Replace empty span with button if tile became non-null
      if (el && el.tagName !== "BUTTON") {
        el.remove();
        el = null;
        _boardTileEls.delete(key);
      }

      let created = false;
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.dataset.row = rowIndex;
        el.dataset.col = colIndex;
        // Static per-cell style (grid position + delay never change)
        el.style.cssText = `grid-row:${rowIndex + 1}; grid-column:${colIndex + 1}; --tile-accent:${color.hex}; --tile-delay:${rowIndex * 8 + colIndex * 3}ms; color:${color.hex};`;
        const img = document.createElement("img");
        img.className = "tile-art";
        img.alt = "";
        // Decode off the main thread. Without this, the first evolution swaps a
        // tile's src to an as-yet-undecoded higher-tier sprite, and the browser
        // decodes it synchronously before the next paint — a visible hitch.
        img.decoding = "async";
        img.src = getBlockAsset(tile.color, stateLike);
        el.appendChild(img);
        elements.board.appendChild(el);
        _boardTileEls.set(key, el);
        created = true;
      }

      // Build desired className
      const classParts = ["tile"];
      if (isSelected) classParts.push("selected");
      if (isDragTarget) classParts.push("drag-target");
      if (animationClass) classParts.push(animationClass);
      if (tier > 1) classParts.push("evolved");
      if (isSettling) classParts.push("is-settling");
      if (tile.special) { classParts.push("tile--special"); classParts.push(`tile--${tile.special}`); }
      const desiredClass = classParts.join(" ");
      if (el.className !== desiredClass) el.className = desiredClass;

      // Update data-tier
      if (tier > 1) {
        if (el.dataset.tier !== `T${tier}`) el.dataset.tier = `T${tier}`;
      } else {
        if (el.dataset.tier) delete el.dataset.tier;
      }

      // Update aria
      const powerLabel = tile.special === "cross" ? " (cross power-up)" : tile.special === "bomb" ? " (bomb power-up)" : "";
      const ariaLabel = `${color.label} tile${powerLabel}`;
      if (el.getAttribute("aria-label") !== ariaLabel) el.setAttribute("aria-label", ariaLabel);
      const ariaSelected = isSelected ? "true" : "false";
      if (el.getAttribute("aria-selected") !== ariaSelected) el.setAttribute("aria-selected", ariaSelected);

      // Update dynamic style (color/accent change on evolution; swap vectors change during anim)
      if (!created) {
        const curAccent = el.style.getPropertyValue("--tile-accent");
        if (curAccent !== color.hex) {
          el.style.setProperty("--tile-accent", color.hex);
          el.style.color = color.hex;
        }
      }
      if (swapVector) {
        el.style.setProperty("--swap-dx", `${swapVector.dx}`);
        el.style.setProperty("--swap-dy", `${swapVector.dy}`);
      } else {
        el.style.removeProperty("--swap-dx");
        el.style.removeProperty("--swap-dy");
      }

      // Update img src (evolves when tier changes)
      const img = el.querySelector("img.tile-art");
      if (img) {
        const wantSrc = getBlockAsset(tile.color, stateLike);
        if (img.getAttribute("src") !== wantSrc) img.src = wantSrc;
      }

      // Sync power overlay
      let power = el.querySelector(".tile-power");
      if (tile.special) {
        if (!power) {
          power = document.createElement("span");
          power.setAttribute("aria-hidden", "true");
          el.appendChild(power);
        }
        const wantPowerClass = `tile-power tile-power--${tile.special}`;
        if (power.className !== wantPowerClass) power.className = wantPowerClass;
        let powerImg = power.querySelector("img");
        if (!powerImg) {
          power.textContent = "";
          powerImg = document.createElement("img");
          powerImg.alt = "";
          powerImg.decoding = "async";
          power.appendChild(powerImg);
        }
        const wantPowerSrc = SPECIAL_TILE_ASSETS[tile.special] ?? "";
        if (powerImg.getAttribute("src") !== wantPowerSrc) {
          powerImg.src = wantPowerSrc;
        }
        const wantDir = tile.dir ?? "";
        if (power.dataset.dir !== wantDir) power.dataset.dir = wantDir;
      } else if (power) {
        power.remove();
      }
    });
  });

  // Patch ghost elements — keep existing ones alive (preserves clearing animation)
  const wantGhostKeys = new Set(boardAnimation.clearingGhosts.map((g) => `${g.row}:${g.col}`));
  for (const [k, el] of _boardGhostMap) {
    if (!wantGhostKeys.has(k)) { el.remove(); _boardGhostMap.delete(k); }
  }
  for (const ghost of boardAnimation.clearingGhosts) {
    const k = `${ghost.row}:${ghost.col}`;
    if (_boardGhostMap.has(k)) continue;
    const color = getColor(ghost.color);
    const span = document.createElement("span");
    span.className = "tile tile--ghost clearing";
    span.dataset.row = ghost.row;
    span.dataset.col = ghost.col;
    span.setAttribute("aria-hidden", "true");
    span.style.cssText = `--tile-accent:${color.hex}; --tile-delay:0ms; color:${color.hex}; grid-row:${ghost.row + 1}; grid-column:${ghost.col + 1};`;
    const img = document.createElement("img");
    img.className = "tile-art";
    img.alt = "";
    img.decoding = "async";
    img.src = getBlockAsset(ghost.color, stateLike);
    span.appendChild(img);
    const burst = document.createElement("span");
    burst.className = "tile-burst";
    burst.setAttribute("aria-hidden", "true");
    burst.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>";
    span.appendChild(burst);
    elements.board.appendChild(span);
    _boardGhostMap.set(k, span);
  }
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
  // Cache geometry so fx popups can position themselves without forcing a
  // layout read at spawn time (getBoundingClientRect() triggers style flush).
  _cachedBoardRect = elements.board.getBoundingClientRect();
  _cachedShellRect = elements.boardShell ? elements.boardShell.getBoundingClientRect() : null;
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
  while (app.state && !app.isAnimating && app.state.pendingEvolutionQueue.length > 0) {
    const queueItem = app.state.pendingEvolutionQueue[0];
    if (queueItem.step !== "form") {
      break;
    }

    // Never auto-resolve the final tier: completing the form must be an explicit
    // player choice, even for fallback families with a single synthetic form.
    if (queueItem.tier >= 4) {
      break;
    }

    const selection = getEvolutionFormSelection(app.state, queueItem.colorId, queueItem.tier);
    if (!selection.autoSelectFallback) {
      break;
    }

    app.state = selectEvolutionForm(
      app.state,
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
let _gameModalFocusFrame = null;
let _renderedGameModalKey = "";
function syncGameModalFocus(which) {
  if (which === _openGameModal) return;
  _openGameModal = which;
  if (_gameModalFocusFrame !== null) {
    cancelAnimationFrame(_gameModalFocusFrame);
    _gameModalFocusFrame = null;
  }
  document.body.classList.toggle("modal-open", Boolean(which));
  if (_gameModalKeyHandler) {
    document.removeEventListener("keydown", _gameModalKeyHandler, true);
    _gameModalKeyHandler = null;
  }
  if (!which) return;
  const modal = which === "partner" ? elements.modalPartner : elements.modalForm;
  if (!modal) return;
  const focusables = () => [...modal.querySelectorAll("button:not([disabled])")];
  _gameModalFocusFrame = requestAnimationFrame(() => {
    _gameModalFocusFrame = requestAnimationFrame(() => {
      _gameModalFocusFrame = null;
      if (_openGameModal === which && !modal.hidden) {
        focusables()[0]?.focus({ preventScroll: true });
      }
    });
  });
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
    app.currentScreen !== "game" ||
    app.isAnimating ||
    stateLike.pendingEvolutionQueue.length === 0 ||
    stateLike.victory ||
    stateLike.gameOver
  ) {
    elements.modalPartner.hidden = true;
    elements.modalForm.hidden = true;
    _renderedGameModalKey = "";
    syncGameModalFocus(null);
    return;
  }

  const queueItem = stateLike.pendingEvolutionQueue[0];
  const color = getColor(queueItem.colorId);

  if (queueItem.tier === 2 && queueItem.step !== "form") {
    const partnerOptions = getTopPartnerOptions(stateLike, queueItem.colorId, 3);
    const modalKey = `partner:${queueItem.colorId}:${queueItem.tier}:${partnerOptions
      .map((partner) => `${partner.id}:${stateLike.colorMatchCounts[partner.id]}`)
      .join("|")}`;
    elements.modalPartner.hidden = false;
    elements.modalForm.hidden = true;
    if (_renderedGameModalKey !== modalKey) {
      _renderedGameModalKey = modalKey;
      elements.partnerHeadline.replaceChildren();
      const colorLabel = document.createElement("span");
      colorLabel.className = "modal-color-label";
      colorLabel.style.setProperty("--modal-color", color.hex);
      colorLabel.textContent = color.label;
      elements.partnerHeadline.append(colorLabel, document.createTextNode(" is ready"));

      const fragment = document.createDocumentFragment();
      for (const partner of partnerOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "partner-card";
        button.dataset.colorId = queueItem.colorId;
        button.dataset.partnerId = partner.id;

        const dot = document.createElement("img");
        dot.className = "partner-dot";
        dot.src = getBaseBlockAsset(partner.id);
        dot.alt = "";
        dot.decoding = "async";

        const name = document.createElement("span");
        name.className = "partner-name";
        name.textContent = partner.label;

        const points = document.createElement("span");
        points.className = "partner-pts";
        points.textContent = `${stateLike.colorMatchCounts[partner.id]} pts`;

        button.append(dot, name, points);
        fragment.append(button);
      }
      elements.partnerOptions.replaceChildren(fragment);
    }
    syncGameModalFocus("partner");
    return;
  }

  const partnerColorId =
    stateLike.evolutionFusions[queueItem.colorId]?.partnerColorId ?? queueItem.colorId;
  const partner = getColor(partnerColorId);
  const selection = getEvolutionFormSelection(stateLike, queueItem.colorId, queueItem.tier);
  const modalKey = `form:${queueItem.colorId}:${queueItem.tier}:${partnerColorId}:${selection.options
    .map((form) => form.key)
    .join("|")}`;

  elements.modalPartner.hidden = true;
  elements.modalForm.hidden = false;
  if (_renderedGameModalKey !== modalKey) {
    _renderedGameModalKey = modalKey;
    elements.formHeadline.textContent = `${color.label} + ${partner.label} · T${queueItem.tier}`;
    const fragment = document.createDocumentFragment();
    for (const form of selection.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "form-card";
      button.dataset.colorId = queueItem.colorId;
      button.dataset.tier = `${queueItem.tier}`;
      button.dataset.formKey = form.key;

      const img = document.createElement("img");
      img.className = "form-img";
      img.src = form.asset ?? getBaseBlockAsset(queueItem.colorId);
      img.alt = "";
      img.decoding = "async";

      const name = document.createElement("span");
      name.className = "form-name";
      name.textContent = form.name;

      button.append(img, name);
      fragment.append(button);
    }
    elements.formOptions.replaceChildren(fragment);
  }
  syncGameModalFocus("form");
}

// The run-summary captured when the last endless run ended, rendered by the
// run-summary (gameover) screen. Null until a run ends this session.
let lastRunSummary = null;
// Guest run stored in memory so sign-in can retroactively apply it.
let pendingGuestRun = null;
let pendingGuestQuestMatches = 0;
let gameoverRevealResult = null;
let gameoverRevealBatch = [];
let gameoverRevealSeq = 0;
let capsuleRevealRequest = null;
let capsuleRevealTimer = null;

function capsuleResultRank(result) {
  const tierRank = { base: 1, advanced: 2, ascended: 3 };
  return (tierRank[result?.tier] ?? 0) * 10 + (result?.duplicate ? 0 : 1);
}

function bestCapsuleResult(results) {
  return [...results].sort((a, b) => capsuleResultRank(b) - capsuleResultRank(a))[0] ?? null;
}

function openCapsuleBatch(count) {
  const available = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  const target = Math.min(Math.max(1, Math.floor(Number(count) || 1)), available);
  const results = [];
  for (let i = 0; i < target; i += 1) {
    const result = openCapsule(app.progress);
    if (result.opened) results.push(result);
  }
  // Award capsules for collection milestones newly reached by these draws.
  checkMilestoneCapsules(app.progress);
  return results;
}

function capsuleRevealCount(requested) {
  const available = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  return Math.min(Math.max(1, Math.floor(Number(requested) || 1)), available);
}

function openCapsuleRevealModal({ count = 1, source = "profile" } = {}) {
  const target = capsuleRevealCount(count);
  if (target <= 0) {
    showToast("No Blupets to reveal");
    return;
  }
  if (!elements.capsuleRevealModal || !elements.capsuleRevealCube || !elements.capsuleRevealOutput) {
    const results = openCapsuleBatch(target);
    if (!results.length) return;
    recentCapsuleResults = [...results.reverse(), ...recentCapsuleResults].slice(0, 16);
    updateProfileChip();
    syncCollectionLeaderboard();
    if (source === "gameover") {
      gameoverRevealBatch = results;
      gameoverRevealResult = bestCapsuleResult(results);
      gameoverRevealSeq += 1;
      renderGameoverScreen(app.state);
    } else {
      renderProfile();
      renderMetaOverlay();
      renderCollectionScreen();
    }
    return;
  }

  capsuleRevealRequest = { count, source };
  if (capsuleRevealTimer) {
    clearTimeout(capsuleRevealTimer);
    capsuleRevealTimer = null;
  }
  elements.capsuleRevealModal.hidden = false;
  elements.capsuleRevealModal.setAttribute("aria-hidden", "false");
  elements.capsuleRevealModal.dataset.phase = "ready";
  elements.capsuleRevealModal.dataset.count = target > 1 ? "multi" : "single";
  elements.capsuleRevealCube.disabled = false;
  elements.capsuleRevealOutput.innerHTML = "";
  if (elements.capsuleRevealClose) elements.capsuleRevealClose.hidden = true;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => elements.capsuleRevealCube?.focus({ preventScroll: true }));
}

function updateAfterCapsuleReveal(results, source) {
  if (!results.length) return;
  const ordered = [...results].reverse();
  recentCapsuleResults = [...ordered, ...recentCapsuleResults].slice(0, 16);
  updateProfileChip();
  syncCollectionLeaderboard();
  if (source === "gameover") {
    gameoverRevealBatch = results;
    gameoverRevealResult = bestCapsuleResult(results);
    gameoverRevealSeq += 1;
    renderGameoverScreen(app.state);
  } else {
    renderProfile();
    renderMetaOverlay();
    renderCollectionScreen();
  }
}

function syncCollectionLeaderboard() {
  if (!app.authState.user) return;
  syncProgressSnapshot(app.progress)
    .then((data) => {
      if (data?.progress) applyRemoteProgress(data.progress);
      return fetchGlobalLeaderboard();
    })
    .then((entries) => {
      app.remoteLeaderboard = entries;
      updateProfileChip();
      renderProfile();
      renderLeaderboard();
      renderMetaOverlay();
    })
    .catch((error) => {
      console.error("[sync] collection snapshot failed:", error);
    });
}

function performCapsuleReveal() {
  if (!capsuleRevealRequest || !elements.capsuleRevealModal || elements.capsuleRevealModal.dataset.phase !== "ready") {
    return;
  }
  const target = capsuleRevealCount(capsuleRevealRequest.count);
  if (target <= 0) {
    closeCapsuleRevealModal();
    showToast("No Blupets to reveal");
    return;
  }
  elements.capsuleRevealModal.dataset.phase = "opening";
  elements.capsuleRevealCube.disabled = true;
  elements.capsuleRevealOutput.innerHTML = "";
  if (elements.capsuleRevealClose) elements.capsuleRevealClose.hidden = true;
  sfx("ui");

  capsuleRevealTimer = setTimeout(() => {
    const request = capsuleRevealRequest;
    const results = openCapsuleBatch(target);
    capsuleRevealTimer = null;
    if (!results.length) {
      closeCapsuleRevealModal();
      showToast("No Blupets to reveal");
      return;
    }
    updateAfterCapsuleReveal(results, request?.source ?? "profile");
    elements.capsuleRevealModal.dataset.phase = "result";
    elements.capsuleRevealModal.dataset.count = results.length > 1 ? "multi" : "single";
    elements.capsuleRevealModal.dataset.bulk = results.length >= 6 ? "1" : "0";
    elements.capsuleRevealOutput.innerHTML = renderCapsuleRevealOutput(results);
    if (elements.capsuleRevealClose) {
      elements.capsuleRevealClose.hidden = false;
      elements.capsuleRevealClose.focus({ preventScroll: true });
    }
    sfx(results.some((result) => !result.duplicate) ? "evolve" : "ui");
  }, 1850);
}

function closeCapsuleRevealModal() {
  if (capsuleRevealTimer) {
    clearTimeout(capsuleRevealTimer);
    capsuleRevealTimer = null;
  }
  capsuleRevealRequest = null;
  if (!elements.capsuleRevealModal) return;
  elements.capsuleRevealModal.hidden = true;
  elements.capsuleRevealModal.setAttribute("aria-hidden", "true");
  elements.capsuleRevealModal.dataset.phase = "closed";
  delete elements.capsuleRevealModal.dataset.count;
  delete elements.capsuleRevealModal.dataset.bulk;
  if (elements.capsuleRevealOutput) elements.capsuleRevealOutput.innerHTML = "";
  if (elements.capsuleRevealClose) elements.capsuleRevealClose.hidden = true;
  if (elements.capsuleRevealCube) elements.capsuleRevealCube.disabled = false;
  document.body.classList.remove("modal-open");
}

function renderGameoverScreen(stateLike) {
  if (app.currentScreen !== "gameover" || !stateLike?.gameOver) {
    return;
  }

  const summary = lastRunSummary ?? {
    score: stateLike.score,
    movesUsed: stateLike.movesUsed ?? 0,
    maxCombo: stateLike.runMaxCombo ?? 0,
    specials: stateLike.runSpecials ?? { cross: 0, bomb: 0 },
    newBadges: [],
    capsulesEarned: 0,
    bonusCapsules: 0,
    ascendedCount: ascendedLineageCount(app.progress),
    blupetsCount: collectionTileCount(app.progress),
  };

  elements.gameoverScore.textContent = `${summary.score}`;

  const totalCapsules = (Number(summary.capsulesEarned) || 0) + (Number(summary.bonusCapsules) || 0);
  const bestForm = getBestRunForm(stateLike);
  if (elements.gameoverFormArt) {
    elements.gameoverFormArt.src = bestForm.asset;
    elements.gameoverFormArt.alt = bestForm.name;
  }
  if (elements.gameoverFormName) {
    elements.gameoverFormName.textContent = bestForm.name;
  }
  if (elements.gameoverBtn) {
    elements.gameoverBtn.textContent = "Play Again";
  }
  if (elements.gameoverHomeBtn) {
    elements.gameoverHomeBtn.textContent = "Main Menu";
  }

  if (app.tournamentRunProof) {
    const player = app.tournamentRoom?.playerState ?? {};
    const ownRank = player.rank
      ? `Rank #${player.rank}`
      : player.hasSubmitted ? "Score saved · standings updating" : "Submitting score...";
    elements.gameoverDetail.innerHTML =
      `<div class="gameover-save-prompt">` +
        `<p class="gameover-save-text">${stateLike.tournamentTimedOut ? "Time is up · " : ""}Tournament score · ${escapeHtml(ownRank)}</p>` +
      `</div>`;
    if (elements.gameoverBtn) {
      elements.gameoverBtn.textContent = "Back to Room";
    }
    if (elements.gameoverHomeBtn) {
      elements.gameoverHomeBtn.textContent = "Main Menu";
    }
    return;
  }

  // Guests: prompt to sign in instead of capsule CTA
  if (!app.authState.user) {
    elements.gameoverDetail.innerHTML =
      `<div class="gameover-save-prompt">` +
        `<p class="gameover-save-text">Sign in to save your Blupets &amp; progress!</p>` +
        `<button class="gameover-save-btn" type="button" data-gameover-signin>Sign in</button>` +
      `</div>`;
    return;
  }

  const balance = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  const ctaCount = balance > 0 ? (totalCapsules > 0 ? Math.min(totalCapsules, balance) : balance) : 0;
  const ctaTitle = balance > 0
    ? (ctaCount === 1 ? "Blupet ready!" : `${ctaCount} Blupets ready!`)
    : "No Blupets ready";
  const ctaSub = balance > 0
    ? (balance > 1 ? "Tap to reveal your Blupets" : "Tap to reveal your Blupet")
    : "Play again to earn Blupets";

  elements.gameoverDetail.innerHTML =
    renderEarnedEventBadge(summary.eventBadge) +
    `<button class="run-capsule-summary" type="button" data-gameover-capsule-cta ${balance <= 0 ? "disabled" : ""}>` +
      `<span class="run-capsule-icon"><img src="./assets/blocks/origin.svg" alt="" /></span>` +
      `<span class="run-capsule-copy"><strong>${escapeHtml(ctaTitle)}</strong><small>${escapeHtml(ctaSub)}</small></span>` +
      (balance > 0 ? `<span class="run-capsule-arrow" aria-hidden="true">→</span>` : `<span></span>`) +
    `</button>`;
}

function getBestRunForm(stateLike) {
  let best = null;
  for (const color of COLORS) {
    const tier = stateLike.evolutionTiers?.[color.id] ?? 1;
    const form = tier > 1 ? getChosenEvolutionForm(stateLike, color.id, tier) : null;
    const progressValue = stateLike.colorMatchCounts?.[color.id] ?? 0;
    const candidate = {
      tier,
      progressValue,
      colorId: color.id,
      partnerColorId: stateLike.evolutionFusions?.[color.id]?.partnerColorId ?? color.id,
      formKey: form?.key ?? null,
      formName: form?.name ?? null,
      name: form?.name ?? `${color.label} Blupet`,
      asset: form?.asset ?? getBaseBlockAsset(color.id),
    };
    if (
      !best ||
      candidate.tier > best.tier ||
      (candidate.tier === best.tier && candidate.progressValue > best.progressValue)
    ) {
      best = candidate;
    }
  }
  return best ?? {
    tier: 1,
    progressValue: 0,
    name: "Blupet",
    asset: "./assets/hero-block.svg",
  };
}

async function shareRunSummary() {
  unlockAudio();
  sfx("ui");

  const summary = lastRunSummary ?? (app.state?.gameOver ? {
    score: app.state.score,
    movesUsed: app.state.movesUsed ?? 0,
    maxCombo: app.state.runMaxCombo ?? 0,
    specials: app.state.runSpecials ?? { cross: 0, bomb: 0 },
    capsulesEarned: 0,
    bonusCapsules: 0,
    blupetsCount: collectionTileCount(app.progress),
  } : null);
  if (!summary) {
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}`;
  const data = buildRunShareData(summary, app.state);
  const text = `Merged to ${data.formName ?? "Blupet"} and scored ${Number(summary.score).toLocaleString("en-US")} in Blupets Match. Collection: ${data.forms ?? ""} Blupets. Play: ${url}`;

  try {
    const blob = await renderShareCard(data);
    const file = new File([blob], "blupets-run.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Blupets Match", text });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    downloadBlob(blob, "blupets-run.png");
    const copied = await copyShareText(text);
    showToast(copied ? "Card saved — caption copied!" : "Card saved — share it anywhere!");
    return;
  } catch {
    // Fall back to text sharing below.
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: "Blupets Match", text, url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("Run result copied");
  } catch {
    showToast(text);
  }
}

function handleGameoverCapsuleCta(event) {
  if (!event.target.closest?.("[data-gameover-capsule-cta]")) return;
  const balance = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
  openCapsuleRevealModal({ count: Math.min(10, Math.max(1, balance)), source: "gameover" });
}

// Discovered-forms count for the victory/share card. Prefers the cloud number
// (`cloudFormsCount`) when signed in so a guest's local-only forms can't inflate
// it; falls back to the in-memory collection for guests / before the first fetch.
function collectedFormsCount() {
  if (app.authState.user && cloudFormsCount != null) return cloudFormsCount;
  return discoveredCount(app.progress);
}

function renderVictoryScreen(stateLike) {
  if (app.currentScreen !== "victory" || !stateLike?.victoryMeta) {
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


function renderCollectionScreen() {
  if (!elements.collectionScreen || elements.collectionScreen.hidden) return;
  if (elements.collectionContent) {
    // Back button lives inside the hero (like quests/leaderboard); the separate
    // mobile-screen-head is hidden via CSS so we don't double up.
    elements.collectionContent.innerHTML = renderCollectionGrid({ back: true });
  }
}

function renderQuestsScreen() {
  if (!elements.questsScreen || elements.questsScreen.hidden) return;
  // Stats (progress bar) are folded into the section below the hero so the hero
  // sits at the very top; the separate stats slot stays hidden on this screen.
  if (elements.questsStats) {
    elements.questsStats.innerHTML = "";
    elements.questsStats.hidden = true;
  }
  if (elements.questsContent) {
    elements.questsContent.innerHTML = renderQuestsSection({ back: true, inlineStats: true });
  }
}

function renderGuideScreen() {
  if (!elements.guideScreen || elements.guideScreen.hidden) return;
  if (elements.guideContent) {
    elements.guideContent.innerHTML = renderGuideSection({ back: true });
  }
}

function renderMetaOverlay() {
  const section = activeMetaOverlay;
  renderStartMetaTabs(section);
  if (!section || !elements.metaPopup || elements.metaPopup.hidden) return;
  elements.metaPopup.dataset.section = section;

  if (elements.metaPopupTitle) elements.metaPopupTitle.textContent = metaTitle(section);
  if (elements.metaPopupStatus) elements.metaPopupStatus.textContent = metaStatus(section);
  if (elements.metaPopupActions) {
    const signedIn = Boolean(app.authState.user);
    elements.metaPopupActions.replaceChildren();
    if (section === "account") {
      const button = document.createElement("button");
      button.className = "btn btn--ghost";
      button.type = "button";
      button.dataset.accountAction = signedIn ? "signout" : "signin";
      button.textContent = signedIn ? "Sign out" : "Sign in";
      elements.metaPopupActions.append(button);
    } else if (section === "public-profile") {
      const avatar = document.createElement("span");
      avatar.className = "meta-popup-public-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.style.backgroundImage = safeCssUrl(app.metaPublicProfile?.avatarUrl || "");
      elements.metaPopupActions.append(avatar);
    }
  }
  if (elements.metaPopupStats) {
    const publicHtml = section === "public-profile" && app.metaPublicProfile?.entries
      ? renderPublicProfileHtml(
          app.metaPublicProfile.entries,
          Boolean(app.authState.user && app.metaPublicProfile.userId === app.authState.user.id),
          app.metaPublicProfile.userId,
          app.metaPublicProfile.storedCollectionTiles ?? null,
        )
      : null;
    // Quest stats (progress bar) are now folded into the section below the hero
    // so the hero sits at the very top; keep the separate slot only for public profiles.
    elements.metaPopupStats.hidden = !publicHtml;
    elements.metaPopupStats.innerHTML = publicHtml ? publicHtml.stats : "";
  }
  if (elements.metaPopupTabsHost) {
    elements.metaPopupTabsHost.innerHTML = "";
  }
  if (!elements.metaPopupContent) return;
  elements.metaPopupContent.innerHTML =
    section === "quests" ? renderQuestsSection({ back: true, inlineStats: true }) :
    section === "account" ? renderAccountSection() :
    section === "capsules" ? renderCapsulesSection() :
    section === "guide" ? renderGuideSection({ back: true }) :
    section === "public-profile" ? renderMetaPublicProfileContent() :
    section === "rank" ? "" :
    renderCollectionGrid({ back: true });
  if (section === "rank") {
    renderLeaderboardContent({
      tabsHost: elements.metaPopupTabsHost,
      content: elements.metaPopupContent,
      back: true,
    });
  }
}


let _evoKeyHandler = null;
function openEvoTree(apexKey, discovered, ownProfile = false) {
  const family = getLineageByAscendedKey(apexKey);
  if (!family || !elements.evoTreeModal || !elements.evoTreeContent) return;
  const reachedTier = ownProfile
    ? Math.max(lineageStageLevel(app.progress, apexKey), collectionLineageStageLevel(app.progress, apexKey))
    : 0;
  elements.evoTreeContent.innerHTML = buildEvoTree(family, discovered, reachedTier);
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
  const ownProfile =
    event.currentTarget === elements.profileContent ||
    event.currentTarget === elements.collectionContent ||
    (event.currentTarget === elements.metaPopupContent && activeMetaOverlay !== "public-profile");
  const apexDiscovered = card.hasAttribute("data-apex-discovered")
    ? card.dataset.apexDiscovered === "1"
    : card.dataset.discovered === "1";
  openEvoTree(card.dataset.apexKey || card.dataset.formKey, apexDiscovered, ownProfile);
}

function handleCapsuleAction(event) {
  const button = event.target.closest?.("[data-capsule-action]");
  const inProfile = elements.profileContent?.contains(button);
  const inMetaPopup = elements.metaPopupContent?.contains(button);
  const inCollectionScreen = elements.collectionContent?.contains(button);
  if (!button || (!inProfile && !inMetaPopup && !inCollectionScreen)) return;
  const action = button.dataset.capsuleAction;
  if (action === "open") {
    const available = Math.max(0, Math.floor(Number(app.progress.capsules) || 0));
    const requested = Math.max(1, Math.floor(Number(button.dataset.count) || 1));
    const count = Math.min(requested, available);
    if (count <= 0) {
      showToast("No Blupets to reveal");
      return;
    }
    openCapsuleRevealModal({ count: requested, source: "profile" });
    return;
  }
  if (action === "exchange") {
    const result = exchangeShardsForCapsules(app.progress);
    if (result.capsules <= 0) {
      showToast("Not enough shards");
      return;
    }
    updateProfileChip();
    renderProfile();
    sfx("ui");
    if (inMetaPopup) renderMetaOverlay();
    if (inCollectionScreen) renderCollectionScreen();
    persistProgress();
  }
}

function handleProfileTabActivate(event) {
  const button = event.target.closest?.("[data-profile-tab]");
  if (!button || !elements.profileContent?.contains(button)) return;
  if (event.type === "keydown") {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
  }
  const allowed = new Set(["collection", "capsules", "quests", "account"]);
  const nextTab = allowed.has(button.dataset.profileTab) ? button.dataset.profileTab : "collection";
  if (profileTab === nextTab) return;
  profileTab = nextTab;
  renderProfile();
  resetMetaScroll();
  sfx("ui");
}

function handleQuestTabActivate(event) {
  const button = event.target.closest?.("[data-quest-tab]");
  const inProfile = elements.profileContent?.contains(button);
  const inMetaPopup = elements.metaPopupContent?.contains(button);
  const inQuestsScreen = elements.questsContent?.contains(button);
  if (!button || (!inProfile && !inMetaPopup && !inQuestsScreen)) return;
  if (event.type === "keydown") {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
  }
  const nextTab = normalizeQuestTab(button.dataset.questTab);
  if (app.questTab === nextTab) return;
  app.questTab = nextTab;
  if (inMetaPopup) {
    renderMetaOverlay();
  } else if (inQuestsScreen) {
    renderQuestsScreen();
  } else {
    renderProfile();
  }
  resetMetaScroll();
  sfx("ui");
}

function render() {
  document.body.dataset.theme = document.body.dataset.theme || "light";
  syncMobilePerfMode();
  if (app.state) {
    drainAutoSelections();
  }

  const _screenChanged = app.currentScreen !== _lastRenderedScreen;
  setScreen(app.currentScreen);
  // Skip shell re-renders while on the game screen and the screen hasn't
  // changed — these functions are no-ops when their screens are hidden, but
  // they still read DOM state on every call. During cascade animations render()
  // fires 5-8 times; skipping here removes the per-frame overhead.
  if (_screenChanged || app.currentScreen !== "game") {
    _lastRenderedScreen = app.currentScreen;
    renderAuth();
    renderLeaderboard();
    renderProfile();
    renderMetaOverlay();
    renderCollectionScreen();
    renderQuestsScreen();
    renderGuideScreen();
    renderTournamentRoom();
    renderEventUi();
  }

  if (!app.state) {
    return;
  }

  if (app.currentScreen === "victory") {
    renderVictoryScreen(app.state);
    return;
  }

  if (app.currentScreen === "gameover") {
    renderGameoverScreen(app.state);
    return;
  }

  if (app.currentScreen !== "game") {
    return;
  }

  renderTopBar(app.state);
  renderTournamentHud();
  renderColorRoster(app.state);
  renderVibeStrip(app.state);
  renderBoardGlow();
  patchBoard(app.state);
  renderStatus(app.state);
  renderModals(app.state);
  if (!elements.board.style.width || !elements.board.style.height) {
    scheduleBoardSizeSync();
  }
  syncHintLoop();
  syncIdleLoop();
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

function getTriggeredSpecials(step) {
  if (Array.isArray(step.triggeredSpecials)) {
    return step.triggeredSpecials;
  }

  // Backward-compatible fallback for resolution payloads created before the
  // engine exposed triggered specials explicitly.
  const triggered = [];
  for (const position of step.clearedTiles ?? []) {
    const source = step.boardBeforeClear?.[position.row]?.[position.col];
    if (source?.special) {
      triggered.push({
        row: position.row,
        col: position.col,
        color: source.color,
        special: source.special,
      });
    }
  }
  return triggered;
}

function playTriggeredSpecialSfx(step, stepIndex) {
  const triggered = new Set(getTriggeredSpecials(step).map((tile) => tile.special));
  if (triggered.has("cross")) {
    sfx("crossTrigger", stepIndex);
  }
  if (triggered.has("bomb")) {
    sfx("bombTrigger", stepIndex);
  }
}

function playCreatedSpecialSfx(step, stepIndex) {
  const created = new Set((step.specialSpawns ?? []).map((spawn) => spawn.special));
  if (created.has("cross")) {
    sfx("crossCreate", stepIndex);
  }
  if (created.has("bomb")) {
    sfx("bombCreate", stepIndex);
  }
}

function playMatchHaptics(step, stepIndex) {
  const triggered = new Set(getTriggeredSpecials(step).map((tile) => tile.special));

  if (triggered.has("bomb")) {
    buzz([0, 18, 28, 42, 34, 58]);
    return;
  }
  if (triggered.has("cross")) {
    buzz([0, 16, 26, 36]);
    return;
  }

  const clearedCount = step.clearedTiles?.length ?? 0;
  const pulse = Math.min(36, 14 + stepIndex * 6 + Math.max(0, clearedCount - 3) * 2);
  if (stepIndex >= 2 || clearedCount >= 5) {
    buzz([0, pulse, 24, Math.max(18, Math.round(pulse * 0.65))]);
    return;
  }
  buzz(pulse);
}

function spawnSpecialTriggerFx(step) {
  const layer = elements.fxLayer;
  const board = elements.board;
  const shell = elements.boardShell;
  if (!layer || !board || !shell) {
    return;
  }

  const boardRect = _cachedBoardRect ?? board.getBoundingClientRect();
  const shellRect = _cachedShellRect ?? shell.getBoundingClientRect();
  const size = step.boardBeforeClear?.length || app.state?.board?.length || 8;
  const cell = boardRect.width / size;
  const seen = new Set();

  for (const position of getTriggeredSpecials(step)) {
    const key = `${position.row}:${position.col}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const el = document.createElement("div");
    el.className = `fx-special fx-special--${position.special}`;
    el.style.left = `${boardRect.left - shellRect.left + (position.col + 0.5) * cell}px`;
    el.style.top = `${boardRect.top - shellRect.top + (position.row + 0.5) * cell}px`;
    el.style.setProperty("--fx-color", getColor(position.color)?.hex ?? "#5ce8ff");
    el.style.setProperty("--fx-cell", `${cell}px`);
    el.innerHTML = position.special === "cross"
      ? '<span class="fx-special-beam fx-special-beam--h"></span><span class="fx-special-beam fx-special-beam--v"></span><span class="fx-special-core"></span>'
      : '<span class="fx-bomb-flash"></span><span class="fx-special-core"></span>';
    layer.appendChild(el);
    window.setTimeout(() => el.remove(), position.special === "bomb" ? 520 : 700);
  }
}

function triggerBombBoardRipple(step) {
  const board = elements.board;
  if (!board) {
    return 0;
  }

  const bombs = getTriggeredSpecials(step).filter((position) => position.special === "bomb");
  if (bombs.length === 0) {
    return 0;
  }

  const size = step.boardBeforeClear?.length || app.state?.board?.length || 8;
  let maxDelay = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const tile = board.querySelector(`.tile[data-row="${row}"][data-col="${col}"]:not(.tile--empty)`);
      if (!tile) {
        continue;
      }

      const distance = Math.min(
        ...bombs.map((bomb) => Math.hypot(row - bomb.row, col - bomb.col)),
      );
      const nearestBomb = bombs.reduce((nearest, bomb) => {
        const bombDistance = Math.hypot(row - bomb.row, col - bomb.col);
        return bombDistance < nearest.distance ? { bomb, distance: bombDistance } : nearest;
      }, { bomb: bombs[0], distance: Infinity }).bomb;
      const dx = col - nearestBomb.col;
      const dy = row - nearestBomb.row;
      const magnitude = Math.hypot(dx, dy) || 1;
      const rippleX = dx === 0 && dy === 0 ? 0 : dx / magnitude;
      const rippleY = dx === 0 && dy === 0 ? -1 : dy / magnitude;
      const delayMs = Math.round(distance * 58 * ANIM_SCALE);
      const rippleStrength = Math.max(0.42, 1.24 - distance * 0.12);
      const push = rippleStrength * 10.5;
      const settle = rippleStrength * 3.2;
      const recoil = rippleStrength * -1.9;
      const tilt = rippleX * rippleStrength * 2.8;
      maxDelay = Math.max(maxDelay, delayMs);
      tile.style.setProperty("--bomb-ripple-push-x", `${rippleX * push}%`);
      tile.style.setProperty("--bomb-ripple-push-y", `${rippleY * push}%`);
      tile.style.setProperty("--bomb-ripple-settle-x", `${rippleX * settle}%`);
      tile.style.setProperty("--bomb-ripple-settle-y", `${rippleY * settle}%`);
      tile.style.setProperty("--bomb-ripple-recoil-x", `${rippleX * recoil}%`);
      tile.style.setProperty("--bomb-ripple-recoil-y", `${rippleY * recoil}%`);
      tile.style.setProperty("--bomb-ripple-scale-x", `${1 + rippleStrength * 0.15}`);
      tile.style.setProperty("--bomb-ripple-scale-y", `${1 - rippleStrength * 0.08}`);
      tile.style.setProperty("--bomb-ripple-settle-scale-x", `${1 - rippleStrength * 0.035}`);
      tile.style.setProperty("--bomb-ripple-settle-scale-y", `${1 + rippleStrength * 0.085}`);
      tile.style.setProperty("--bomb-ripple-recoil-scale-x", `${1 + rippleStrength * 0.05}`);
      tile.style.setProperty("--bomb-ripple-recoil-scale-y", `${1 - rippleStrength * 0.025}`);
      tile.style.setProperty("--bomb-ripple-tilt", `${tilt}deg`);
      tile.style.setProperty("--bomb-ripple-tilt-back", `${tilt * -0.52}deg`);
      tile.style.setProperty("--bomb-ripple-tilt-recoil", `${tilt * 0.28}deg`);
      tile.style.setProperty("--bomb-ripple-delay", `${delayMs}ms`);
      tile.classList.remove("is-bomb-ripple");
      tile.classList.add("is-bomb-ripple");
      window.setTimeout(() => {
        tile.classList.remove("is-bomb-ripple");
        tile.style.removeProperty("--bomb-ripple-delay");
        tile.style.removeProperty("--bomb-ripple-push-x");
        tile.style.removeProperty("--bomb-ripple-push-y");
        tile.style.removeProperty("--bomb-ripple-settle-x");
        tile.style.removeProperty("--bomb-ripple-settle-y");
        tile.style.removeProperty("--bomb-ripple-recoil-x");
        tile.style.removeProperty("--bomb-ripple-recoil-y");
        tile.style.removeProperty("--bomb-ripple-scale-x");
        tile.style.removeProperty("--bomb-ripple-scale-y");
        tile.style.removeProperty("--bomb-ripple-settle-scale-x");
        tile.style.removeProperty("--bomb-ripple-settle-scale-y");
        tile.style.removeProperty("--bomb-ripple-recoil-scale-x");
        tile.style.removeProperty("--bomb-ripple-recoil-scale-y");
        tile.style.removeProperty("--bomb-ripple-tilt");
        tile.style.removeProperty("--bomb-ripple-tilt-back");
        tile.style.removeProperty("--bomb-ripple-tilt-recoil");
      }, delayMs + 360);
    }
  }

  return Math.max(CLEAR_ANIMATION_MS, Math.min(BOMB_RIPPLE_MS, maxDelay + 360));
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

  setComboDisplay(null); // reset the COMBO card at the start of each swap

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
    spawnSpecialTriggerFx(step);
    const clearHoldMs = triggerBombBoardRipple(step);

    // Audio + combo feedback rise with cascade depth.
    sfx("match", stepIndex);
    playTriggeredSpecialSfx(step, stepIndex);
    playMatchHaptics(step, stepIndex);
    feedback.onCascadeStep(step, stepIndex);

    await delay(Math.max(CLEAR_ANIMATION_MS, clearHoldMs));

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
    playCreatedSpecialSfx(step, stepIndex);

    await showTutorialForResolutionStep(step, stepIndex);

    await delay(CASCADE_SETTLE_MS);
  }

  // COMBO card reflects the cascade-depth multiplier this swap actually applied.
  setComboDisplay(resolution.comboMultiplier);

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
  if (!app.state) {
    return;
  }

  app.isAnimating = true;
  setBoardAnimation({
    board: app.state.board,
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
  app.isAnimating = false;
}

async function performSwap(first, second) {
  const currentState = app.state;
  const nextState = attemptSwap(currentState, first, second, runRng);
  const resolution = nextState._lastResolution;
  const didMatch = nextState.movesUsed > currentState.movesUsed;
  const evolutionQueued = nextState.pendingEvolutionQueue.length > currentState.pendingEvolutionQueue.length;

  if (!didMatch || !resolution) {
    app.selectedTile = null;
    sfx("invalid");
    buzz(40);
    await playRejectAnimation(first, second);
    applyState(nextState);
    return;
  }

  app.isAnimating = true;
  app.selectedTile = null;
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
    collectSaraiHeartQuestProgress(currentState, resolution);
    if (nextState.gameOver && resolution.scoreDelta > 0) {
      // `app.state` still points at the pre-swap state during animation. Paint the
      // authoritative final totals directly, then keep interaction locked while
      // the explicit +points feedback plays over the settled board.
      renderTopBar(nextState);
      feedback.onFinalScoreGain(resolution.scoreDelta);
      await delay(FINAL_SCORE_HOLD_MS);
    }
    app.isAnimating = false;
    applyState(nextState);
    if (evolutionQueued) {
      window.setTimeout(() => feedback.onEvolutionTrigger(), isMobilePopupLayout() ? 260 : 120);
    }
    await showTutorialForStateTransition(currentState, nextState);
  }
}

async function handleTapSelection(tile) {
  if (!app.selectedTile) {
    app.selectedTile = tile;
    render();
    return;
  }

  if (sameTile(app.selectedTile, tile)) {
    app.selectedTile = null;
    render();
    return;
  }

  if (!areAdjacent(app.selectedTile, tile, app.state?.diagonalSwaps)) {
    app.selectedTile = tile;
    render();
    return;
  }

  const first = app.selectedTile;
  await performSwap(first, tile);
}

function canInteractWithBoard() {
  return Boolean(
    app.state &&
      app.currentScreen === "game" &&
      !app.state.gameOver &&
      !app.state.victory &&
      !app.isAnimating &&
      !vibeIntroOpen &&
      app.state.pendingEvolutionQueue.length === 0,
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
    boardRect: elements.board.getBoundingClientRect(),
  };

  elements.board.setPointerCapture(event.pointerId);
  render();
}

// Resolve (x, y) client coordinates to a board tile using the captured board
// rect from pointer down — avoids document.elementFromPoint which forces a
// synchronous layout flush on every finger move event.
function getTileFromCoords(clientX, clientY, boardRect) {
  const BOARD_COLS = 8;
  const BOARD_ROWS = 8;
  const col = Math.floor(((clientX - boardRect.left) / boardRect.width) * BOARD_COLS);
  const row = Math.floor(((clientY - boardRect.top) / boardRect.height) * BOARD_ROWS);
  if (col < 0 || col >= BOARD_COLS || row < 0 || row >= BOARD_ROWS) {
    return null;
  }
  return { row, col };
}

function handleBoardPointerMove(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  const hoveredTile = getTileFromCoords(event.clientX, event.clientY, dragState.boardRect);
  const previousKey = dragState.currentTile ? cellKey(dragState.currentTile.row, dragState.currentTile.col) : "";
  if (hoveredTile && areAdjacent(dragState.originTile, hoveredTile, app.state?.diagonalSwaps)) {
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
  app.selectedTile = null;
  render();
}

function bindClick(element, listener) {
  element?.addEventListener("click", (event) => {
    if (!element.disabled && !element.getAttribute("aria-disabled")) {
      unlockAudio();
      sfx("ui");
    }
    listener(event);
  });
}

function handleGlobalInteractiveClick(event) {
  const target = event.target.closest?.(
    "button:not(:disabled), [role='button'], a[href], input[type='button'], input[type='submit']",
  );
  if (!target || target.getAttribute("aria-disabled") === "true") {
    return;
  }
  if (target.closest("#board")) {
    return;
  }
  unlockAudio();
  sfx("ui");
}

elements.board.addEventListener("pointerdown", handleBoardPointerDown);
elements.board.addEventListener("pointermove", handleBoardPointerMove);
elements.board.addEventListener("pointerup", handleBoardPointerUp);
elements.board.addEventListener("pointercancel", handleBoardPointerCancel);
document.addEventListener("click", handleGlobalInteractiveClick);
bindClick(elements.startRun, () => startRun());
bindClick(elements.startQuests, () => openMetaSection("quests", "start"));
bindClick(elements.startGuide, () => openMetaSection("guide", "start"));
bindClick(elements.startLeaderboard, () => openMetaSection("rank", "start"));
elements.eventBannerHost?.addEventListener("click", (event) => {
  if (event.target.closest("[data-event-open]")) openEventPopup();
});
bindClick(elements.eventPopupClose, () => closeEventPopup());
bindClick(elements.eventPopupBackdrop, () => closeEventPopup());
bindClick(elements.authGoogleBtn, () => handleAuthProvider("google"));
bindClick(elements.authTwitterBtn, () => handleAuthProvider("x"));
bindClick(elements.authLogoutBtn, handleAuthLogout);
bindClick(elements.authSkipBtn, handleAuthSkip);
if (elements.authEmailForm) elements.authEmailForm.addEventListener("submit", handleAuthEmailPassword);
if (elements.authEmailTabs) elements.authEmailTabs.addEventListener("click", handleAuthTabSwitch);
bindClick(elements.backToStart, exitTournamentGame);
bindClick(elements.leaderboardBackBtn, closeLeaderboard);
bindClick(elements.profileBackBtn, closeProfile);
bindClick(elements.publicProfileBackBtn, closePublicProfile);
bindClick(elements.collectionBackBtn, () => { if (_historyDepth > 0) history.back(); else setScreen("start"); });
bindClick(elements.questsBackBtn, () => { if (_historyDepth > 0) history.back(); else setScreen("start"); });
bindClick(elements.guideBackBtn, () => { if (_historyDepth > 0) history.back(); else setScreen("start"); });
bindClick(elements.metaPopupClose, handleMetaPopupClose);
// Back button now lives inside the tab-hero on the leaderboard/quests screens
// (the old header bars are hidden); route its click to the same close actions.
elements.leaderboardTabsHost?.addEventListener("click", (e) => {
  if (e.target.closest("[data-hero-back]")) closeLeaderboard();
});
elements.questsContent?.addEventListener("click", (e) => {
  if (e.target.closest("[data-hero-back]")) { if (_historyDepth > 0) history.back(); else setScreen("start"); }
});
elements.guideContent?.addEventListener("click", (e) => {
  if (e.target.closest("[data-hero-back]")) { if (_historyDepth > 0) history.back(); else setScreen("start"); }
});
// Desktop meta-popup: the hero back button closes the popup (its own header is hidden).
const closePopupFromHeroBack = (e) => {
  if (e.target.closest("[data-hero-back]")) handleMetaPopupClose();
};
elements.metaPopupContent?.addEventListener("click", closePopupFromHeroBack);
elements.metaPopupTabsHost?.addEventListener("click", closePopupFromHeroBack);
// Tabs now live in their own host above the scroll container, so switching
// categories doesn't scroll with (or get hidden by) the list of record cards.
elements.leaderboardTabsHost?.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".leaderboard-tab");
  if (!tabBtn?.dataset.tab) return;
  app.leaderboardTab = tabBtn.dataset.tab;
  renderLeaderboard();
  resetMetaScroll();
  sfx("ui");
});
elements.leaderboardContent?.addEventListener("click", (e) => {
  const btn = e.target.closest(".leaderboard-user-btn");
  if (btn?.dataset.userId) {
    openPublicProfile(btn.dataset.userId, btn.dataset.account, btn.dataset.avatar);
  }
});
elements.leaderboardMetaNav?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-meta-nav]");
  if (!btn?.dataset.metaNav) return;
  sfx("ui");
  openMetaSection(btn.dataset.metaNav, "leaderboard");
});
elements.profileMetaNav?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-meta-nav]");
  if (!btn?.dataset.metaNav) return;
  sfx("ui");
  openMetaSection(btn.dataset.metaNav, "profile");
});
elements.globalMetaNav?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-meta-nav]");
  if (!btn?.dataset.metaNav) return;
  sfx("ui");
  const target = btn.dataset.metaNav;
  // Home: leave whatever page is open and land back on the start screen. From the
  // Lobby room, tear it down; from a section page, pop it (keeps history/back in
  // sync); on a bare start screen it's a no-op.
  if (target === "home") {
    if (app.currentScreen === "tournament") goToStart();
    else if (activeMetaOverlay) handleMetaPopupClose();
    return;
  }
  // Navigating from inside the live Lobby room: tear it down cleanly first (same
  // path as the room's back button) so a switch never stacks a section over an
  // active tournament.
  if (app.currentScreen === "tournament") {
    if (target === "tournament") return; // already in the Lobby room — no-op
    goToStart();
  }
  if (target === "tournament") {
    enterTournament();
    return;
  }
  openMetaSection(target, "global");
});
elements.mobileNav?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mobile-nav]");
  if (!btn?.dataset.mobileNav) return;
  if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
  sfx("ui");
  const target = btn.dataset.mobileNav;
  if (target === "start") {
    goToStart();
  } else if (target === "tournament") {
    enterTournament();
  } else {
    openMetaSection(target === "leaderboard" ? "rank" : target, app.currentScreen);
  }
});
window.addEventListener("scroll", updatePageScrolledState, { passive: true });
elements.metaPopup?.addEventListener("scroll", updatePageScrolledState, { passive: true });
elements.tournamentScreen?.addEventListener("scroll", updatePageScrolledState, { passive: true });
elements.leaderboardContent?.addEventListener("scroll", updatePageScrolledState, { passive: true });
elements.profileContent?.addEventListener("scroll", updatePageScrolledState, { passive: true });
elements.metaPopupTabsHost?.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".leaderboard-tab");
  if (!tabBtn?.dataset.tab) return;
  app.leaderboardTab = tabBtn.dataset.tab;
  renderMetaOverlay();
  resetMetaScroll();
  sfx("ui");
});
elements.metaPopupContent?.addEventListener("change", (e) => {
  const input = e.target.closest("[data-avatar-upload]");
  if (input?.files?.[0]) handleAvatarFileChange(input.files[0]);
});
elements.profileContent?.addEventListener("change", (e) => {
  const input = e.target.closest("[data-avatar-upload]");
  if (input?.files?.[0]) handleAvatarFileChange(input.files[0]);
});
elements.metaPopupContent?.addEventListener("click", handleQuestTabActivate);
elements.metaPopupContent?.addEventListener("keydown", handleQuestTabActivate);
elements.metaPopupContent?.addEventListener("click", handleCapsuleAction);
// Collection screen event delegation
elements.collectionContent?.addEventListener("click", handleCapsuleAction);
// Quests screen event delegation
elements.questsContent?.addEventListener("click", handleQuestTabActivate);
elements.questsContent?.addEventListener("keydown", handleQuestTabActivate);
elements.metaPopupContent?.addEventListener("click", (e) => {
  const userBtn = e.target.closest(".leaderboard-user-btn");
  if (userBtn?.dataset.userId) {
    openPublicProfile(userBtn.dataset.userId, userBtn.dataset.account, userBtn.dataset.avatar);
    return;
  }
  const action = e.target.closest("[data-account-action]")?.dataset.accountAction;
  if (!action) return;
  if (action === "back") handleMetaPopupClose();
  if (action === "signin") openAuthModal({ force: true });
  if (action === "signout") handleAuthLogout();
  if (action === "guide") startRun({ guided: true });
  if (action === "edit-name") showUsernameEditInline(elements.metaPopupContent);
  if (action === "save-name") handleUsernameSaveInline(elements.metaPopupContent);
  if (action === "cancel-name") renderMetaOverlay();
});
elements.metaPopupActions?.addEventListener("click", (e) => {
  const action = e.target.closest("[data-account-action]")?.dataset.accountAction;
  if (!action) return;
  if (action === "signin") openAuthModal({ force: true });
  if (action === "signout") handleAuthLogout();
});
elements.profileContent?.addEventListener("click", handleProfileTabActivate);
elements.profileContent?.addEventListener("keydown", handleProfileTabActivate);
elements.profileContent?.addEventListener("click", handleQuestTabActivate);
elements.profileContent?.addEventListener("keydown", handleQuestTabActivate);
elements.profileContent?.addEventListener("click", handleCapsuleAction);
elements.profileContent?.addEventListener("click", (e) => {
  const action = e.target.closest("[data-account-action]")?.dataset.accountAction;
  if (!action) return;
  if (action === "back") closeProfile();
  if (action === "signin") openAuthModal({ force: true });
  if (action === "signout") handleAuthLogout();
  if (action === "guide") startRun({ guided: true });
  if (action === "edit-name") showUsernameEditInline(elements.profileContent);
  if (action === "save-name") handleUsernameSaveInline(elements.profileContent);
  if (action === "cancel-name") renderProfile();
});
bindClick(elements.evoTreeClose, closeEvoTree);
bindClick(elements.evoTreeBackdrop, closeEvoTree);
bindClick(elements.profileSignInBtn, () => openAuthModal({ force: true }));
bindClick(elements.profileLogoutBtn, handleAuthLogout);
bindClick(elements.victoryLeaderboardBtn, () => openLeaderboard("victory"));
bindClick(elements.victoryBtn, () => startRun());
bindClick(elements.gameoverBtn, () => {
  if (app.tournamentRunProof) backToTournamentRoom();
  else startRun();
});
bindClick(elements.gameoverHomeBtn, goToStart);
bindClick(elements.gameoverShareBtn, shareRunSummary);
bindClick(elements.capsuleRevealClose, closeCapsuleRevealModal);
bindClick(elements.capsuleRevealCube, performCapsuleReveal);
elements.gameoverDetail?.addEventListener("click", handleGameoverCapsuleCta);
elements.gameoverDetail?.addEventListener("click", (e) => {
  if (e.target.closest("[data-gameover-signin]")) openAuthModal({ force: true });
});
bindClick(elements.vibeIntroBtn, () => dismissVibeIntro());
bindClick(elements.victoryShareBtn, () => shareVictory());
bindClick(elements.muteBtn, handleMuteToggle);
bindClick(elements.muteBtnGame, handleMuteToggle);
bindClick(elements.startMuteBtn, handleMuteToggle);
bindClick(elements.startTournament, openTournamentModal);
bindClick(elements.tournamentBackBtn, goToStart);
bindClick(elements.tournamentLeaveBtn, leaveTournament);
bindClick(elements.tournamentReadyBtn, toggleTournamentReady);
bindClick(elements.tournamentStartBtn, startTournamentAttempt);
bindClick(elements.tournamentCopyBtn, copyTournamentInvite);
bindClick(elements.tournamentHostStartBtn, handleHostStartTournament);
elements.tournamentPlayers?.addEventListener("click", handleTournamentPlayerAction);
elements.tournamentModalCreateForm?.addEventListener("submit", handleModalCreate);
elements.tournamentModalJoinForm?.addEventListener("submit", handleModalJoin);
bindClick(elements.tournamentTabCreate, () => setTournamentModalTab("create"));
bindClick(elements.tournamentTabJoin, () => setTournamentModalTab("join"));
bindClick(elements.tournamentModalClose, closeTournamentModal);
bindClick(elements.tournamentModalBackdrop, closeTournamentModal);
bindClick(elements.profileChip, () => {
  if (app.authState.user) {
    openMetaSection("account", "start");
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
  if ((app.currentScreen === "start" || app.currentScreen === "game") && !isMuted()) {
    startMusic();
  }
  if (isMusicPlaying() || isMuted()) {
    window.removeEventListener("pointerdown", primeAudioOnGesture);
  }
}
window.addEventListener("pointerdown", primeAudioOnGesture);
elements.partnerOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-color-id][data-partner-id]");
  if (!button || !app.state) {
    return;
  }

  sfx("ui");
  const nextState = selectFusionPartner(app.state, button.dataset.colorId, button.dataset.partnerId);
  if (nextState !== app.state) {
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
  if (!button || !app.state) {
    return;
  }

  sfx("evolve");
  buzz([0, 30, 40, 30]);
  const nextState = selectEvolutionForm(
    app.state,
    button.dataset.colorId,
    Number(button.dataset.tier),
    button.dataset.formKey,
    runRng,
  );
  if (nextState !== app.state) {
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
  if (app.currentScreen === "game" || app.currentScreen === "gameover") {
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
  if (e.state?.event) openEventPopup({ pushHistory: false });
  else if (eventStore.open) closeEventPopup({ fromHistory: true });
  // Never restore a finished or absent run into the live game screen: the board
  // would be frozen (victory/gameOver blocks interaction). Send them to start.
  if (screen === "game" && (!app.state || app.state.victory || app.state.gameOver)) {
    screen = "start";
    history.replaceState({ screen: "start", idx: _historyDepth }, "", location.pathname);
  }
  if (screen === "start") {
    guideTour?.stop();
    resetInteractionState();
  }
  app.currentScreen = screen;
  // Desktop section pages live as a meta-popup over the "start" screen with a
  // `meta` marker in their history entry. Reconcile the popup with the restored
  // entry: reopen/switch when Back/Forward lands on a `meta` entry, close it
  // when it lands on one without (e.g. Back out of the pages to start).
  if (elements.metaPopup && !isMobileViewport()) {
    const targetMeta = screen === "start" ? e.state?.meta : null;
    if (targetMeta && targetMeta !== "public-profile") {
      if (activeMetaOverlay !== targetMeta || elements.metaPopup.hidden) {
        openMetaOverlay(targetMeta);
      }
    } else if (!elements.metaPopup.hidden) {
      closeMetaOverlay();
    }
  }
  setScreen(screen);
  render();
  _inPopstate = false;
});

// A reload, mobile OS eviction, or a temporary connection loss is not a player
// choosing to abandon. Keep the recoverable attempt locally and let the player
// resume it while its server deadline is still open. Explicit in-app exits use
// submitTournamentAbandon() instead.
window.addEventListener("pagehide", () => {
  sendTournamentDraftOnPagehide();
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

const _initialTournamentCode = (() => {
  const match = location.pathname.match(/\/t\/([A-Za-z0-9]+)/);
  return match ? normalizeTournamentCode(match[1]) : "";
})();

// Set initial history entry (don't clobber OAuth fragment/code if redirect just landed).
// PKCE flow returns ?code=… in query string; implicit flow returns #access_token in hash.
const _hasOAuthCode = new URLSearchParams(location.search).has("code");
if (!_hasOAuthCode && !/access_token|error_description/.test(location.hash)) {
  // Restore navigable screens from the URL hash on page refresh.
  // Game/victory/gameover can't be restored (no persisted game state) — fall back to start.
  const hashScreen = location.hash.replace(/^#/, "") || "start";
  // A `/t/CODE` invite does NOT jump straight to the room anymore — it lands on
  // the start screen and lets `handleInviteDeepLink()` (run once auth resolves)
  // either open the room for a signed-in user or gate a guest behind the auth
  // modal first. Keeping the backdrop on `start` means dismissing the modal
  // leaves the guest on the normal home screen, not an empty lobby panel.
  const initialScreen = ["profile", "leaderboard"].includes(hashScreen) ? hashScreen : "start";
  if (initialScreen === "leaderboard") lastScreenBeforeLeaderboard = "start";
  if (initialScreen === "profile") lastScreenBeforeProfile = "start";
  app.currentScreen = initialScreen;
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
// Invite deep-link (`/t/CODE`) is handled by handleInviteDeepLink() once auth
// state is known (called from initializeAuth) — not here — so guests see the
// auth modal first and land in the room only after signing in.

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
    app.state = demo;
    setScreen("victory");
  } else {
    demo.score = 7320;
    demo.gameOver = true;
    app.state = demo;
    setScreen("gameover");
  }
  render();
  // eslint-disable-next-line no-console
  console.info(`[demo] showing ${which} screen — clear ?demo= from the URL to exit.`);
}
maybeRunDemoScreen();

// If restored to leaderboard on refresh, kick off the remote data fetch.
if (app.currentScreen === "leaderboard") {
  app.leaderboardStatus = "loading";
  fetchGlobalLeaderboard()
    .then((entries) => {
      app.remoteLeaderboard = entries;
      app.leaderboardStatus = "ready";
      if (app.currentScreen === "leaderboard") renderLeaderboard();
    })
    .catch(() => {
      app.leaderboardStatus = "error";
      if (app.currentScreen === "leaderboard") renderLeaderboard();
    });
}

// Refresh profile data when the tab becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    sendTournamentDraftOnPagehide();
    return;
  }
  if (app.currentScreen === "game" && app.tournamentRunProof) {
    updateTournamentRunTimer();
  }
  if (app.tournamentRoom) {
    retryPendingTournamentSubmission(app.tournamentRoom).catch(() => {});
    refreshTournamentLeaderboard()
      .then(() => {
        if (app.currentScreen === "gameover") renderGameoverScreen(app.state);
      })
      .catch((error) => {
        if (!handleTournamentRefreshFailure(error)) {
          console.warn("[tournament] foreground refresh deferred:", error);
        }
      });
  }
  if (app.currentScreen === "profile" && app.authState.user) {
    fetchUserProgress()
      .then(applyRemoteProgress)
      .catch(() => {})
      .then(() => { if (app.currentScreen === "profile") render(); });
  }
  if (app.authState.user) refreshEventState();
});

window.addEventListener("online", () => {
  if (app.tournamentRoom) {
    retryPendingTournamentSubmission(app.tournamentRoom).catch(() => {});
  } else {
    maybeResumeSavedTournament();
  }
});
