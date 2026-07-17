import {
  getCanonicalFamily,
  getCanonicalTierForm,
  getCanonicalTierTitle,
} from "./blupets-canon.js";
import { VIBES, NEUTRAL_VIBE } from "./vibes.js";

export { VIBES, NEUTRAL_VIBE };

export const COLORS = [
  { id: "yellow", label: "Yellow", hex: "#f7be21" },
  { id: "black", label: "Black", hex: "#39414c" },
  { id: "blue", label: "Blue", hex: "#3b86f7" },
  { id: "cyan", label: "Cyan", hex: "#42dbde" },
  { id: "green", label: "Green", hex: "#73c75d" },
  { id: "purple", label: "Purple", hex: "#9355ea" },
  { id: "red", label: "Red", hex: "#ff4d5a" },
  { id: "white", label: "White", hex: "#dfe8ef" },
];

export const BOARDSIZE = 8;
export const BOARD_SIZE = BOARDSIZE;
export const STARTMOVES = 40;
export const START_MOVES = STARTMOVES;
export const EVOLUTION_THRESHOLDS = {
  1: 8,
  2: 10,
  3: 10,
  4: 0,
};
export const EVOLUTION_SCORE_BONUS = {
  2: 500,
  3: 1500,
  4: 5000,
};
export const EVOLUTION_DECAY = {
  2: 0.6,
  3: 0.5,
  4: 0,
};

const COLOR_BY_ID = Object.fromEntries(COLORS.map((color) => [color.id, color]));
let nextTileId = 1;

function makeTile(color) {
  return {
    id: nextTileId++,
    color,
  };
}

// --- Special tiles (power-ups created by big matches) -----------------------
// A straight match of exactly 4 spawns a CROSS (clears its whole row AND its
// whole column when later detonated). A straight match of 5+, or an L/T
// intersection of a horizontal and a vertical 3-line, spawns a BOMB (clears the
// 3x3 area around it). Specials sit on the board when created and detonate when
// later caught in a match; their blast chains into any other specials it hits.
// The whole system is gated behind state.specialTiles, so behaviour is
// unchanged when it is off.
function blastCellsFor(size, pos, tile) {
  const cells = [];
  if (tile.special === "cross") {
    for (let col = 0; col < size; col += 1) {
      cells.push({ row: pos.row, col });
    }
    for (let row = 0; row < size; row += 1) {
      cells.push({ row, col: pos.col });
    }
  } else if (tile.special === "bomb") {
    for (let row = pos.row - 1; row <= pos.row + 1; row += 1) {
      for (let col = pos.col - 1; col <= pos.col + 1; col += 1) {
        if (row >= 0 && row < size && col >= 0 && col < size) {
          cells.push({ row, col });
        }
      }
    }
  }
  return cells;
}

// Given the matched line groups of one cascade step, decide which cells should
// become special tiles. Returns a Map of "row:col" -> spawn spec. Bomb spawns
// outrank cross spawns when they collide on the same cell.
function planSpecialSpawns(groups, board) {
  const spawns = new Map();
  const horizMembers = new Set();
  const vertMembers = new Set();

  const consider = (pos, special, dir) => {
    const key = keyFor(pos.row, pos.col);
    const existing = spawns.get(key);
    if (existing && (existing.special === "bomb" || special !== "bomb")) {
      return;
    }
    const tile = board[pos.row][pos.col];
    spawns.set(key, {
      row: pos.row,
      col: pos.col,
      special,
      dir,
      color: tile ? tile.color : null,
    });
  };

  for (const group of groups) {
    const horizontal = group.length >= 2 && group[0].row === group[1].row;
    for (const pos of group) {
      (horizontal ? horizMembers : vertMembers).add(keyFor(pos.row, pos.col));
    }
    if (group.length >= 4) {
      const mid = group[Math.floor(group.length / 2)];
      // Exactly 4 -> CROSS (row + column); 5+ -> BOMB. Cross ignores dir.
      consider(mid, group.length >= 5 ? "bomb" : "cross", null);
    }
  }

  // L/T shapes surface as a cell shared by a horizontal and a vertical 3-line.
  for (const key of horizMembers) {
    if (vertMembers.has(key)) {
      const [row, col] = key.split(":").map(Number);
      consider({ row, col }, "bomb", null);
    }
  }

  return spawns;
}

export function randomFrom(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

function keyFor(row, col) {
  return `${row}:${col}`;
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function findTilePositionById(board, id) {
  if (id == null) {
    return null;
  }
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col]?.id === id) {
        return { row, col };
      }
    }
  }
  return null;
}

function emptyCountMap() {
  return Object.fromEntries(COLORS.map((color) => [color.id, 0]));
}

function defaultMatchResolver(tile) {
  return tile?.color ?? null;
}

export function boardFromColorIds(matrix) {
  return matrix.map((row) => row.map((color) => (color ? makeTile(color) : null)));
}

export function boardToColorIds(board) {
  return board.map((row) => row.map((tile) => tile?.color ?? null));
}

export function getColor(id) {
  return COLOR_BY_ID[id];
}

