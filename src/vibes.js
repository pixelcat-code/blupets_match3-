// Vibe generator.
//
// Every run rolls one "vibe" — a small set of bonuses. Instead of hand-authoring
// 64 vibes (impossible to keep balanced), we define a handful of effect MODULES,
// give each a point cost, and enumerate every combination that spends exactly
// VIBE_BUDGET points. Because every vibe sums to the same budget, all of them are
// equivalent in raw power by construction — no vibe is a dud, none is overpowered.
//
// With these 7 modules and a budget of 4 there are 71 combinations; 7 of them use
// a single module type (e.g. "+4 moves" only). Dropping those single-flavour ones
// leaves exactly 64 vibes, each blending at least two different effects.

export const VIBE_BUDGET = 4;

// cost = points spent per pick. A module can be picked multiple times to stack.
const MODULES = [
  { key: "startMoves", cost: 1 },
  { key: "scoreMultiplier", cost: 1 },
  { key: "rerollRecovery", cost: 1 },
  { key: "startEssence", cost: 1 },
  { key: "comboEssence", cost: 2 },
  { key: "evolveMoves", cost: 2 },
  { key: "decayResist", cost: 2 },
];

const VIBE_NAMES = [
  "Cheerful",  "Grumpy",          "Sarcastic",        "Curious",
  "Wild",      "Confident",       "Secretive",        "Skeptical",
  "Elegant",   "Goofy",           "Focused",          "Sleepy",
  "Playful",   "Stoic",           "Dramatic",         "Gentle",
  "Based",     "Nervous",         "Mischievous",      "Loyal",
  "Dreamy",    "Signal-Seeking",  "Rebellious",       "Calm",
  "Awkward",   "Bold",            "Moody",            "Sincere",
  "Witty",     "Lurker",          "Chaotic",          "Diamond-Handed",
  "Jealous",   "Protective",      "Impulsive",        "Clever",
  "Melancholic","Excitable",      "Rugged",           "Zen",
  "Romantic",  "Stubborn",        "Polite",           "Serious",
  "Frenly",    "Hopepilled",      "Softhearted",      "Terminally Online",
  "Spicy",     "Humble",          "Bossy",            "Lucky",
  "Degen",     "Tender",          "Prankish",         "Maxi",
  "Detached",  "Bright",          "Gloomy",           "Feisty",
  "Odd",       "Dorky",           "Sassy",            "Haunted",
];

function pluralMove(count) {
  return count === 1 ? "move" : "moves";
}

// Turn a module + how many times it was picked into the state property it sets and
// a human-readable fragment for the vibe blurb.
function describeModule(key, picks) {
  switch (key) {
    case "startMoves":
      return { props: { startMoves: picks }, text: `+${picks} start ${pluralMove(picks)}` };
    case "scoreMultiplier":
      return {
        props: { scoreMultiplier: 1 + picks / 10 },
        text: `+${picks * 10}% cascade score`,
      };
    case "rerollRecovery":
      return {
        props: { rerollRecovery: picks * 2 },
        text: `+${picks * 2} moves on reroll recovery`,
      };
    case "startEssence":
      return {
        props: { startEssence: picks * 3 },
        text: `Start with +${picks * 3} essence on a color`,
      };
    case "comboEssence":
      return { props: { comboEssence: picks }, text: `5+ matches grant +${picks} essence` };
    case "evolveMoves":
      return {
        props: { evolveMoves: picks },
        text: `+${picks} ${pluralMove(picks)} per evolution`,
      };
    case "decayResist":
      return {
        props: { decayResist: 0.25 * picks },
        text: `Other colors decay ${picks * 25}% less`,
      };
    default:
      return { props: {}, text: "" };
  }
}

// Enumerate every multiset of module picks whose total cost equals VIBE_BUDGET.
function enumerateCombos() {
  const combos = [];
  const counts = new Array(MODULES.length).fill(0);

  function walk(index, remaining) {
    if (index === MODULES.length) {
      if (remaining === 0) {
        combos.push([...counts]);
      }
      return;
    }

    const maxPicks = Math.floor(remaining / MODULES[index].cost);
    for (let picks = 0; picks <= maxPicks; picks += 1) {
      counts[index] = picks;
      walk(index + 1, remaining - picks * MODULES[index].cost);
    }
    counts[index] = 0;
  }

  walk(0, VIBE_BUDGET);
  return combos;
}

function buildVibe(counts, index) {
  const props = {};
  const parts = [];

  counts.forEach((picks, moduleIndex) => {
    if (picks <= 0) {
      return;
    }

    const described = describeModule(MODULES[moduleIndex].key, picks);
    Object.assign(props, described.props);
    parts.push(described.text);
  });

  return {
    id: `vibe-${index + 1}`,
    label: VIBE_NAMES[index % VIBE_NAMES.length],
    blurb: parts.join(" · "),
    ...props,
  };
}

// Keep only combinations that mix at least two distinct effect types — this drops
// the 7 single-flavour combos and lands on exactly 64 vibes.
const COMBOS = enumerateCombos().filter(
  (counts) => counts.filter((picks) => picks > 0).length >= 2,
);

export const VIBES = COMBOS.map((counts, index) => buildVibe(counts, index));

// A bonus-free vibe for deterministic tests that assert exact mechanical outcomes.
export const NEUTRAL_VIBE = {
  id: "vibe-neutral",
  label: "Neutral",
  blurb: "No bonuses.",
};
