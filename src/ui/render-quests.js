// Quest section + quest-stats header, extracted from main.js. Pure HTML
// builders over the milestone/Sarai-heart badge model. Quest-tab clicks
// (data-quest-tab) are handled in main.js via event delegation; this module
// only reads/normalizes the active tab through the shared `app` store.
import { app } from "./store.js?v=20260629-5";
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import {
  getMilestoneBadges,
  getSaraiHeartQuest,
  SARAI_HEART_QUEST_ID,
  SARAI_HEART_QUEST_TARGET,
  SARAI_HEART_QUEST_REWARD,
  milestoneCapsuleReward,
} from "../progress.js?v=20260628-guest-gating-1";
import {
  questProgressParts,
  questDifficultyTarget,
  questIsComplete,
  questSentenceText,
} from "./quest-logic.js?v=20260629-1";
import { renderCollectionProgress } from "./render-profile-stats.js?v=20260629-2";
import { renderTabHero } from "./render-tab-hero.js?v=20260705-3";

const QUEST_TYPES = [
  ["collection", "Collection", ["collection"]],
  ["color", "Colors", ["color"]],
  ["technique", "Technique", ["special", "combo"]],
  ["run_goals", "Run Goals", ["score", "endurance"]],
];
const QUEST_TYPE_LABEL = Object.fromEntries(QUEST_TYPES.map(([id, label]) => [id, label]));
const QUEST_TYPE_CATEGORIES = Object.fromEntries(QUEST_TYPES.map(([id, , categories]) => [id, categories]));
const QUEST_DIFFICULTY = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };

export function normalizeQuestTab(tab) {
  if (tab === "special" || tab === "combo") return "technique";
  if (tab === "score" || tab === "endurance") return "run_goals";
  return QUEST_TYPE_LABEL[tab] ? tab : "collection";
}

function questInType(quest, type) {
  return (QUEST_TYPE_CATEGORIES[type] ?? ["collection"]).includes(quest.category);
}

export function questCompletionSummary(badges = getQuestBadges()) {
  const done = badges.filter(questIsComplete).length;
  const total = badges.length;
  return { done, total, label: `${done}/${total}` };
}

function getSaraiHeartQuestBadge() {
  const quest = getSaraiHeartQuest(app.progress);
  return {
    id: SARAI_HEART_QUEST_ID,
    label: "Sarai Heart Quest",
    category: "collection",
    tier: "common",
    unlocked: quest.completed,
    hint: `${Math.min(quest.matches, SARAI_HEART_QUEST_TARGET)}/${SARAI_HEART_QUEST_TARGET}`,
    reward: SARAI_HEART_QUEST_REWARD,
  };
}

function getQuestBadges() {
  return [...getMilestoneBadges(app.progress), getSaraiHeartQuestBadge()];
}

function renderQuestTabs(badges) {
  return `
    <div class="quest-type-tabs" role="tablist" aria-label="Quest types">
      ${QUEST_TYPES.map(([id, label]) => {
        const total = badges.filter((badge) => questInType(badge, id)).length;
        const done = badges.filter((badge) => questInType(badge, id) && questIsComplete(badge)).length;
        return `
          <button
            class="quest-type-tab${app.questTab === id ? " is-active" : ""}"
            type="button"
            role="tab"
            data-quest-tab="${id}"
            aria-selected="${app.questTab === id ? "true" : "false"}"
          >
            <span>${escapeHtml(label)}</span>
            <small>${done}/${total}</small>
          </button>`;
      }).join("")}
    </div>`;
}

function renderQuestRow(quest) {
  const progressParts = questProgressParts(quest);
  const pct = Math.max(0, Math.min(100, Math.round((progressParts.current / progressParts.target) * 100)));
  const sentence = questSentenceText(quest);
  const reward = Number.isFinite(Number(quest.reward))
    ? Math.max(0, Math.floor(Number(quest.reward)))
    : milestoneCapsuleReward(quest.tier);
  const complete = questIsComplete(quest);
  return `
    <div class="quest-row${complete ? " is-complete" : ""}" data-category="${escapeHtml(quest.category)}">
      <span class="quest-status" aria-label="${reward} reveal${reward === 1 ? "" : "s"} reward">
        <img src="./assets/blocks/origin.svg" alt="" aria-hidden="true" />
        <b>${reward}</b>
      </span>
      <div class="quest-copy">
        <div class="quest-row-head">
          <strong>${escapeHtml(sentence)}</strong>
          <span>${escapeHtml(progressParts.text)}</span>
        </div>
        <div class="quest-progress" role="progressbar" aria-valuenow="${progressParts.current}" aria-valuemin="0" aria-valuemax="${progressParts.target}" aria-label="${escapeHtml(quest.label)} progress">
          <div class="quest-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
    </div>`;
}

export function renderQuestsSection({ back = false, inlineStats = false } = {}) {
  const badges = getQuestBadges().map((badge, index) => ({ ...badge, order: index }));
  const active = normalizeQuestTab(app.questTab);
  app.questTab = active;
  const quests = badges
    .filter((badge) => questInType(badge, active))
    .sort((a, b) =>
      Number(questIsComplete(a)) - Number(questIsComplete(b)) ||
      (QUEST_DIFFICULTY[a.tier] ?? 99) - (QUEST_DIFFICULTY[b.tier] ?? 99) ||
      questDifficultyTarget(a) - questDifficultyTarget(b) ||
      a.order - b.order,
    );
  return `
    <div class="quests-section">
      ${renderTabHero("quests", { back })}
      ${inlineStats ? renderQuestStatsHeader() : ""}
      ${renderQuestTabs(badges)}
      <div class="quest-list">
        ${quests.map(renderQuestRow).join("")}
      </div>
    </div>`;
}

export function renderQuestStatsHeader() {
  const { done, total } = questCompletionSummary();
  return renderCollectionProgress(done, total, "Quest Progress", "Quests completed");
}
