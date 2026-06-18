import test from "node:test";
import assert from "node:assert/strict";

import {
  attemptSwap,
  boardFromColorIds,
  createBoard,
  createInitialState,
  EVOLUTION_SCORE_BONUS,
  findMatches,
  findPossibleMoves,
  getBestProgressSummary,
  getChosenEvolutionForm,
  getEvolutionFormSelection,
  getProgressPercent,
  getTopPartnerOptions,
  hasPossibleMoves,
  HATCH_GOAL,
  NEUTRAL_VIBE,
  REROLL_MAX_CHARGES,
  REROLL_START_CHARGES,
  VIBES,
  rerollBoard,
  resolveBoard,
  selectEvolutionForm,
  selectFusionPartner,
} from "../src/game.js";
import {
  getCanonicalFamilyName,
  getCanonicalTierForm,
  getFamilyTileAsset,
} from "../src/blupets-canon.js";
import { createSeededRng } from "../src/rng.js";
import { replayRun } from "../src/run-replay.js";

function makeRng(seed = 1) {
  return createSeededRng(seed);
}

test("createBoard starts without pre-existing matches and has a valid move", () => {
  const board = createBoard(undefined, undefined, makeRng(1), true);
  assert.equal(findMatches(board).length, 0);
  assert.equal(findMatches(board, true).length, 0);
  assert.equal(hasPossibleMoves(board, true), true);
});

test("createInitialState seeds the new fusion-run state shape", () => {
  const state = createInitialState({
    diagonalAssist: false,
    rng: makeRng(2),
  });

  assert.equal(state.movesLeft >= 40, true);
  assert.equal(state.diagonalAssist, false);
  assert.equal(state.pendingEvolutionQueue.length, 0);
  assert.equal(state.evolutionTiers.red, 1);
  assert.deepEqual(Object.keys(state.evolutionChoices.red), ["2", "3", "4"]);
  assert.equal("_evolutionBonusCount" in state, false);
});

