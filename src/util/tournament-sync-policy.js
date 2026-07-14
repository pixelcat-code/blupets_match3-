export const TOURNAMENT_POLL_TICK_MS = 5_000;
export const TOURNAMENT_DISCONNECTED_POLL_MS = 5_000;
export const TOURNAMENT_LOBBY_SAFETY_POLL_MS = 30_000;
export const TOURNAMENT_LIVE_SAFETY_POLL_MS = 10 * 60_000;
export const TOURNAMENT_DRAFT_SYNC_INTERVAL_MS = 60_000;
export const TOURNAMENT_SESSION_HEARTBEAT_MS = 45_000;
export const TOURNAMENT_FINAL_REFRESH_GRACE_MS = 65_000;
export const TOURNAMENT_FINAL_REFRESH_MAX_RETRIES = 4;
const TOURNAMENT_FINAL_REFRESH_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

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

export function tournamentFinalRefreshRetryDelayMs(attempt) {
  const index = Math.max(0, Math.min(TOURNAMENT_FINAL_REFRESH_RETRY_DELAYS_MS.length - 1, Number(attempt) || 0));
  return TOURNAMENT_FINAL_REFRESH_RETRY_DELAYS_MS[index];
}

export function tournamentSyncErrorCode(error) {
  const raw = typeof error === "string"
    ? error
    : error?.message ?? error?.code ?? "";
  return String(raw).trim().toLowerCase();
}

export function isTournamentTerminalRoomError(error) {
  const code = tournamentSyncErrorCode(error);
  return code === "room_not_found" ||
    code === "not_registered_for_room" ||
    code === "removed_from_room" ||
    code === "unauthorized";
}

export function isTournamentTerminalDraftError(error) {
  const code = tournamentSyncErrorCode(error);
  return code === "attempt_expired" ||
    code === "run_not_found" ||
    code === "room_not_found" ||
    code === "invalid_room_deadline";
}

export function isTournamentSessionConflictError(error) {
  return tournamentSyncErrorCode(error) === "attempt_active_elsewhere";
}

export function isTournamentTerminalSubmissionError(error) {
  const code = tournamentSyncErrorCode(error);
  return code === "attempt_expired" ||
    code === "replay_mismatch" ||
    code === "invalid_actions" ||
    code === "invalid_score" ||
    code === "invalid_moves" ||
    code === "invalid_form" ||
    code === "run_not_found" ||
    code === "room_not_found" ||
    code === "invalid_room_deadline";
}
