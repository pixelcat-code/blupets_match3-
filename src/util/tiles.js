// Tile-coordinate helpers shared across the UI controller. Pure functions of
// their arguments — no DOM, no app state.

export function cellKey(row, col) {
  return `${row}:${col}`;
}

export function sameTile(left, right) {
  return Boolean(left && right && left.row === right.row && left.col === right.col);
}