test("resolveBoard reports per-cascade cleared tiles without double counting", () => {
  const state = createInitialState({ rng: makeRng(3) });
  state.board = boardFromColorIds([
    ["red", "red", "red", "yellow", "green", "purple", "white", "cyan"],
    ["blue", "yellow", "green", "purple", "white", "cyan", "yellow", "black"],
    ["yellow", "green", "purple", "white", "cyan", "yellow", "black", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "black", "blue", "red"],
    ["purple", "white", "cyan", "yellow", "black", "blue", "red", "green"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ]);

  const result = resolveBoard(state.board, state, makeRng(4));
  const clearedFromSteps = result.cascadeSteps.reduce(
    (sum, step) => sum + step.clearedTiles.length,
    0,
  );

  assert.equal(result.cleared, clearedFromSteps);
  assert.ok(result.cascadeSteps[0].colorClearCounts.red >= 3);
  assert.ok(result.cascadeSteps[0].boardBeforeClear);
  assert.ok(result.cascadeSteps[0].boardAfterCollapse);
  assert.deepEqual(
    result.cascadeSteps.at(-1).boardAfterCollapse.map((row) => row.map((tile) => tile?.color ?? null)),
    result.board.map((row) => row.map((tile) => tile?.color ?? null)),
  );
});

test("attemptSwap increments matched color progress and queues evolution", () => {
  const state = createInitialState({
    diagonalAssist: false,
    rng: makeRng(5),
  });
  state.board = boardFromColorIds([
    ["red", "yellow", "red", "green", "purple", "white", "cyan", "black"],
    ["blue", "red", "yellow", "purple", "white", "cyan", "black", "yellow"],
    ["blue", "green", "purple", "white", "cyan", "black", "yellow", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "blue", "red", "green"],
    ["purple", "white", "cyan", "yellow", "black", "green", "purple", "white"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ]);
  state.colorMatchCounts.red = 9;

  const nextState = attemptSwap(state, { row: 0, col: 1 }, { row: 1, col: 1 }, makeRng(6));
  assert.equal(nextState.movesLeft, state.movesLeft - 1);
  assert.equal(nextState.pendingEvolutionQueue[0].colorId, "red");
  assert.equal(nextState.pendingEvolutionQueue[0].tier, 2);
});

test("invalid swap clears stale resolution metadata", () => {
  const state = createInitialState({
    diagonalAssist: false,
    rng: makeRng(15),
  });
  state.board = boardFromColorIds([
    ["red", "yellow", "red", "green", "purple", "white", "cyan", "black"],
    ["blue", "red", "yellow", "purple", "white", "cyan", "black", "yellow"],
    ["blue", "green", "purple", "white", "cyan", "black", "yellow", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "blue", "red", "green"],
    ["purple", "white", "cyan", "yellow", "black", "green", "purple", "white"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ]);

  const matchedState = attemptSwap(state, { row: 0, col: 1 }, { row: 1, col: 1 }, makeRng(16));
  assert.ok(matchedState._lastResolution);

  const invalidState = attemptSwap(
    {
      ...matchedState,
      pendingEvolutionQueue: [],
    },
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    makeRng(17),
  );

  assert.equal(invalidState.movesUsed, matchedState.movesUsed);
  assert.equal(invalidState._lastResolution, null);
});

test("Diagonal Assist allows diagonal swaps that create diagonal matches", () => {
  const state = createInitialState({
    diagonalAssist: true,
    rng: makeRng(61),
  });
  state.board = boardFromColorIds([
    ["red", "blue", "red"],
    ["green", "yellow", "purple"],
    ["black", "cyan", "red"],
  ]);

  const nextState = attemptSwap(state, { row: 1, col: 1 }, { row: 0, col: 2 }, makeRng(62));

  assert.equal(nextState.movesLeft, state.movesLeft - 1);
  assert.match(nextState.status, /Matched 3 tiles/);
});

test("hasPossibleMoves detects diagonal-only opportunities when Diagonal Assist is enabled", () => {
  const board = boardFromColorIds([
    ["red", "blue", "red"],
    ["green", "yellow", "purple"],
    ["black", "cyan", "red"],
  ]);

  assert.equal(hasPossibleMoves(board, false), false);
  assert.equal(hasPossibleMoves(board, true), true);
});

test("findPossibleMoves lists swaps that form a match without duplicating a pair", () => {
  const board = boardFromColorIds([
    ["red", "blue", "red"],
    ["green", "yellow", "purple"],
    ["black", "cyan", "red"],
  ]);

  assert.equal(findPossibleMoves(board, false).length, 0);

  const diagonalMoves = findPossibleMoves(board, true);
  assert.equal(diagonalMoves.length > 0, true);

  // Each move's swap actually produces a match, and no pair is reported twice.
  const seen = new Set();
  for (const { first, second } of diagonalMoves) {
    const swapped = boardFromColorIds(board.map((row) => row.map((tile) => tile.color)));
    const temp = swapped[first.row][first.col];
    swapped[first.row][first.col] = swapped[second.row][second.col];
    swapped[second.row][second.col] = temp;
    assert.equal(findMatches(swapped, true).length > 0, true);

    const key = [first.row, first.col, second.row, second.col].join(":");
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
});

test("same chosen evolution form can match across different base colors", () => {
  const state = createInitialState({ diagonalAssist: false, rng: makeRng(63) });
  const formKey = getEvolutionFormSelection(state, "red", 2, "blue").options[0].key;

  state.evolutionTiers.red = 2;
  state.evolutionTiers.blue = 2;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionFusions.blue = { partnerColorId: "red" };
  state.evolutionChoices.red[2] = formKey;
  state.evolutionChoices.blue[2] = formKey;
  state.board = boardFromColorIds([
    ["red", "yellow", "blue"],
    ["green", "red", "purple"],
    ["black", "cyan", "white"],
  ]);

  const nextState = attemptSwap(state, { row: 0, col: 1 }, { row: 1, col: 1 }, makeRng(64));

  assert.equal(nextState.movesLeft, state.movesLeft - 1);
  assert.match(nextState.status, /Matched 3 tiles/);
});

test("selecting a matching second form settles newly created same-form matches", () => {
  const state = createInitialState({ diagonalAssist: false, rng: makeRng(65) });
  const formKey = getEvolutionFormSelection(state, "red", 2, "blue").options[0].key;

  state.evolutionTiers.red = 2;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionChoices.red[2] = formKey;

  state.evolutionTiers.blue = 1;
  state.colorMatchCounts.blue = 10;
  state.evolutionFusions.blue = { partnerColorId: "red" };
  state.board = boardFromColorIds([
    ["red", "blue", "red"],
    ["green", "yellow", "purple"],
    ["black", "cyan", "white"],
  ]);
  state.pendingEvolutionQueue = [{ colorId: "blue", tier: 2, step: "form" }];

  const nextState = selectEvolutionForm(state, "blue", 2, formKey, makeRng(66));

  assert.equal(nextState.evolutionChoices.blue[2], formKey);
  assert.match(nextState.status, /Form resonance cleared 3 tiles/);
  assert.notDeepEqual(
    nextState.board.map((row) => row.map((tile) => tile?.color ?? null)),
    state.board.map((row) => row.map((tile) => tile?.color ?? null)),
  );
});

test("selectFusionPartner advances to T2 and keeps the queue item for form choice", () => {
  const state = createInitialState({ rng: makeRng(8), vibe: NEUTRAL_VIBE });
  state.colorMatchCounts.red = 10;
  state.colorMatchCounts.blue = 9;
  state.colorMatchCounts.green = 5;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 2, step: "partner" }];

  const nextState = selectFusionPartner(state, "red", "blue");
  assert.equal(nextState.evolutionTiers.red, 2);
  assert.equal(nextState.evolutionFusions.red.partnerColorId, "blue");
  assert.equal(nextState.pendingEvolutionQueue[0].step, "form");
  assert.equal(nextState.score, EVOLUTION_SCORE_BONUS[2]);
  assert.equal(nextState.colorMatchCounts.blue, Math.floor(9 * 0.6));
  assert.equal(nextState.colorMatchCounts.green, Math.floor(5 * 0.6));
});

test("selectFusionPartner allows choosing the same color as its own partner", () => {
  const state = createInitialState({ rng: makeRng(108), vibe: NEUTRAL_VIBE });
  state.colorMatchCounts.red = 10;
  state.colorMatchCounts.blue = 9;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 2, step: "partner" }];

  const options = getTopPartnerOptions(state, "red", 3);
  assert.equal(options[0].id, "red");

  const nextState = selectFusionPartner(state, "red", "red");
  assert.equal(nextState.evolutionTiers.red, 2);
  assert.equal(nextState.evolutionFusions.red.partnerColorId, "red");
  assert.equal(nextState.pendingEvolutionQueue[0].step, "form");
  assert.equal(nextState.score, EVOLUTION_SCORE_BONUS[2]);
});