export function createBoard(
  size = BOARDSIZE,
  palette = COLORS.map((color) => color.id),
  rng = Math.random,
  diagonalAssist = false,
  matchResolver = defaultMatchResolver,
  diagonalSwaps = diagonalAssist,
) {
  const matchKeyForColor = (color, row, col) => matchResolver({ color }, row, col) ?? null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board = Array.from({ length: size }, () => Array(size).fill(null));

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const forbidden = new Set();

        if (
          col >= 2 &&
          board[row][col - 1] &&
          board[row][col - 2] &&
          matchResolver(board[row][col - 1], row, col - 1) ===
            matchResolver(board[row][col - 2], row, col - 2)
        ) {
          forbidden.add(matchResolver(board[row][col - 1], row, col - 1));
        }

        if (
          row >= 2 &&
          board[row - 1][col] &&
          board[row - 2][col] &&
          matchResolver(board[row - 1][col], row - 1, col) ===
            matchResolver(board[row - 2][col], row - 2, col)
        ) {
          forbidden.add(matchResolver(board[row - 1][col], row - 1, col));
        }

        if (
          diagonalAssist &&
          row >= 2 &&
          col >= 2 &&
          board[row - 1][col - 1] &&
          board[row - 2][col - 2] &&
          matchResolver(board[row - 1][col - 1], row - 1, col - 1) ===
            matchResolver(board[row - 2][col - 2], row - 2, col - 2)
        ) {
          forbidden.add(matchResolver(board[row - 1][col - 1], row - 1, col - 1));
        }

        if (
          diagonalAssist &&
          row >= 2 &&
          col + 2 < size &&
          board[row - 1][col + 1] &&
          board[row - 2][col + 2] &&
          matchResolver(board[row - 1][col + 1], row - 1, col + 1) ===
            matchResolver(board[row - 2][col + 2], row - 2, col + 2)
        ) {
          forbidden.add(matchResolver(board[row - 1][col + 1], row - 1, col + 1));
        }

        const choices = palette.filter((entry) => !forbidden.has(matchKeyForColor(entry, row, col)));
        board[row][col] = makeTile(randomFrom(choices, rng));
      }
    }

    if (hasPossibleMoves(board, diagonalAssist, matchResolver, diagonalSwaps)) {
      return board;
    }
  }

  throw new Error("Unable to create a playable board.");
}

function findLineMatches(board, startRow, startCol, deltaRow, deltaCol, matchResolver) {
  const groups = [];
  const size = board.length;
  let row = startRow;
  let col = startCol;
  let chain = [];
  let activeColor = null;

  while (row >= 0 && row < size && col >= 0 && col < size) {
    const tile = board[row][col];
    const color = matchResolver(tile, row, col) ?? null;

    if (color && color === activeColor) {
      chain.push({ row, col });
    } else {
      if (chain.length >= 3) {
        groups.push(chain);
      }

      chain = color ? [{ row, col }] : [];
      activeColor = color;
    }

    row += deltaRow;
    col += deltaCol;
  }

  if (chain.length >= 3) {
    groups.push(chain);
  }

  return groups;
}

export function findMatches(board, diagonalAssist = false, matchResolver = defaultMatchResolver) {
  const groups = [];
  const size = board.length;

  for (let row = 0; row < size; row += 1) {
    groups.push(...findLineMatches(board, row, 0, 0, 1, matchResolver));
  }

  for (let col = 0; col < size; col += 1) {
    groups.push(...findLineMatches(board, 0, col, 1, 0, matchResolver));
  }

  if (diagonalAssist) {
    for (let col = 0; col < size; col += 1) {
      groups.push(...findLineMatches(board, 0, col, 1, 1, matchResolver));
    }

    for (let row = 1; row < size; row += 1) {
      groups.push(...findLineMatches(board, row, 0, 1, 1, matchResolver));
    }

    for (let col = 0; col < size; col += 1) {
      groups.push(...findLineMatches(board, 0, col, 1, -1, matchResolver));
    }

    for (let row = 1; row < size; row += 1) {
      groups.push(...findLineMatches(board, row, size - 1, 1, -1, matchResolver));
    }
  }

  return groups;
}

const REFILL_DEADLOCK_ATTEMPTS = 30;

function collapseBoard(
  board,
  rng = Math.random,
  diagonalAssist = false,
  matchResolver = defaultMatchResolver,
  diagonalSwaps = diagonalAssist,
) {
  const size = board.length;
  const palette = COLORS.map((color) => color.id);
  const spawned = [];

  for (let col = 0; col < size; col += 1) {
    const column = [];

    for (let row = size - 1; row >= 0; row -= 1) {
      const tile = board[row][col];
      if (tile) {
        column.push(tile);
      }
    }

    for (let row = size - 1, index = 0; row >= 0; row -= 1, index += 1) {
      board[row][col] = column[index] ?? null;
    }

    for (let row = 0; row < size; row += 1) {
      if (!board[row][col]) {
        board[row][col] = makeTile(randomFrom(palette, rng));
        spawned.push({ row, col });
      }
    }
  }

  // Anti-deadlock refill: if the board settled with no matches AND no legal move,
  // re-roll only the just-spawned tiles a few times before the caller has to fall
  // back to a full reshuffle. Existing tiles stay put, so it's far less disruptive
  // than rerolling the whole board; if every attempt fails we leave it for the
  // caller's reshuffle safety net (worst case = the old behavior).
  if (
    spawned.length > 0 &&
    findMatches(board, diagonalAssist, matchResolver).length === 0 &&
    !hasPossibleMoves(board, diagonalAssist, matchResolver, diagonalSwaps)
  ) {
    for (let attempt = 0; attempt < REFILL_DEADLOCK_ATTEMPTS; attempt += 1) {
      for (const cell of spawned) {
        board[cell.row][cell.col] = makeTile(randomFrom(palette, rng));
      }
      // A re-roll that lands an immediate match is fine — the caller's cascade
      // loop resolves it. Either way, stop once the board is playable again.
      if (
        findMatches(board, diagonalAssist, matchResolver).length > 0 ||
        hasPossibleMoves(board, diagonalAssist, matchResolver, diagonalSwaps)
      ) {
        break;
      }
    }
  }
}

function swapInBoard(board, first, second) {
  const nextBoard = cloneBoard(board);
  const temp = nextBoard[first.row][first.col];
  nextBoard[first.row][first.col] = nextBoard[second.row][second.col];
  nextBoard[second.row][second.col] = temp;
  return nextBoard;
}

export function previewSwap(board, first, second) {
  return swapInBoard(board, first, second);
}

