export const TOURNAMENT_POLL_TICK_MS = 5_000;
export const TOURNAMENT_DISCONNECTED_POLL_MS = 5_000;
export const TOURNAMENT_LOBBY_SAFETY_POLL_MS = 30_000;
export const TOURNAMENT_LIVE_SAFETY_POLL_MS = 10 * 60_000;
export const TOURNAMENT_DRAFT_SYNC_INTERVAL_MS = 3 * 60_000;
export const TOURNAMENT_FINAL_REFRESH_GRACE_MS = 65_000;

export function tournamentPollIntervalMs({ channelJoined, roomStatus } = {}) {
  if (!channelJoined) return TOURNAMENT_DISCONNECTED_POLL_MS;
  return roomStatus === "lobby"
    ? TOURNAMENT_LOBBY_SAFETY_POLL_MS
    : TOURNAMENT_LIVE_SAFETY_POLL_MS;
}

export function tournamentDraftSyncDelayMs({ immediate = false, lastAttemptAt = 0, now = Date.now() } = {}) {
  if (immediate || !Number.isFinite(lastAttemptAt) || lastAttemptAt <= 0) return 0;
  return Math.max(0, TOURNAMENT_DRAFT_SYNC_INTERVAL_MS - Math.max(0, now - lastAttemptAt));
}