test("selectEvolutionForm locks the chosen form and can finish the run at T4", () => {
  const state = createInitialState({ rng: makeRng(9), vibe: NEUTRAL_VIBE });
  state.evolutionTiers.red = 3;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.colorMatchCounts.red = 18;
  state.colorMatchCounts.blue = 11;
  state.colorMatchCounts.green = 7;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 4, step: "form" }];

  const selection = getEvolutionFormSelection(state, "red", 4);
  const nextState = selectEvolutionForm(state, "red", 4, selection.options[0].key);

  assert.equal(nextState.victory, true);
  assert.equal(nextState.pendingEvolutionQueue.length, 0);
  assert.equal(nextState.evolutionChoices.red[4], selection.options[0].key);
  assert.equal(nextState.score, EVOLUTION_SCORE_BONUS[4]);
  assert.equal(nextState.colorMatchCounts.blue, 0);
  assert.equal(nextState.colorMatchCounts.green, 0);
});

test("same T2 form syncs matching colors into T3 without doubling score bonus", () => {
  const state = createInitialState({ rng: makeRng(90) });
  const t2FormKey = getEvolutionFormSelection(state, "red", 2, "blue").options[0].key;

  state.evolutionTiers.red = 2;
  state.evolutionTiers.blue = 2;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionFusions.blue = { partnerColorId: "red" };
  state.evolutionChoices.red[2] = t2FormKey;
  state.evolutionChoices.blue[2] = t2FormKey;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 3, step: "form" }];

  const t3Selection = getEvolutionFormSelection(state, "red", 3);
  const nextState = selectEvolutionForm(state, "red", 3, t3Selection.options[0].key, makeRng(91));

  assert.equal(nextState.evolutionTiers.red, 3);
  assert.equal(nextState.evolutionTiers.blue, 3);
  assert.equal(nextState.evolutionChoices.blue[3], t3Selection.options[0].key);
  assert.equal(nextState.score, EVOLUTION_SCORE_BONUS[3]);
  assert.match(nextState.status, /synchronized to T3/);
});

