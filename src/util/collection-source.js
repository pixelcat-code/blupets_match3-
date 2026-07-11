export function buildPublicCollectionSnapshot({
  storedCollectionTiles = null,
  entryCollections = [],
  fallbackFormKeys = [],
  localCollectionTiles = null,
  entryCount = 0,
} = {}) {
  const tiles = {};
  const add = (source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return;
    for (const [key, value] of Object.entries(source)) {
      if (value === true) tiles[key] = true;
    }
  };

  if (storedCollectionTiles && typeof storedCollectionTiles === "object") {
    add(storedCollectionTiles);
  } else {
    for (const source of entryCollections) add(source);
    if (Object.keys(tiles).length === 0) {
      for (const key of fallbackFormKeys) {
        if (key && key !== "RUN_COMPLETE") tiles[key] = true;
      }
    }
  }
  add(localCollectionTiles);

  const tileCount = Object.keys(tiles).length;
  return {
    tiles,
    count: storedCollectionTiles == null && tileCount === 0
      ? Math.max(0, Number(entryCount) || 0)
      : tileCount,
  };
}
