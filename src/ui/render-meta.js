// Shared meta-navigation + meta-overlay text, extracted from main.js.
//
// `renderMetaNav` paints the in-app section tab strip (Collection / Quests /
// Leaderboard / Guide) into whichever host element it's handed. Both the
// leaderboard and profile screens render this same nav, so it lives in a shared
// module that those render clusters import — it reads no controller state, only
// its `host` and `active` arguments. `metaTitle`/`metaStatus` derive the
// start-screen meta popup's heading and sub-status text from the active section
// and the shared `app` store.
import { escapeHtml } from "./dom-safety.js?v=20260629-1";
import { app } from "./store.js?v=20260629-5";
import { SHARDS_PER_CAPSULE } from "../progress.js?v=20260628-guest-gating-1";

export const META_NAV_ITEMS = Object.freeze([
  ["collection", "Collection"],
  ["quests", "Quests"],
  ["rank", "Leaderboard"],
  ["guide", "Guide"],
]);

export function renderMetaNav(host, active) {
  if (!host) return;
  host.innerHTML = META_NAV_ITEMS.map(([id, label]) => {
    const current = id === active;
    return `
      <button class="meta-nav-btn${current ? " is-active" : ""}" type="button" data-meta-nav="${id}" aria-current="${current ? "page" : "false"}">
        <span>${escapeHtml(label)}</span>
      </button>`;
  }).join("");
}

export function metaTitle(section) {
  return {
    account: "Profile",
    capsules: "Blupets",
    collection: "Collection",
    guide: "Guide",
    "public-profile": app.metaPublicProfile?.accountName || "Player",
    quests: "Quests",
    rank: "Leaderboard",
  }[section] ?? "Collection";
}

export function metaStatus(section) {
  if (section === "collection") return "";
  if (section === "capsules") return `${Math.max(0, Math.floor(Number(app.progress.capsules) || 0))} reveals ready, ${Math.max(0, Math.floor(Number(app.progress.shards) || 0))}/${SHARDS_PER_CAPSULE} shards`;
  if (section === "quests") {
    return "";
  }
  if (section === "rank") return "";
  if (section === "guide") return "";
  if (section === "public-profile") {
    if (app.metaPublicProfile?.loading) return "Loading profile";
    if (app.metaPublicProfile?.error) return "Could not load profile";
    return "";
  }
  if (section === "account") return "";
  return app.authState.user ? "Cloud profile connected" : "Local guest profile";
}