test("same T3 form syncs matching colors into T4 without doubling score bonus", () => {
  const state = createInitialState({ rng: makeRng(92) });
  const t3FormKey = getEvolutionFormSelection(state, "red", 3, "blue").options[0].key;

  state.evolutionTiers.red = 3;
  state.evolutionTiers.blue = 3;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionFusions.blue = { partnerColorId: "red" };
  state.evolutionChoices.red[3] = t3FormKey;
  state.evolutionChoices.blue[3] = t3FormKey;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 4, step: "form" }];

  const t4Selection = getEvolutionFormSelection(state, "red", 4);
  const nextState = selectEvolutionForm(state, "red", 4, t4Selection.options[0].key, makeRng(93));

  assert.equal(nextState.evolutionTiers.red, 4);
  assert.equal(nextState.evolutionTiers.blue, 4);
  assert.equal(nextState.evolutionChoices.blue[4], t4Selection.options[0].key);
  assert.equal(nextState.score, EVOLUTION_SCORE_BONUS[4]);
  assert.equal(nextState.victory, true);
});

test("rerollBoard preserves evolution progress and restores failed runs", () => {
  const state = createInitialState({ diagonalAssist: true, rng: makeRng(11) });
  state.rerollCharges = 1;
  state.evolutionTiers.red = 3;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionChoices.red[2] = "T2_VIOLET_POISON";
  state.score = 980;
  state.movesLeft = 0;
  state.gameOver = true;
  const previousBoard = state.board;

  const nextState = rerollBoard(state, makeRng(12));
  assert.equal(nextState.evolutionTiers.red, 3);
  assert.equal(nextState.evolutionFusions.red.partnerColorId, "blue");
  assert.equal(nextState.score, 980);
  assert.notEqual(nextState.board, previousBoard);
  assert.ok(nextState.movesLeft >= 8);
});

test("rerollBoard avoids pre-existing matches under current evolved form resolver", () => {
  const state = createInitialState({ diagonalAssist: true, rng: makeRng(111) });
  const formKey = getEvolutionFormSelection(state, "red", 2, "blue").options[0].key;
  state.evolutionTiers.red = 2;
  state.evolutionTiers.blue = 2;
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionFusions.blue = { partnerColorId: "red" };
  state.evolutionChoices.red[2] = formKey;
  state.evolutionChoices.blue[2] = formKey;
  state.rerollCharges = 1;

  const nextState = rerollBoard(state, makeRng(112));
  const matchResolver = (tile) => {
    if (!tile) {
      return null;
    }
    if (tile.color === "red" || tile.color === "blue") {
      return `FORM:2:${formKey}`;
    }
    return tile.color;
  };

  assert.equal(findMatches(nextState.board, true, matchResolver).length, 0);
  assert.equal(hasPossibleMoves(nextState.board, true, matchResolver), true);
});

test("hatch reroll economy: new runs seed no charges and an empty meter", () => {
  const state = createInitialState({ rng: makeRng(11) });
  assert.equal(state.rerollCharges, REROLL_START_CHARGES);
  assert.equal(state.hatchProgress, 0);
});

