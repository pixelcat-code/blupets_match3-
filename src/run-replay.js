import {
  COLORS,
  createInitialState,
  getChosenEvolutionForm,
  getEvolutionFormSelection,
  attemptSwap,
  selectEvolutionForm,
  selectFusionPartner,
} from "./game.js?v=20260717-special-spawn-1";
import { createSeededRng } from "./rng.js";

const MAX_ACTIONS = 500;
const PRODUCTION_RUN_OPTIONS = Object.freeze({
  diagonalAssist: false,
  diagonalSwaps: false,
  specialTiles: true,
  endlessRun: true,
});

function cloneTile(tile) {
  if (!tile || !Number.isInteger(tile.row) || !Number.isInteger(tile.col)) {
    return null;
  }
  if (tile.row < 0 || tile.row > 7 || tile.col < 0 || tile.col > 7) {
    return null;
  }
  return { row: tile.row, col: tile.col };
}

export function sanitizeRunActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.slice(0, MAX_ACTIONS).map((action) => {
    if (!action || typeof action !== "object") return null;
    if (action.type === "swap") {
      const first = cloneTile(action.first);
      const second = cloneTile(action.second);
      return first && second ? { type: "swap", first, second } : null;
    }
    if (action.type === "partner") {
      return {
        type: "partner",
        colorId: String(action.colorId ?? ""),
        partnerId: String(action.partnerId ?? ""),
      };
    }
    if (action.type === "form") {
      return {
        type: "form",
        colorId: String(action.colorId ?? ""),
        tier: Number(action.tier),
        formKey: String(action.formKey ?? ""),
      };
    }
    return null;
  }).filter(Boolean);
}

function drainAutoSelections(state, rng) {
  let nextState = state;
  while (nextState && nextState.pendingEvolutionQueue.length > 0) {
    const queueItem = nextState.pendingEvolutionQueue[0];
    if (queueItem.step !== "form" || queueItem.tier >= 4) {
      break;
    }

    const selection = getEvolutionFormSelection(nextState, queueItem.colorId, queueItem.tier);
    if (!selection.autoSelectFallback) {
      break;
    }

    nextState = selectEvolutionForm(
      nextState,
      queueItem.colorId,
      queueItem.tier,
      selection.options[0]?.key ?? null,
      rng,
    );
  }
  return nextState;
}

export function replayRun(seed, rawActions, options = PRODUCTION_RUN_OPTIONS) {
  const rng = createSeededRng(seed);
  const actions = sanitizeRunActions(rawActions);
  let state = createInitialState({ ...options, rng });

  for (const action of actions) {
    if (state.victory || state.gameOver) {
      break;
    }

    state = drainAutoSelections(state, rng);

    if (action.type === "swap") {
      state = attemptSwap(state, action.first, action.second, rng);
    } else if (action.type === "partner") {
      state = selectFusionPartner(state, action.colorId, action.partnerId);
    } else if (action.type === "form") {
      state = selectEvolutionForm(state, action.colorId, action.tier, action.formKey, rng);
    }

    state = drainAutoSelections(state, rng);
  }

  // Expose the advanced RNG to the browser recovery flow. A restored run must
  // continue from exactly the same random sequence as a run that never
  // reloaded; server callers simply ignore this extra field.
  return { state, actions, rng };
}

export function getReplayResultSummary(stateLike) {
  if (!stateLike) return null;
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
    };
    if (
      !best ||
      candidate.tier > best.tier ||
      (candidate.tier === best.tier && candidate.progressValue > best.progressValue)
    ) {
      best = candidate;
    }
  }

  return {
    score: stateLike.score ?? 0,
    movesUsed: stateLike.movesUsed ?? 0,
    formKey: best?.formKey ?? "RUN_COMPLETE",
    formName: best?.formName ?? best?.name ?? "Run Complete",
    colorId: best?.colorId ?? "blue",
    partnerColorId: best?.partnerColorId ?? best?.colorId ?? "blue",
    vibe: stateLike.vibe?.id ?? null,
    complete: Boolean(stateLike.gameOver || stateLike.victory),
  };
}

export function getReplayCollectionTiles(stateLike) {
  const out = {};
  if (!stateLike?.evolutionChoices || typeof stateLike.evolutionChoices !== "object") {
    return out;
  }

  for (const color of COLORS) {
    const choices = stateLike.evolutionChoices[color.id];
    if (!choices || typeof choices !== "object") continue;
    for (const tier of [2, 3, 4]) {
      const key = choices[tier] ?? choices[String(tier)] ?? null;
      if (typeof key === "string" && key.trim()) {
        out[key.slice(0, 96)] = true;
      }
    }
  }
  return out;
}

export { PRODUCTION_RUN_OPTIONS };
