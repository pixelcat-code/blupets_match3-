// Pure quest progress/labelling helpers, extracted from main.js.
//
// Each function derives its result purely from the `quest` object passed in —
// no app state, no DOM. The state-reading badge assemblers (getQuestBadges /
// getSaraiHeartQuestBadge, which read `progress`) stay in main.js and feed
// these helpers their quest objects.

import { SARAI_HEART_QUEST_ID } from "../progress.js?v=20260628-guest-gating-1";

export function questProgressParts(quest) {
  const raw = typeof quest.hint === "string" ? quest.hint : "";
  const match = raw.match(/([\d,]+)\s*\/\s*([\d,]+)/);
  if (match) {
    const current = Number(match[1].replace(/,/g, "")) || 0;
    const target = Math.max(1, Number(match[2].replace(/,/g, "")) || 1);
    return { current: Math.min(current, target), target, text: `${Math.min(current, target).toLocaleString("en-US")}/${target.toLocaleString("en-US")}` };
  }
  return quest.unlocked
    ? { current: 1, target: 1, text: "Done" }
    : { current: 0, target: 1, text: "In progress" };
}

export function questDifficultyTarget(quest) {
  const parts = questProgressParts(quest);
  return parts.target;
}

export function questIsComplete(quest) {
  if (quest.unlocked) return true;
  const parts = questProgressParts(quest);
  return parts.current >= parts.target;
}

export function firstNumberFromText(text) {
  const match = String(text || "").match(/[\d,]+/);
  return match ? Number(match[0].replace(/,/g, "")) || 0 : 0;
}

export function questSentenceText(quest) {
  if (quest.id === SARAI_HEART_QUEST_ID) {
    return "Match Heart 11 times for Sarai";
  }
  const rawLabel = String(quest.label || "");
  const label = rawLabel.toLowerCase();
  const progressParts = questProgressParts(quest);
  const target = progressParts.target;
  if (quest.category === "collection") {
    if (label.includes("complete")) return "Reveal all Blupets";
    if (label.includes("inventory")) {
      return target === 1
        ? "Reveal your first Blupet"
        : `Reveal ${target.toLocaleString("en-US")} Blupets`;
    }
    const tier =
      label.includes("base evolved") ? "Base Evolved" :
      label.includes("advanced") ? "Advanced" :
      label.includes("ascended") ? "Ascended" :
      "";
    return target === 1
      ? `Reveal your first ${tier ? `${tier} ` : ""}Blupet`
      : `Reveal ${target.toLocaleString("en-US")} ${tier ? `${tier} ` : ""}Blupets`;
  }
  if (quest.category === "color") {
    const color = rawLabel.replace(/\s+(Adept|Specialist|Master)$/i, "");
    return `Clear ${target.toLocaleString("en-US")} ${color} tiles`;
  }
  if (quest.category === "special") {
    if (label.includes("bomb")) return `Create ${target.toLocaleString("en-US")} Bombs`;
    if (label.includes("cross")) return `Create ${target.toLocaleString("en-US")} Crosses`;
    return "Use special tiles during runs";
  }
  if (quest.category === "combo") {
    const combo = rawLabel.match(/x\d+/i)?.[0] ?? "this combo";
    const runs = firstNumberFromText(rawLabel);
    return label.includes("runs") && runs > 0
      ? `Reach ${combo} in ${runs.toLocaleString("en-US")} runs`
      : `Reach ${combo} in a run`;
  }
  if (quest.category === "score") {
    if (label.includes("advanced")) return "Create two Advanced Blupets in one run";
    if (label.includes("ascended")) return "Create three Ascended Blupets in one run";
    const score = firstNumberFromText(rawLabel);
    return score > 0 ? `Score ${score.toLocaleString("en-US")} in one run` : "Score high in one run";
  }
  if (quest.category === "endurance") {
    if (label.includes("lifetime")) {
      const score = firstNumberFromText(rawLabel);
      return score > 0 ? `Reach ${score.toLocaleString("en-US")} lifetime score` : "Build lifetime score";
    }
    return target === 1 ? "Finish your first run" : `Finish ${target.toLocaleString("en-US")} runs`;
  }
  return "Make progress through normal play";
}