test("attemptSwap feeds the hatch meter", () => {
  const state = createInitialState({ diagonalAssist: false, rng: makeRng(5) });
  state.board = boardFromColorIds([
    ["red", "yellow", "red", "green", "purple", "white", "cyan", "black"],
    ["blue", "red", "yellow", "purple", "white", "cyan", "black", "yellow"],
    ["blue", "green", "purple", "white", "cyan", "black", "yellow", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "blue", "red", "green"],
    ["purple", "white", "cyan", "yellow", "black", "green", "purple", "white"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ]);

  const nextState = attemptSwap(state, { row: 0, col: 1 }, { row: 1, col: 1 }, makeRng(6));
  assert.ok(nextState.hatchProgress > 0);
});

test("a full meter hatches an extra reroll charge", () => {
  const state = createInitialState({ diagonalAssist: false, rng: makeRng(5) });
  state.board = boardFromColorIds([
    ["red", "yellow", "red", "green", "purple", "white", "cyan", "black"],
    ["blue", "red", "yellow", "purple", "white", "cyan", "black", "yellow"],
    ["blue", "green", "purple", "white", "cyan", "black", "yellow", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "blue", "red", "green"],
    ["purple", "white", "cyan", "yellow", "black", "green", "purple", "white"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ]);
  state.hatchProgress = HATCH_GOAL - 1;

  const nextState = attemptSwap(state, { row: 0, col: 1 }, { row: 1, col: 1 }, makeRng(6));
  assert.equal(nextState.rerollCharges, REROLL_START_CHARGES + 1);
  assert.ok(nextState.hatchProgress < HATCH_GOAL);
});

test("rerollBoard spends a charge and refuses at zero", () => {
  const state = createInitialState({ rng: makeRng(11) });
  state.rerollCharges = 1;

  const afterOne = rerollBoard(state, makeRng(12));
  assert.equal(afterOne.rerollCharges, 0);
  assert.notEqual(afterOne.board, state.board);

  const blockedBoard = afterOne.board;
  const blocked = rerollBoard(afterOne, makeRng(13));
  assert.equal(blocked.rerollCharges, 0);
  assert.equal(blocked.board, blockedBoard);
});

test("hatch charges never exceed the cap", () => {
  const state = createInitialState({ diagonalAssist: false, rng: makeRng(5) });
  state.board = boardFromColorIds([
    ["red", "yellow", "red", "green", "purple", "white", "cyan", "black"],
    ["blue", "red", "yellow", "purple", "white", "cyan", "black", "yellow"],
    ["blue", "green", "purple", "white", "cyan", "black", "yellow", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "blue", "red", "green"],
    ["purple", "white", "cyan", "yellow", "black", "green", "purple", "white"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ]);
  state.rerollCharges = REROLL_MAX_CHARGES;
  state.hatchProgress = HATCH_GOAL - 1;

  const nextState = attemptSwap(state, { row: 0, col: 1 }, { row: 1, col: 1 }, makeRng(6));
  assert.equal(nextState.rerollCharges, REROLL_MAX_CHARGES);
  assert.ok(nextState.hatchProgress <= HATCH_GOAL);
});

test("rollback decay cancels another color's queued evolution", () => {
  const state = createInitialState({ rng: makeRng(11), vibe: NEUTRAL_VIBE });
  // red and blue both hit the T1->T2 threshold (10) this turn; green stays high.
  state.colorMatchCounts.red = 10;
  state.colorMatchCounts.blue = 10;
  state.colorMatchCounts.green = 40;
  state.pendingEvolutionQueue = [
    { colorId: "red", tier: 2, step: "partner" },
    { colorId: "blue", tier: 2, step: "partner" },
    { colorId: "green", tier: 2, step: "partner" },
  ];

  // Evolving red decays the others (kept 60%): blue 10->6 (below threshold,
  // cancelled) but green 40->24 (still above, kept).
  const next = selectFusionPartner(state, "red", "yellow");
  const queuedColors = next.pendingEvolutionQueue.map((item) => item.colorId);
  assert.equal(queuedColors.includes("blue"), false);
  assert.equal(queuedColors.includes("green"), true);
  assert.equal(queuedColors.includes("red"), true); // red still mid-evolution (form pick)
});

test("progress helpers report summary against the current tier threshold", () => {
  const state = createInitialState({ rng: makeRng(13), vibe: NEUTRAL_VIBE });
  state.colorMatchCounts.green = 5;

  assert.equal(getProgressPercent(state, "green"), 50);
  assert.equal(getBestProgressSummary(state), "Green reached T1 with 50% toward T2.");
});

test("canonical families resolve to official lineage names", () => {
  assert.equal(getCanonicalFamilyName("red", "red"), "Heat");
  assert.equal(getCanonicalFamilyName("red", "blue"), "Violet");
});

test("canonical tier forms remain deterministic for a token", () => {
  const first = getCanonicalTierForm("red", "red", 2, 4242);
  const second = getCanonicalTierForm("red", "red", 2, 4242);
  const apex = getCanonicalTierForm("red", "red", 4, 4242);

  assert.deepEqual(first, second);
  assert.equal(first.asset.startsWith("./assets/evolution/heat/t2/"), true);
  assert.equal(apex.name, "Pyronix");
});

test("family tile assets switch to evolved art only for active lineage colors", () => {
  const mixedFamilyAsset = getFamilyTileAsset("red", "blue", 2, 4242, "red");

  assert.equal(
    getFamilyTileAsset("red", "blue", 2, 4242, "blue"),
    mixedFamilyAsset,
  );
  assert.equal(
    mixedFamilyAsset.startsWith("./assets/evolution/violet/t2/"),
    true,
  );
  assert.equal(getFamilyTileAsset("red", "blue", 2, 4242, "yellow"), null);
  assert.equal(getFamilyTileAsset("red", "blue", 1, 4242, "red"), null);
});

test("chosen evolution form is returned only after the player locks it", () => {
  const state = createInitialState({ rng: makeRng(14) });
  state.evolutionFusions.red = { partnerColorId: "blue" };
  state.evolutionTiers.red = 2;

  assert.equal(getChosenEvolutionForm(state, "red"), null);

  const selection = getEvolutionFormSelection(state, "red", 2);
  state.evolutionChoices.red[2] = selection.options[0].key;

  assert.equal(getChosenEvolutionForm(state, "red")?.key, selection.options[0].key);
});

function vibeBudget(vibe) {
  return (
    (vibe.startMoves ?? 0) +
    (vibe.scoreMultiplier ? Math.round((vibe.scoreMultiplier - 1) * 10) : 0) +
    (vibe.startEssence ?? 0) / 3 +
    (vibe.remainingMoveScore ?? 0) / 30 +
    (vibe.comboEssence ?? 0) * 2 +
    (vibe.decayResist ?? 0) / 0.15 * 2 +
    (vibe.evolveMoves ?? 0) * 3 +
    (vibe.evolutionAura ?? 0) * 3 +
    (vibe.tierScoreBonus ?? 0) / 0.07 * 3
  );
}

test("the vibe generator yields 64 equally-budgeted, named vibes", () => {
  assert.equal(VIBES.length, 64);

  const names = new Set(VIBES.map((vibe) => vibe.label));
  assert.equal(names.size, 64);

  for (const vibe of VIBES) {
    assert.ok(vibe.blurb.length > 0, `${vibe.id} has a blurb`);
    assert.equal(vibeBudget(vibe), 4, `${vibe.id} spends exactly 4 points`);
  }
});

test("evolveMoves vibe grants moves on each tier promotion", () => {
  const state = createInitialState({
    rng: makeRng(80),
    vibe: { ...NEUTRAL_VIBE, evolveMoves: 2 },
  });
  state.colorMatchCounts.red = 10;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 2, step: "partner" }];

  const before = state.movesLeft;
  const nextState = selectFusionPartner(state, "red", "blue");

  assert.equal(nextState.evolutionTiers.red, 2);
  assert.equal(nextState.movesLeft, before + 2);
});

test("decayResist vibe softens the decay applied to other colors", () => {
  const state = createInitialState({
    rng: makeRng(81),
    vibe: { ...NEUTRAL_VIBE, decayResist: 0.5 },
  });
  state.colorMatchCounts.red = 10;
  state.colorMatchCounts.blue = 9;
  state.pendingEvolutionQueue = [{ colorId: "red", tier: 2, step: "partner" }];

  const nextState = selectFusionPartner(state, "red", "blue");

  // Base T2 keeps 60%; resist halves the 40% loss → keeps 80% → floor(9 * 0.8).
  assert.equal(nextState.colorMatchCounts.blue, Math.floor(9 * 0.8));
});

test("startEssence vibe pre-charges exactly one color", () => {
  const state = createInitialState({
    rng: makeRng(82),
    vibe: { ...NEUTRAL_VIBE, startEssence: 10 },
  });

  const total = Object.values(state.colorMatchCounts).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 10);
});

