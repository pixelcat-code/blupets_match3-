import { escapeHtml, safeImgSrc } from "./dom-safety.js?v=20260629-1";
import { eventCountdownTarget } from "../events.js?v=20260712-badges-1";

function int(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function eventImage(raw, className) {
  const src = safeImgSrc(raw);
  return src ? `<img class="${className}" src="${escapeHtml(src)}" alt="" />` : "";
}

export function formatEventCountdown(target, now = Date.now()) {
  const targetTime = Date.parse(target ?? "");
  const nowTime = Number(now);
  if (!Number.isFinite(targetTime) || !Number.isFinite(nowTime)) return "—";
  const seconds = Math.max(0, Math.ceil((targetTime - nowTime) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function countdownMarkup(snapshot, now) {
  const target = eventCountdownTarget(snapshot?.event);
  return `<time class="event-countdown" data-event-countdown data-target="${escapeHtml(target ?? "")}">${escapeHtml(formatEventCountdown(target, now))}</time>`;
}

function rankDefinitions(badges) {
  const definitions = new Map();
  for (const badge of badges ?? []) {
    const rankOrder = int(badge?.rankOrder);
    if (!rankOrder || definitions.has(rankOrder)) continue;
    const configuredLabel = badge?.metadata?.rankLabel;
    definitions.set(rankOrder, {
      order: rankOrder,
      label: typeof configuredLabel === "string" && configuredLabel.trim()
        ? configuredLabel.trim()
        : `Rank ${rankOrder}`,
    });
  }
  return [...definitions.values()].sort((a, b) => b.order - a.order);
}

function rankCounters(vector, definitions) {
  const values = Array.isArray(vector) ? vector : [];
  if (!definitions.length) return `<span class="event-rank-count">—</span>`;
  return definitions.map((rank, index) =>
    `<span class="event-rank-count" title="${escapeHtml(rank.label)}">` +
      `<span>${escapeHtml(rank.label)}</span><strong>${int(values[index])}</strong>` +
    `</span>`
  ).join("");
}

export function renderEventBanner(snapshot, now = Date.now()) {
  if (!snapshot?.event?.id) return "";
  const event = snapshot.event;
  return `<button class="event-banner" type="button" data-event-open aria-label="Open ${escapeHtml(event.title || "event")}">` +
    `<span class="event-banner-art${safeImgSrc(event.heroAsset) ? " has-image" : ""}">` +
      eventImage(event.heroAsset, "event-banner-image") +
    `</span>` +
    `<span class="event-banner-copy">` +
      `<strong>${escapeHtml(event.title || "Event")}</strong>` +
      countdownMarkup(snapshot, now) +
    `</span>` +
  `</button>`;
}

export function renderEarnedEventBadge(badge) {
  if (!badge?.badgeKey) return "";
  const asset = safeImgSrc(badge.assetUrl);
  return `<article class="event-run-badge" aria-label="Event badge earned">` +
    `<span class="event-run-badge-art${asset ? " has-image" : ""}">` +
      (asset ? `<img src="${escapeHtml(asset)}" alt="" />` : "") +
    `</span>` +
    `<span class="event-run-badge-copy"><small>Event badge earned</small>` +
      `<strong>${escapeHtml(badge.name || badge.badgeKey)}</strong>` +
      `<span>Rank ${int(badge.rankOrder)}</span>` +
    `</span>` +
  `</article>`;
}

function renderEventBadges(snapshot, definitions) {
  const counts = snapshot?.progress?.badgeCounts ?? {};
  const badges = snapshot?.badges ?? [];
  if (!badges.length) {
    return `<div class="event-empty">Event badges will appear here when the event content is configured.</div>`;
  }
  return `<div class="event-badges-grid">${badges.map((badge) => {
    const rank = definitions.find((entry) => entry.order === int(badge.rankOrder));
    const count = int(counts[badge.key]);
    return `<article class="event-badge-card${count > 0 ? " is-collected" : ""}" data-event-rank="${int(badge.rankOrder)}">` +
      `<div class="event-badge-art${safeImgSrc(badge.assetUrl) ? " has-image" : ""}">` +
        eventImage(badge.assetUrl, "event-badge-image") +
        (count > 0 ? `<span class="event-badge-count">×${count}</span>` : "") +
      `</div>` +
      `<strong>${escapeHtml(badge.name || badge.key || "Event badge")}</strong>` +
      `<span>${escapeHtml(rank?.label || `Rank ${int(badge.rankOrder)}`)}</span>` +
    `</article>`;
  }).join("")}</div>`;
}

function renderEventLeaderboard(snapshot, definitions, userId) {
  const rows = snapshot?.event?.status === "results" && snapshot?.winners?.length
    ? snapshot.winners
    : snapshot?.leaderboard ?? [];
  if (!rows.length) return `<div class="event-empty">No event badges earned yet.</div>`;
  return `<div class="event-leaderboard-list">${rows.map((row, index) => {
    const rank = int(row.rank) || index + 1;
    const isPlayer = Boolean(userId && row.userId === userId);
    const avatar = safeImgSrc(row.avatarUrl);
    const total = (Array.isArray(row.rankingVector) ? row.rankingVector : []).reduce((sum, value) => sum + int(value), 0);
    const rankCell = rank <= 3
      ? `<span class="leaderboard-medal" aria-hidden="true">${rank}</span><span class="sr-only">Rank ${rank}</span>`
      : `#${rank}`;
    return `<article class="leaderboard-row event-leaderboard-row${rank <= 3 ? ` is-top3 is-rank${rank}` : rank <= 10 ? " is-top10" : ""}${isPlayer ? " is-player" : ""}">` +
      `<span class="leaderboard-rank">${rankCell}</span>` +
      `<span class="event-leaderboard-player">` +
        (avatar
          ? `<img class="leaderboard-avatar" src="${escapeHtml(avatar)}" alt="" />`
          : `<span class="leaderboard-avatar leaderboard-avatar--placeholder" aria-hidden="true"></span>`) +
        `<span class="leaderboard-user"><strong class="leaderboard-title">${escapeHtml(row.accountName || "Player")}</strong>` +
          `<span class="leaderboard-meta">${total} event badge${total === 1 ? "" : "s"}</span></span>` +
      `</span>` +
      `<span class="event-leaderboard-counts">${rankCounters(row.rankingVector, definitions)}</span>` +
    `</article>`;
  }).join("")}</div>`;
}

function renderResultsIntro(snapshot) {
  if (snapshot?.event?.status !== "results") return "";
  const winners = snapshot.winners ?? [];
  return `<section class="event-results-callout">` +
    `<span class="event-section-kicker">Event complete</span>` +
    `<h2>Congratulations to the winners!</h2>` +
    (winners.length
      ? `<p>The final standings are locked. Results remain available until the countdown ends.</p>`
      : `<p>Final results are being prepared.</p>`) +
  `</section>`;
}

export function renderEventPopup(snapshot, { userId = "", now = Date.now() } = {}) {
  if (!snapshot?.event?.id) return "";
  const event = snapshot.event;
  const definitions = rankDefinitions(snapshot.badges);
  const playerRow = (snapshot.leaderboard ?? []).find((row) => row.userId === userId);
  return `<div class="event-popup-page">` +
    `<header class="event-popup-hero${safeImgSrc(event.heroAsset) ? " has-image" : ""}">` +
      `<div class="event-popup-hero-art">` +
        eventImage(event.heroAsset, "event-popup-hero-image") +
        `<span class="event-popup-hero-mark" aria-hidden="true"></span>` +
      `</div>` +
      `<div class="event-popup-hero-copy">` +
        `<span class="event-section-kicker">${event.status === "results" ? "Final results" : "Limited event"}</span>` +
        `<h1 id="eventPopupTitle">${escapeHtml(event.title || "Event")}</h1>` +
        (event.description ? `<p>${escapeHtml(event.description)}</p>` : "") +
        `<div class="event-popup-timer"><span>${event.status === "results" ? "Results close in" : "Ends in"}</span>${countdownMarkup(snapshot, now)}</div>` +
      `</div>` +
    `</header>` +
    renderResultsIntro(snapshot) +
    `<section class="event-player-summary" aria-label="Your event progress">` +
      `<div><span>Your rank</span><strong>${playerRow ? `#${int(playerRow.rank)}` : "—"}</strong></div>` +
      `<div><span>Badges earned</span><strong>${int(snapshot.progress?.totalBadges)}</strong></div>` +
    `</section>` +
    `<section class="event-popup-section">` +
      `<div class="event-section-heading"><div><h2>Event badges</h2></div></div>` +
      renderEventBadges(snapshot, definitions) +
    `</section>` +
    `<section class="event-popup-section event-popup-leaderboard">` +
      `<div class="event-section-heading"><div><span class="event-section-kicker">Standings</span><h2>Event leaderboard</h2></div></div>` +
      renderEventLeaderboard(snapshot, definitions, userId) +
    `</section>` +
  `</div>`;
}