export function areAdjacent(first, second, allowDiagonal = false) {
  const rowDelta = Math.abs(first.row - second.row);
  const colDelta = Math.abs(first.col - second.col);

  if (rowDelta === 0 && colDelta === 0) {
    return false;
  }

  return allowDiagonal
    ? rowDelta <= 1 && colDelta <= 1
    : rowDelta + colDelta === 1;
}

export function hasPossibleMoves(
  board,
  diagonalAssist = false,
  matchResolver = defaultMatchResolver,
  diagonalSwaps = diagonalAssist,
) {
  const size = board.length;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const current = { row, col };
      const right = { row, col: col + 1 };
      const down = { row: row + 1, col };
      const downRight = { row: row + 1, col: col + 1 };
      const downLeft = { row: row + 1, col: col - 1 };

      if (
        col + 1 < size &&
        findMatches(swapInBoard(board, current, right), diagonalAssist, matchResolver).length > 0
      ) {
        return true;
      }

      if (
        row + 1 < size &&
        findMatches(swapInBoard(board, current, down), diagonalAssist, matchResolver).length > 0
      ) {
        return true;
      }

      if (
        diagonalSwaps &&
        row + 1 < size &&
        col + 1 < size &&
        findMatches(swapInBoard(board, current, downRight), diagonalAssist, matchResolver).length > 0
      ) {
        return true;
      }

      if (
        diagonalSwaps &&
        row + 1 < size &&
        col - 1 >= 0 &&
        findMatches(swapInBoard(board, current, downLeft), diagonalAssist, matchResolver).length > 0
      ) {
        return true;
      }
    }
  }

  return false;
}

// Like hasPossibleMoves, but returns every swap that would form a match instead
// of bailing on the first one. Used by the idle hint loop to wobble the tiles of
// one move at a time. Each adjacency is visited once (right / down / the two
// downward diagonals) so a pair is never reported twice.
export function findPossibleMoves(
  board,
  diagonalAssist = false,
  matchResolver = defaultMatchResolver,
  diagonalSwaps = diagonalAssist,
) {
  const size = board.length;
  const moves = [];

  const consider = (first, second) => {
    if (findMatches(swapInBoard(board, first, second), diagonalAssist, matchResolver).length > 0) {
      moves.push({ first, second });
    }
  };

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const current = { row, col };

      if (col + 1 < size) {
        consider(current, { row, col: col + 1 });
      }
      if (row + 1 < size) {
        consider(current, { row: row + 1, col });
      }
      if (diagonalSwaps && row + 1 < size && col + 1 < size) {
        consider(current, { row: row + 1, col: col + 1 });
      }
      if (diagonalSwaps && row + 1 < size && col - 1 >= 0) {
        consider(current, { row: row + 1, col: col - 1 });
      }
    }
  }

  return moves;
}

function getFamilyPair(state, colorId, partnerOverride = null) {
  const partnerColorId = partnerOverride ?? state.evolutionFusions[colorId]?.partnerColorId ?? colorId;
  return [colorId, partnerColorId];
}

function getThresholdForTier(tier) {
  return EVOLUTION_THRESHOLDS[tier] ?? 0;
}

function buildQueueItem(state, colorId, tier) {
  return {
    colorId,
    tier,
    step: tier === 2 && !state.evolutionFusions[colorId] ? "partner" : "form",
  };
}

function hasQueuedEvolution(queue, colorId, tier) {
  return queue.some((item) => item.colorId === colorId && item.tier === tier);
}

function queueTriggeredEvolutions(state) {
  if (state.victory) {
    return state;
  }

  const pendingEvolutionQueue = [...state.pendingEvolutionQueue];
  const thresholdOrder = state.colorThresholdOrder ?? {};

  const ready = [];
  COLORS.forEach((color, colorIndex) => {
    const currentTier = state.evolutionTiers[color.id];
    if (currentTier >= 4) {
      return;
    }

    const threshold = getThresholdForTier(currentTier);
    if (threshold <= 0 || state.colorMatchCounts[color.id] < threshold) {
      return;
    }

    const nextTier = currentTier + 1;
    if (hasQueuedEvolution(pendingEvolutionQueue, color.id, nextTier)) {
      return;
    }

    ready.push({ colorId: color.id, nextTier, colorIndex });
  });

  // Evolve in fill order: colors with a recorded threshold-crossing order go
  // first (lowest order = filled earliest); any without one fall back to the
  // stable COLORS index so behavior is deterministic.
  ready.sort((a, b) => {
    const ao = thresholdOrder[a.colorId];
    const bo = thresholdOrder[b.colorId];
    if (ao != null && bo != null) {
      return ao - bo;
    }
    if (ao != null) {
      return -1;
    }
    if (bo != null) {
      return 1;
    }
    return a.colorIndex - b.colorIndex;
  });

  for (const item of ready) {
    pendingEvolutionQueue.push(buildQueueItem(state, item.colorId, item.nextTier));
  }

  if (pendingEvolutionQueue.length === state.pendingEvolutionQueue.length) {
    return state;
  }

  return {
    ...state,
    pendingEvolutionQueue,
  };
}

function markGameOverIfNeeded(state) {
  if (state.victory || state.pendingEvolutionQueue.length > 0) {
    return state;
  }

  if (state.movesLeft > 0) {
    return state;
  }

  return {
    ...state,
    gameOver: true,
    status: state.endlessRun
      ? "No moves left — run over."
      : "No moves left. Your strongest Blupet stalled before T4.",
  };
}

// Test-only alias so the suite can exercise the (otherwise module-private)
// end-of-run check directly.
export function markGameOverIfNeededForTest(state) {
  return markGameOverIfNeeded(state);
}

