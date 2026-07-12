import test from "node:test";
import assert from "node:assert/strict";

import {
  formatEventCountdown,
  renderEarnedEventBadge,
  renderEventBanner,
  renderEventPopup,
} from "../src/ui/render-event.js";

const snapshot = {
  event: {
    id: "event-1",
    status: "active",
    title: "Weekly Event",
    description: "Collect limited badges.",
    heroAsset: "https://cdn.example.com/event.png",
    endsAt: "2026-07-19T12:00:00Z",
  },
  badges: [
    { key: "high", name: "High Badge", rankOrder: 4, assetUrl: "https://cdn.example.com/high.png", metadata: { rankLabel: "Highest" } },
    { key: "low", name: "Low Badge", rankOrder: 1, assetUrl: null, metadata: { rankLabel: "Lowest" } },
  ],
  progress: {
    badgeCounts: { high: 2, low: 5 },
    rankingVector: [2, 5],
    totalBadges: 7,
  },
  leaderboard: [
    { rank: 1, userId: "player-1", accountName: "Player One", rankingVector: [2, 5] },
    { rank: 2, userId: "player-2", accountName: "Player Two", rankingVector: [2, 4] },
  ],
  winners: [],
};

test("event banner contains only approved title, image, and countdown content", () => {
  const html = renderEventBanner(snapshot, Date.parse("2026-07-18T12:00:00Z"));
  assert.match(html, /Weekly Event/);
  assert.match(html, /event\.png/);
  assert.match(html, /1d 00h/);
  assert.doesNotMatch(html, /Collect limited badges/);
  assert.doesNotMatch(html, /Event badges|leaderboard|totalBadges/);
});

test("event popup is one page ordered collection before leaderboard", () => {
  const html = renderEventPopup(snapshot, {
    userId: "player-1",
    now: Date.parse("2026-07-18T12:00:00Z"),
  });
  assert.ok(html.indexOf("Your collection") < html.indexOf("Event leaderboard"));
  assert.match(html, /Your rank<\/span><strong>#1/);
  assert.match(html, /Highest<\/span><strong>2/);
  assert.match(html, /Lowest<\/span><strong>5/);
  assert.match(html, /is-top3 is-rank1 is-player/);
});

test("event UI escapes content and rejects unsafe image protocols", () => {
  const unsafe = structuredClone(snapshot);
  unsafe.event.title = '<img src=x onerror="alert(1)">';
  unsafe.event.heroAsset = "javascript:alert(1)";
  const html = renderEventPopup(unsafe);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("results reuse the popup with congratulations and locked winners", () => {
  const results = structuredClone(snapshot);
  results.event.status = "results";
  results.event.resultsUntil = "2026-07-26T12:00:00Z";
  results.winners = results.leaderboard;
  const html = renderEventPopup(results, { now: Date.parse("2026-07-25T12:00:00Z") });
  assert.match(html, /Congratulations to the winners!/);
  assert.match(html, /Final results/);
  assert.match(html, /1d 00h/);
});

test("countdown formats sub-day time without changing page structure", () => {
  assert.equal(
    formatEventCountdown("2026-07-12T13:02:03Z", Date.parse("2026-07-12T12:00:00Z")),
    "01:02:03",
  );
  assert.equal(formatEventCountdown(null), "—");
});

test("verified run badge uses a compact gameover card", () => {
  const html = renderEarnedEventBadge({
    badgeKey: "weekly-one",
    name: "Weekly Badge",
    rankOrder: 3,
    assetUrl: "https://cdn.example.com/badge.png",
  });
  assert.match(html, /Event badge earned/);
  assert.match(html, /Weekly Badge/);
  assert.match(html, /Rank 3/);
  assert.match(html, /event-run-badge/);
});
