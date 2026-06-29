import { BLUPETS_FAMILIES } from "./blupets-canon-data.js";

const COLOR_LABEL_BY_ID = Object.freeze({
  black: "Black",
  blue: "Blue",
  cyan: "Cyan",
  green: "Green",
  purple: "Purple",
  red: "Red",
  white: "White",
  yellow: "Yellow",
});

const FAMILY_BY_PAIR = new Map();

for (const family of BLUPETS_FAMILIES) {
  const [left, right] = family.pair;
  FAMILY_BY_PAIR.set(`${left}|${right}`, family);

  if (left !== right) {
    FAMILY_BY_PAIR.set(`${right}|${left}`, family);
  }
}

function hashFamilySeed(family, tokenId, tier) {
  let hash = Number(tokenId) >>> 0;
  hash = (hash + tier * 2654435761) >>> 0;

  for (const char of family.key) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 2246822519) >>> 0;
  }

  return hash >>> 0;
}

function baseTierLabel(parentA, parentB) {
  if (parentA === parentB) {
    return `${COLOR_LABEL_BY_ID[parentA]} Base Block`;
  }

  return `${COLOR_LABEL_BY_ID[parentA]} + ${COLOR_LABEL_BY_ID[parentB]} Base Blocks`;
}

function fallbackFamily(parentA, parentB) {
  return {
    id: `${parentA}-${parentB}`,
    key: `${parentA}-${parentB}`.toUpperCase(),
    name:
      parentA === parentB
        ? `${COLOR_LABEL_BY_ID[parentA]}`
        : `${COLOR_LABEL_BY_ID[parentA]}/${COLOR_LABEL_BY_ID[parentB]}`,
    pair: [parentA, parentB],
    forms: { 2: [], 3: [], 4: [] },
  };
}

export function getCanonicalFamily(parentA, parentB) {
  return FAMILY_BY_PAIR.get(`${parentA}|${parentB}`) ?? fallbackFamily(parentA, parentB);
}

export function getCanonicalTierForm(parentA, parentB, tier, tokenId = 0) {
  if (tier <= 1) {
    return null;
  }

  const family = getCanonicalFamily(parentA, parentB);
  const options = family.forms?.[tier] ?? [];
  if (options.length === 0) {
    return null;
  }

  if (options.length === 1) {
    return options[0];
  }

  const seed = hashFamilySeed(family, tokenId, tier);
  return options[seed % options.length];
}

export function getCanonicalTierTitle(parentA, parentB, tier, tokenId = 0) {
  if (tier <= 1) {
    return baseTierLabel(parentA, parentB);
  }

  return getCanonicalTierForm(parentA, parentB, tier, tokenId)?.name ?? `T${tier} Form`;
}

export function getCanonicalFamilyName(parentA, parentB) {
  return getCanonicalFamily(parentA, parentB).name;
}

export function getFamilyTileAsset(parentA, parentB, tier, tokenId, colorId) {
  if (tier <= 1) {
    return null;
  }

  if (colorId !== parentA && colorId !== parentB) {
    return null;
  }

  return getCanonicalTierForm(parentA, parentB, tier, tokenId)?.asset ?? null;
}