function decayOtherColors(colorMatchCounts, colorId, tier, decayResist = 0) {
  const baseKept = EVOLUTION_DECAY[tier] ?? 1;
  // decayResist shrinks the amount LOST, not the amount kept: at resist 0 the
  // kept fraction equals the base decay (backward compatible).
  const keptFraction = 1 - (1 - baseKept) * (1 - decayResist);
  const nextCounts = { ...colorMatchCounts };

  for (const id of Object.keys(nextCounts)) {
    if (id === colorId) {
      continue;
    }

    nextCounts[id] = Math.floor(nextCounts[id] * keptFraction);
  }

  return nextCounts;
}

function promoteColorTier(state, colorId, tier) {
  const previousTier = state.evolutionTiers[colorId];
  if (tier <= previousTier) {
    return state;
  }

  const threshold = getThresholdForTier(previousTier);
  const progressedCounts = {
    ...state.colorMatchCounts,
    [colorId]:
      tier === 4
        ? 0
        : Math.max(0, state.colorMatchCounts[colorId] - threshold),
  };

  // Drop this color's threshold-crossing stamp now that it has evolved, so its
  // next tier earns a fresh fill-order timestamp instead of reusing the old one.
  const nextThresholdOrder = { ...(state.colorThresholdOrder ?? {}) };
  delete nextThresholdOrder[colorId];

  return {
    ...state,
    colorMatchCounts: decayOtherColors(
      progressedCounts,
      colorId,
      tier,
      state.vibe.decayResist ?? 0,
    ),
    colorThresholdOrder: nextThresholdOrder,
    evolutionTiers: {
      ...state.evolutionTiers,
      [colorId]: tier,
    },
    score: state.score + (EVOLUTION_SCORE_BONUS[tier] ?? 0),
    movesLeft: state.movesLeft + (state.vibe.evolveMoves ?? 0),
    evolutionAuraMovesLeft: state.vibe.evolutionAura ? 2 : (state.evolutionAuraMovesLeft ?? 0),
  };
}

function getSameFormSyncPeers(state, colorId, sourceTier) {
  if (sourceTier <= 1) {
    return [];
  }

  const sourceFormKey = state.evolutionChoices[colorId]?.[sourceTier] ?? null;
  if (!sourceFormKey) {
    return [];
  }

  return COLORS.map((color) => color.id).filter(
    (peerColorId) =>
      peerColorId !== colorId &&
      state.evolutionTiers[peerColorId] === sourceTier &&
      state.evolutionChoices[peerColorId]?.[sourceTier] === sourceFormKey,
  );
}

function synchronizeSameFormTier(state, previousState, colorId, tier, formKey) {
  const sourceTier = tier - 1;
  const peerColorIds = getSameFormSyncPeers(previousState, colorId, sourceTier);
  if (peerColorIds.length === 0) {
    return state;
  }

  const evolutionTiers = { ...state.evolutionTiers };
  const evolutionChoices = { ...state.evolutionChoices };

  for (const peerColorId of peerColorIds) {
    evolutionTiers[peerColorId] = Math.max(evolutionTiers[peerColorId], tier);
    evolutionChoices[peerColorId] = {
      ...evolutionChoices[peerColorId],
      [tier]: formKey,
    };
  }

  const pendingEvolutionQueue = state.pendingEvolutionQueue.filter(
    (item) => !peerColorIds.includes(item.colorId) || item.tier > tier,
  );

  return {
    ...state,
    evolutionTiers,
    evolutionChoices,
    pendingEvolutionQueue,
    status: `${state.status} ${peerColorIds.map((id) => getColor(id).label).join(" + ")} synchronized to T${tier}.`,
  };
}

function removeFirstPending(state) {
  return {
    ...state,
    pendingEvolutionQueue: state.pendingEvolutionQueue.slice(1),
  };
}

// When one color evolves it decays every other color (decayOtherColors). A color
// that was ALSO queued to evolve this turn can be knocked back below its
// threshold by that rollback — its pending evolution must then be cancelled.
// A color already promoted to the queued tier (e.g. a T2 mid-pick waiting on its
// form) is exempt: its current tier no longer equals the queued tier minus one.
function pruneStaleEvolutions(state) {
  const pendingEvolutionQueue = state.pendingEvolutionQueue.filter((item) => {
    const fromTier = item.tier - 1;
    if (state.evolutionTiers[item.colorId] !== fromTier) {
      return true;
    }

    return state.colorMatchCounts[item.colorId] >= getThresholdForTier(fromTier);
  });

  if (pendingEvolutionQueue.length === state.pendingEvolutionQueue.length) {
    return state;
  }

  return { ...state, pendingEvolutionQueue };
}

function resolveFallbackForm(colorId, partnerColorId, tier) {
  const canonical = getCanonicalTierForm(colorId, partnerColorId, tier, 0);
  if (canonical) {
    return canonical;
  }

  return {
    index: 0,
    key: `T${tier}_${colorId}_${partnerColorId}`.toUpperCase(),
    name: getCanonicalTierTitle(colorId, partnerColorId, tier, 0),
    asset: null,
  };
}

export function getEvolutionFormSelection(state, colorId, tier, partnerOverride = null) {
  const [left, right] = getFamilyPair(state, colorId, partnerOverride);
  const family = getCanonicalFamily(left, right);
  const explicitOptions = family.forms?.[tier] ?? [];

  if (explicitOptions.length > 0) {
    return {
      family,
      options: explicitOptions,
      autoSelectFallback: false,
    };
  }

  return {
    family,
    options: [resolveFallbackForm(left, right, tier)],
    autoSelectFallback: true,
  };
}

export function getChosenEvolutionForm(state, colorId, tier = state.evolutionTiers[colorId]) {
  if (tier <= 1) {
    return null;
  }

  const selectedKey = state.evolutionChoices[colorId]?.[tier] ?? null;
  if (!selectedKey) {
    return null;
  }

  const selection = getEvolutionFormSelection(state, colorId, tier);
  return selection.options.find((form) => form.key === selectedKey) ?? null;
}

