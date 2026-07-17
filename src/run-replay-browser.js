// Browser entrypoint. Keep these URLs aligned with main.js so replay recovery
// and live gameplay share one cache-busted instance of the engine modules.
import {
  COLORS,
  createInitialState,
  getChosenEvolutionForm,
  getEvolutionFormSelection,
  attemptSwap,
  selectEvolutionForm,
  selectFusionPartner,
} from "./game.js?v=20260717-special-spawn-1";
import { createSeededRng } from "./rng.js?v=20260710-1";
import { createRunReplayRuntime } from "./run-replay-core.js?v=20260717-replay-split-1";

const runtime = createRunReplayRuntime({
  COLORS,
  createInitialState,
  getChosenEvolutionForm,
  getEvolutionFormSelection,
  attemptSwap,
  selectEvolutionForm,
  selectFusionPartner,
  createSeededRng,
});

export const {
  PRODUCTION_RUN_OPTIONS,
  sanitizeRunActions,
  replayRun,
  getReplayResultSummary,
  getReplayCollectionTiles,
} = runtime;
