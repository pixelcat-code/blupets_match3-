import {
  createInitialState,
  getEvolutionFormSelection,
  attemptSwap,
  selectEvolutionForm,
  selectFusionPartner,
} from "./game.js";
import { createSeededRng } from "./rng.js";

const MAX_ACTIONS = 500;

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

export function replayRun(seed, rawActions) {
  const rng = createSeededRng(seed);
  const actions = sanitizeRunActions(rawActions);
  let state = createInitialState({ diagonalAssist: true, rng });

  for (const action of actions) {
    if (state.victory) {
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

  return { state, actions };
}