// The form key whose badge a match of `colorId` currently earns: the player's
// chosen form at this tier, or the single auto-selected fallback form when the
// tier has no real choice. Null below T2 (base blocks have no badge).
export function activeBadgeFormKey(state, colorId) {
  const tier = state.evolutionTiers[colorId] ?? 1;
  if (tier < 2) {
    return null;
  }
  const chosen = state.evolutionChoices[colorId]?.[tier];
  if (chosen) {
    return chosen;
  }
  const selection = getEvolutionFormSelection(state, colorId, tier);
  return selection.autoSelectFallback ? selection.options[0]?.key ?? null : null;
}

// Count badge merges from a resolution's cascade steps: +1 per match-group whose
// color is at T2+ and has an active form. Pure — used by applyCascadeProgress and
// directly unit-tested.
export function countMergeGroups(state, cascadeSteps) {
  const counts = {};
  for (const step of cascadeSteps) {
    for (const group of step.groups) {
      const first = group[0];
      const tile = step.boardBeforeClear?.[first.row]?.[first.col];
      const color = tile?.color;
      if (!color) {
        continue;
      }
      const formKey = activeBadgeFormKey(state, color);
      if (!formKey) {
        continue;
      }
      counts[formKey] = (counts[formKey] ?? 0) + 1;
    }
  }
  return counts;
}

function getTileMatchKey(state, tile) {
  if (!tile) {
    return null;
  }

  const colorId = tile.color;
  const tier = state.evolutionTiers[colorId] ?? 1;
  if (tier <= 1) {
    return colorId;
  }

  const chosenForm = getChosenEvolutionForm(state, colorId, tier);
  if (!chosenForm?.key) {
    return colorId;
  }

  return `FORM:${tier}:${chosenForm.key}`;
}

export function getStateMatchResolver(state) {
  return (tile) => getTileMatchKey(state, tile);
}

