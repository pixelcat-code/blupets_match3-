// Tile/block SVG resolution, extracted from main.js.
//
// Pure with respect to app state: every function derives its result from the
// arguments passed in (a color id, optionally a game-state-like object) plus
// the static BASE_BLOCK_ASSETS table. No module globals, no DOM. This lets both
// main.js (board patching) and the render-game module share one source for
// "which SVG does this color show right now".
import { getChosenEvolutionForm } from "../game.js?v=20260717-special-spawn-1";

export const BASE_BLOCK_ASSETS = Object.freeze({
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

export function getBaseBlockAsset(colorId) {
  return BASE_BLOCK_ASSETS[colorId] ?? BASE_BLOCK_ASSETS.origin;
}

// Resolve the SVG a color currently shows: its chosen evolution form's asset if
// a state is supplied and the color has evolved, otherwise the base block.
// `stateLike` is optional — callers in the render path always pass it, but a
// null state cleanly falls back to the base asset.
export function getBlockAsset(colorId, stateLike = null) {
  const chosenForm = stateLike ? getChosenEvolutionForm(stateLike, colorId) : null;
  return chosenForm?.asset ?? getBaseBlockAsset(colorId);
}