test("comboEssence vibe grants bonus essence on 5+ matches", () => {
  const board = [
    ["red", "red", "green", "red", "red", "purple", "white", "cyan"],
    ["blue", "yellow", "red", "green", "white", "cyan", "black", "yellow"],
    ["yellow", "green", "purple", "white", "cyan", "yellow", "black", "blue"],
    ["green", "purple", "white", "cyan", "yellow", "black", "blue", "red"],
    ["purple", "white", "cyan", "yellow", "black", "blue", "red", "green"],
    ["white", "cyan", "yellow", "black", "blue", "red", "green", "purple"],
    ["cyan", "yellow", "black", "blue", "red", "green", "purple", "white"],
    ["yellow", "black", "blue", "red", "green", "purple", "white", "cyan"],
  ];
  const first = { row: 0, col: 2 };
  const second = { row: 1, col: 2 };

  const base = createInitialState({ diagonalAssist: false, rng: makeRng(83), vibe: NEUTRAL_VIBE });
  base.board = boardFromColorIds(board);
  const baseResult = attemptSwap(base, first, second, makeRng(84));

  const boosted = createInitialState({
    diagonalAssist: false,
    rng: makeRng(83),
    vibe: { ...NEUTRAL_VIBE, comboEssence: 3 },
  });
  boosted.board = boardFromColorIds(board);
  const boostedResult = attemptSwap(boosted, first, second, makeRng(84));

  // The swap forms a red 5-in-a-row, so the comboEssence vibe must earn red more
  // essence than the neutral run off the identical board and rng.
  assert.ok(boostedResult.colorMatchCounts.red > baseResult.colorMatchCounts.red);
});