export function getTopPartnerOptions(state, colorId, limit = 3) {
  return [...COLORS]
    .sort((left, right) => {
      if (left.id === colorId) {
        return -1;
      }
      if (right.id === colorId) {
        return 1;
      }

      const countDelta = state.colorMatchCounts[right.id] - state.colorMatchCounts[left.id];
      if (countDelta !== 0) {
        return countDelta;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

function getLeaderColorEntry(state, options = {}) {
  const { excludeTier4 = false } = options;
  const entries = COLORS.map((color) => ({
    colorId: color.id,
    tier: state.evolutionTiers[color.id],
    count: state.colorMatchCounts[color.id],
  })).filter((entry) => !excludeTier4 || entry.tier < 4);

  entries.sort((left, right) => {
    if (left.tier !== right.tier) {
      return right.tier - left.tier;
    }

    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return getColor(left.colorId).label.localeCompare(getColor(right.colorId).label);
  });

  return entries[0] ?? null;
}

export function getProgressPercent(state, colorId) {
  const tier = state.evolutionTiers[colorId];
  if (tier >= 4) {
    return 100;
  }

  const threshold = getThresholdForTier(tier);
  if (threshold <= 0) {
    return 0;
  }

  const count = state.colorMatchCounts[colorId];
  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((count / threshold) * 100)));
}

export function getBestProgressSummary(state) {
  const best = getLeaderColorEntry(state);
  if (!best) {
    return "No evolution progress recorded.";
  }

  const color = getColor(best.colorId);
  if (best.tier >= 4) {
    return `${color.label} reached T4.`;
  }

  return `${color.label} reached T${best.tier} with ${getProgressPercent(state, best.colorId)}% toward T${best.tier + 1}.`;
}

function resolveBoardInternal(board, state, rng = Math.random, matchResolver = defaultMatchResolver) {
  const nextBoard = cloneBoard(board);
  let baseDelta = 0;
  let totalGroups = 0;
  let cascades = 0;
  let cleared = 0;
  const cascadeSteps = [];
  let boardBeforeShuffle = null;

  while (true) {
    const groups = findMatches(nextBoard, state.diagonalAssist, matchResolver);
    if (groups.length === 0) {
      break;
    }

    cascades += 1;
    totalGroups += groups.length;
    const boardBeforeClear = cloneBoard(nextBoard);
    const cells = new Map();

    for (const group of groups) {
      const rawScore = group.length * 45 + Math.max(0, group.length - 3) * 30;
      // The combo multiplier (applied once after the cascade resolves) replaces
      // the old linear per-cascade factor; accumulate the un-multiplied base here.
      baseDelta += rawScore * (state.vibe.scoreMultiplier ?? 1);

      if (state.vibe.tierScoreBonus) {
        const perTile = rawScore / group.length;
        for (const pos of group) {
          const tile = nextBoard[pos.row][pos.col];
          if (tile && (state.evolutionTiers[tile.color] ?? 1) >= 2) {
            baseDelta += perTile * state.vibe.tierScoreBonus;
          }
        }
      }

      for (const position of group) {
        cells.set(keyFor(position.row, position.col), position);
      }
    }

    const specialsOn = state.specialTiles ?? false;
    const spawns = specialsOn ? planSpecialSpawns(groups, nextBoard) : new Map();
    const spawnSourceIds = new Map(
      [...spawns].map(([key, spawn]) => [key, nextBoard[spawn.row][spawn.col]?.id ?? null]),
    );

    // Start from the matched cells, then (when specials are on) expand with the
    // blast of any EXISTING special caught in the match, chaining into others.
    const clearSet = new Map();
    const triggeredSpecials = new Map();
    if (specialsOn) {
      const queue = [...cells.values()];
      while (queue.length > 0) {
        const position = queue.shift();
        const key = keyFor(position.row, position.col);
        if (clearSet.has(key)) {
          continue;
        }
        clearSet.set(key, position);
        const tile = nextBoard[position.row][position.col];
        // Existing specials always detonate when caught in a match. This also
        // applies when the same cell is earmarked to receive a newly created
        // special after the clear (for example, a cross in the middle of a
        // 4-line that creates another cross).
        if (tile?.special) {
          triggeredSpecials.set(key, {
            row: position.row,
            col: position.col,
            color: tile.color,
            special: tile.special,
          });
          for (const blastCell of blastCellsFor(nextBoard.length, position, tile)) {
            queue.push(blastCell);
          }
        }
      }
    } else {
      for (const [key, position] of cells) {
        clearSet.set(key, position);
      }
    }

    const colorClearCounts = emptyCountMap();
    const clearedTiles = [];

    for (const position of clearSet.values()) {
      const key = keyFor(position.row, position.col);
      if (spawns.has(key)) {
        // Preserve the matched source tile through gravity, then transform that
        // same tile into the new power-up below. Converting an arbitrary faller
        // here could overwrite an existing cross or bomb that happened to land
        // in the earmarked cell.
        continue;
      }
      const tile = nextBoard[position.row][position.col];
      if (!tile) {
        continue;
      }

      colorClearCounts[tile.color] += 1;
      clearedTiles.push({
        row: position.row,
        col: position.col,
        color: tile.color,
      });
      nextBoard[position.row][position.col] = null;
      cleared += 1;
    }

    // Newly created specials are applied AFTER collapse to the preserved source
    // tile from the match. Record the specs now; their coordinates may move with
    // gravity and are updated below.
    const specialSpawns = [...spawns.values()];
    const specialScore = Number(state.vibe.specialScore) || 0;
    if (specialScore > 0) {
      baseDelta += (specialSpawns.length + triggeredSpecials.size) * specialScore;
    }

    const boardAfterClear = cloneBoard(nextBoard);
    cascadeSteps.push({
      groups,
      clearedTiles,
      colorClearCounts,
      specialSpawns,
      triggeredSpecials: [...triggeredSpecials.values()],
      boardBeforeClear,
      boardAfterClear,
      boardAfterCollapse: null,
    });

    collapseBoard(nextBoard, rng, state.diagonalAssist, matchResolver, state.diagonalSwaps);

    // Transform the exact matched tile reserved for each spawn. Existing power-
    // ups elsewhere in the column remain independent tiles and can fall without
    // being silently replaced by this newly created special.
    for (const [key, spawn] of spawns) {
      const sourcePosition = findTilePositionById(nextBoard, spawnSourceIds.get(key));
      if (!sourcePosition) {
        throw new Error("Special spawn source tile was lost during collapse.");
      }
      const source = nextBoard[sourcePosition.row][sourcePosition.col];
      nextBoard[sourcePosition.row][sourcePosition.col] = {
        ...source,
        special: spawn.special,
        dir: spawn.dir,
      };
      spawn.row = sourcePosition.row;
      spawn.col = sourcePosition.col;
      spawn.color = source.color;
    }

    cascadeSteps[cascadeSteps.length - 1].boardAfterCollapse = cloneBoard(nextBoard);
  }

  // Combo bonus: the multiplier IS the cascade depth. Every time the board
  // collapses and re-matches within one swap, the chain deepens (`cascades`), and
  // the score is multiplied by how deep it reached, capped at ×4. A single
  // non-cascading match is ×1. This is the SAME number shown on the COMBO card
  // and the escalating "Combo ×N" popup over the board — one combo value
  // everywhere (cascade and combo are now unified). `totalGroups` is still
  // returned for diagnostics but no longer drives scoring.
  const comboMultiplier = Math.min(4, Math.max(1, cascades));
  const scoreDelta = Math.round(baseDelta * comboMultiplier);

  let shuffled = false;

  if (!hasPossibleMoves(nextBoard, state.diagonalAssist, matchResolver, state.diagonalSwaps)) {
    shuffled = true;
    boardBeforeShuffle = cloneBoard(nextBoard);
    const fresh = createBoard(
      nextBoard.length,
      COLORS.map((color) => color.id),
      rng,
      state.diagonalAssist,
      matchResolver,
      state.diagonalSwaps,
    );

    for (let row = 0; row < nextBoard.length; row += 1) {
      nextBoard[row] = fresh[row];
    }
  }

  return {
    board: nextBoard,
    scoreDelta,
    cascades,
    cleared,
    totalGroups,
    comboMultiplier,
    shuffled,
    boardBeforeShuffle,
    boardAfterShuffle: shuffled ? cloneBoard(nextBoard) : null,
    cascadeSteps,
  };
}

export function resolveBoard(board, state, rng = Math.random) {
  return resolveBoardInternal(board, state, rng, defaultMatchResolver);
}

function applyCascadeProgress(state, cascadeSteps) {
  let colorMatchCounts = { ...state.colorMatchCounts };
  const comboEssence = state.vibe.comboEssence ?? 0;
  const auraBonus = (state.evolutionAuraMovesLeft ?? 0) > 0 ? 1 : 0;

  // Record the order in which each color first reaches its current evolution
  // threshold while this resolution plays out. When two colors cross on the
  // same move, the one that filled FIRST (earlier cleared tile) must evolve
  // first — not whichever sits earlier in the fixed COLORS array.
  const colorThresholdOrder = { ...(state.colorThresholdOrder ?? {}) };
  let thresholdSeq = state.colorThresholdSeq ?? 0;
  const noteEssence = (colorId, before, after) => {
    const tier = state.evolutionTiers[colorId];
    if (tier >= 4 || colorThresholdOrder[colorId] != null) {
      return;
    }
    const threshold = getThresholdForTier(tier);
    if (threshold > 0 && before < threshold && after >= threshold) {
      thresholdSeq += 1;
      colorThresholdOrder[colorId] = thresholdSeq;
    }
  };

  for (const step of cascadeSteps) {
    for (const clearedTile of step.clearedTiles) {
      if (state.evolutionTiers[clearedTile.color] >= 4) {
        continue;
      }

      const before = colorMatchCounts[clearedTile.color] ?? 0;
      const after = before + 1 + auraBonus;
      colorMatchCounts[clearedTile.color] = after;
      noteEssence(clearedTile.color, before, after);
    }

    // comboEssence vibe: a 5+ tile match grants bonus essence to each base color
    // that took part in it (usually one color; cross-form matches can mix).
    if (comboEssence > 0) {
      for (const group of step.groups) {
        if (group.length < 5) {
          continue;
        }

        const colorsInGroup = new Set();
        for (const position of group) {
          const tile = step.boardBeforeClear[position.row][position.col];
          if (tile) {
            colorsInGroup.add(tile.color);
          }
        }

        for (const colorId of colorsInGroup) {
          if (state.evolutionTiers[colorId] >= 4) {
            continue;
          }

          const before = colorMatchCounts[colorId] ?? 0;
          const after = before + comboEssence;
          colorMatchCounts[colorId] = after;
          noteEssence(colorId, before, after);
        }
      }
    }
  }

  // Per-run badge signals (endless only, so non-endless tests are unaffected).
  // Combo: the resolution's multiplier was just stamped onto state._lastResolution
  // by attemptSwap / settleBoardForCurrentForms before this call. Specials: count
  // cross/bomb power-ups spawned across this resolution's cascade steps.
  let runMaxCombo = state.runMaxCombo ?? 0;
  const runSpecials = { ...(state.runSpecials ?? { cross: 0, bomb: 0 }) };
  const runTileClears = { ...(state.runTileClears ?? {}) };
  if (state.endlessRun) {
    const combo = state._lastResolution?.comboMultiplier ?? 0;
    if (combo > runMaxCombo) runMaxCombo = combo;
    for (const step of cascadeSteps) {
      for (const clearedTile of step.clearedTiles ?? []) {
        runTileClears[clearedTile.color] = (runTileClears[clearedTile.color] ?? 0) + 1;
      }
      for (const spawn of step.specialSpawns ?? []) {
        if (spawn.special === "cross") runSpecials.cross += 1;
        else if (spawn.special === "bomb") runSpecials.bomb += 1;
      }
    }
  }

  return {
    ...state,
    colorMatchCounts,
    colorThresholdOrder,
    colorThresholdSeq: thresholdSeq,
    runMaxCombo,
    runSpecials,
    runTileClears,
  };
}

function settleBoardForCurrentForms(state, rng = Math.random, reason = "Form resonance cleared") {
  const matchResolver = getStateMatchResolver(state);
  if (findMatches(state.board, state.diagonalAssist, matchResolver).length === 0) {
    if (hasPossibleMoves(state.board, state.diagonalAssist, matchResolver, state.diagonalSwaps)) {
      return state;
    }

    return {
      ...state,
      board: createBoard(
        state.board.length,
        COLORS.map((color) => color.id),
        rng,
        state.diagonalAssist,
        matchResolver,
        state.diagonalSwaps,
      ),
      status: `${state.status} Board realigned for current forms.`,
    };
  }

  const resolution = resolveBoardInternal(state.board, state, rng, matchResolver);
  let nextState = {
    ...state,
    board: resolution.board,
    score: state.score + resolution.scoreDelta,
    cascadesResolved: state.cascadesResolved + resolution.cascades,
    status: `${reason} ${resolution.cleared} tiles across ${resolution.cascades} cascade${resolution.cascades === 1 ? "" : "s"}.`,
    _lastResolution: resolution,
  };

  nextState = applyCascadeProgress(nextState, resolution.cascadeSteps);
  nextState = queueTriggeredEvolutions(nextState);
  return markGameOverIfNeeded(nextState);
}

export function createInitialState(options = {}) {
  const rng = options.rng ?? Math.random;
  // Always roll so the rng advances identically whether or not a vibe is forced,
  // keeping board generation deterministic across tests that pin the vibe.
  const rolledVibe = randomFrom(VIBES, rng);
  const vibe = options.vibe ?? rolledVibe;
  const diagonalAssist = options.diagonalAssist ?? true;
  // Diagonal MATCHES (lines/cascades) and diagonal SWAPS are decoupled. By default
  // swaps fall back to the matching flag, but callers can disable diagonal swaps
  // while keeping diagonal matches (orthogonal-only swaps, classic match-3 feel).
  const diagonalSwaps = options.diagonalSwaps ?? diagonalAssist;
  // Power-up tiles (cross/bomb) created by big matches. Off by default so the
  // core logic and existing tests are unaffected; production opts in.
  const specialTiles = options.specialTiles ?? false;
  // Soft-endless run: when on, reaching T4 no longer ends the run. Off by default
  // so existing victory-at-T4 tests are unaffected; production opts in.
  const endlessRun = options.endlessRun ?? false;
  const colorIds = COLORS.map((color) => color.id);
  const board = createBoard(BOARDSIZE, colorIds, rng, diagonalAssist, undefined, diagonalSwaps);

  const colorMatchCounts = Object.fromEntries(colorIds.map((id) => [id, 0]));
  if (vibe.startEssence) {
    colorMatchCounts[randomFrom(colorIds, rng)] += vibe.startEssence;
  }

  return {
    board,
    vibe,
    colorMatchCounts,
    evolutionTiers: Object.fromEntries(colorIds.map((id) => [id, 1])),
    evolutionFusions: Object.fromEntries(colorIds.map((id) => [id, null])),
    evolutionChoices: Object.fromEntries(
      colorIds.map((id) => [id, { 2: null, 3: null, 4: null }]),
    ),
    pendingEvolutionQueue: [],
    colorThresholdOrder: {},
    colorThresholdSeq: 0,
    score: 0,
    movesLeft: STARTMOVES + (vibe.startMoves ?? 0),
    movesUsed: 0,
    evolutionAuraMovesLeft: 0,
    cascadesResolved: 0,
    diagonalAssist,
    diagonalSwaps,
    specialTiles,
    endlessRun,
    runMaxCombo: 0,
    runSpecials: { cross: 0, bomb: 0 },
    runTileClears: {},
    victory: false,
    victoryMeta: null,
    gameOver: false,
    status: "Match tiles to evolve your Blupets!",
    _lastResolution: null,
  };
}

export function attemptSwap(state, first, second, rng = Math.random) {
  if (state.victory || state.gameOver || state.pendingEvolutionQueue.length > 0) {
    return state;
  }

  if (!areAdjacent(first, second, state.diagonalSwaps)) {
    return {
      ...state,
      status: state.diagonalSwaps
        ? "Swap works on nearby tiles, including diagonals."
        : "Swap only works on adjacent tiles.",
      _lastResolution: null,
    };
  }

  const swappedBoard = swapInBoard(state.board, first, second);
  const matchResolver = getStateMatchResolver(state);
  if (findMatches(swappedBoard, state.diagonalAssist, matchResolver).length === 0) {
    return {
      ...state,
      status: state.diagonalAssist
        ? "That swap does not form a straight or diagonal match."
        : "That swap does not form a match.",
      _lastResolution: null,
    };
  }

  const resolution = resolveBoardInternal(swappedBoard, state, rng, matchResolver);
  let nextState = {
    ...state,
    board: resolution.board,
    score: state.score + resolution.scoreDelta,
    movesLeft: state.movesLeft - 1,
    movesUsed: state.movesUsed + 1,
    cascadesResolved: state.cascadesResolved + resolution.cascades,
    status: [
      `Matched ${resolution.cleared} tiles across ${resolution.cascades} cascade${resolution.cascades === 1 ? "" : "s"}.`,
      resolution.shuffled ? "Dead board reshuffled." : "",
    ]
      .filter(Boolean)
      .join(" "),
    _lastResolution: resolution,
  };

  nextState = applyCascadeProgress(nextState, resolution.cascadeSteps);
  if ((nextState.evolutionAuraMovesLeft ?? 0) > 0) {
    nextState = { ...nextState, evolutionAuraMovesLeft: nextState.evolutionAuraMovesLeft - 1 };
  }
  nextState = queueTriggeredEvolutions(nextState);
  return markGameOverIfNeeded(nextState);
}

export function selectFusionPartner(state, colorId, partnerColorId) {
  const queueItem = state.pendingEvolutionQueue[0];
  if (!queueItem || queueItem.colorId !== colorId || queueItem.tier !== 2) {
    return state;
  }

  if (!getColor(colorId) || !getColor(partnerColorId)) {
    return state;
  }

  // Note: self-partner (mono-color) fusion is intentionally allowed — see the
  // "selectFusionPartner allows choosing the same color as its own partner" test.

  let nextState = promoteColorTier(state, colorId, 2);
  nextState = {
    ...nextState,
    evolutionFusions: {
      ...nextState.evolutionFusions,
      [colorId]: { partnerColorId },
    },
    pendingEvolutionQueue: [
      {
        ...queueItem,
        step: "form",
      },
      ...nextState.pendingEvolutionQueue.slice(1),
    ],
    status: `${getColor(colorId).label} fused with ${getColor(partnerColorId).label}. Choose the T2 form.`,
  };

  nextState = pruneStaleEvolutions(nextState);
  nextState = queueTriggeredEvolutions(nextState);
  return markGameOverIfNeeded(nextState);
}

export function selectEvolutionForm(state, colorId, tier, formKey, rng = Math.random) {
  const queueItem = state.pendingEvolutionQueue[0];
  if (!queueItem || queueItem.colorId !== colorId || queueItem.tier !== tier) {
    return state;
  }

  const selection = getEvolutionFormSelection(state, colorId, tier);
  const chosenForm =
    selection.options.find((form) => form.key === formKey) ?? selection.options[0] ?? null;
  const synchronizedSourceState = state;

  let nextState = state;
  if (state.evolutionTiers[colorId] < tier) {
    nextState = promoteColorTier(nextState, colorId, tier);
  }

  nextState = {
    ...nextState,
    evolutionChoices: {
      ...nextState.evolutionChoices,
      [colorId]: {
        ...nextState.evolutionChoices[colorId],
        [tier]: chosenForm?.key ?? null,
      },
    },
    status: `${getColor(colorId).label} locked ${chosenForm?.name ?? `T${tier}`} at T${tier}.`,
  };

  if (tier >= 3 && chosenForm?.key) {
    nextState = synchronizeSameFormTier(
      nextState,
      synchronizedSourceState,
      colorId,
      tier,
      chosenForm.key,
    );
  }

  if (tier === 4) {
    if (nextState.endlessRun) {
      // Soft-endless: T4 is a milestone, not the end. Lock the color at T4
      // (the currentTier >= 4 guard keeps it out of the re-queue) and keep
      // playing. No victory, and no leftover-moves bonus (the run always plays
      // down to 0 moves, so it would be meaningless here).
      nextState = {
        ...nextState,
        status: `${getColor(colorId).label} reached T4 as ${chosenForm?.name ?? "Apex Form"}.`,
      };
    } else {
      const partnerColorId = nextState.evolutionFusions[colorId]?.partnerColorId ?? colorId;
      nextState = {
        ...nextState,
        victory: true,
        victoryMeta: {
          colorId,
          partnerColorId,
          formKey: chosenForm?.key ?? null,
          formName: chosenForm?.name ?? getCanonicalTierTitle(colorId, partnerColorId, 4, 0),
        },
        status: `${getColor(colorId).label} reached T4 as ${chosenForm?.name ?? "Apex Form"}.`,
      };
    }
  }

  nextState = removeFirstPending(nextState);
  nextState = pruneStaleEvolutions(nextState);
  if (!nextState.victory) {
    nextState = settleBoardForCurrentForms(nextState, rng);
  }
  nextState = queueTriggeredEvolutions(nextState);
  return markGameOverIfNeeded(nextState);
}
