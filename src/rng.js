export function createSeededRng(seed = 1) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function randomSeed() {
  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(bytes);
  return bytes[0] || Math.floor(Math.random() * 4294967296);
}