test("trusted replay recomputes a submitted run from seed and action log", () => {
  const seed = 83;
  const first = { row: 0, col: 1 };
  const second = { row: 1, col: 1 };
  const actions = [{ type: "swap", first, second }];
  const replayed = replayRun(seed, actions).state;

  const rng = makeRng(seed);
  const manual = createInitialState({ diagonalAssist: true, rng });
  const expected = attemptSwap(manual, first, second, rng);

  assert.equal(replayed.score, expected.score);
  assert.equal(replayed.movesUsed, expected.movesUsed);
  assert.deepEqual(replayed.colorMatchCounts, expected.colorMatchCounts);
});

test("replayRun: movesUsed is a non-negative integer tracked per matching swap", () => {
  // Verifies the field the submit-run guard (movesUsed >= 5) depends on.
  // movesUsed is only incremented when a swap produces a match;
  // invalid swaps are ignored. 5 arbitrary swaps yield 0..5 movesUsed.
  const { state } = replayRun(1, [
    { type: "swap", first: { row: 0, col: 0 }, second: { row: 0, col: 1 } },
    { type: "swap", first: { row: 1, col: 0 }, second: { row: 1, col: 1 } },
    { type: "swap", first: { row: 2, col: 0 }, second: { row: 2, col: 1 } },
    { type: "swap", first: { row: 3, col: 0 }, second: { row: 3, col: 1 } },
    { type: "swap", first: { row: 4, col: 0 }, second: { row: 4, col: 1 } },
  ]);
  assert.ok(typeof state.movesUsed === "number", "movesUsed must be a number");
  assert.ok(state.movesUsed >= 0, "movesUsed must be non-negative");
  assert.ok(state.movesUsed <= 5, "movesUsed cannot exceed number of attempted swaps");
});
