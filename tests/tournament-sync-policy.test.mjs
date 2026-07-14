import test from "node:test";
import assert from "node:assert/strict";
import {
  TOURNAMENT_DISCONNECTED_POLL_MS,
  TOURNAMENT_DRAFT_SYNC_INTERVAL_MS,
  TOURNAMENT_LIVE_SAFETY_POLL_MS,
  TOURNAMENT_LOBBY_SAFETY_POLL_MS,
  TOURNAMENT_SESSION_HEARTBEAT_MS,
  isTournamentSessionConflictError,
  isTournamentTerminalDraftError,
  isTournamentTerminalRoomError,
  isTournamentTerminalSubmissionError,
  tournamentFinalRefreshRetryDelayMs,
  tournamentDraftSyncDelayMs,
  tournamentPollIntervalMs,
  tournamentSyncErrorCode,
} from "../src/util/tournament-sync-policy.js";

test("tournament polling stays fast only while Realtime is unavailable", () => {
  assert.equal(tournamentPollIntervalMs({ channelJoined: false, roomStatus: "lobby" }), TOURNAMENT_DISCONNECTED_POLL_MS);
  assert.equal(tournamentPollIntervalMs({ channelJoined: true, roomStatus: "lobby" }), TOURNAMENT_LOBBY_SAFETY_POLL_MS);
  assert.equal(tournamentPollIntervalMs({ channelJoined: true, roomStatus: "live" }), TOURNAMENT_LIVE_SAFETY_POLL_MS);
});

test("final standings retries quickly with a bounded backoff", () => {
  assert.equal(tournamentFinalRefreshRetryDelayMs(0), 5_000);
  assert.equal(tournamentFinalRefreshRetryDelayMs(1), 15_000);
  assert.equal(tournamentFinalRefreshRetryDelayMs(2), 30_000);
  assert.equal(tournamentFinalRefreshRetryDelayMs(99), 60_000);
});

test("tournament drafts save immediately once, then batch during play", () => {
  assert.ok(TOURNAMENT_SESSION_HEARTBEAT_MS < 120_000);
  const now = 1_000_000;
  assert.equal(tournamentDraftSyncDelayMs({ immediate: true, lastAttemptAt: now, now }), 0);
  assert.equal(tournamentDraftSyncDelayMs({ lastAttemptAt: 0, now }), 0);
  assert.equal(
    tournamentDraftSyncDelayMs({ lastAttemptAt: now - 30_000, now }),
    TOURNAMENT_DRAFT_SYNC_INTERVAL_MS - 30_000,
  );
  assert.equal(tournamentDraftSyncDelayMs({ lastAttemptAt: now - TOURNAMENT_DRAFT_SYNC_INTERVAL_MS, now }), 0);
});

test("terminal tournament errors stop retries that cannot recover", () => {
  assert.equal(tournamentSyncErrorCode(new Error("room_not_found")), "room_not_found");
  assert.equal(isTournamentTerminalRoomError(new Error("not_registered_for_room")), true);
  assert.equal(isTournamentTerminalRoomError(new Error("network_error")), false);
  assert.equal(isTournamentTerminalDraftError(new Error("attempt_expired")), true);
  assert.equal(isTournamentTerminalDraftError(new Error("replay_mismatch")), false);
  assert.equal(isTournamentTerminalSubmissionError(new Error("replay_mismatch")), true);
  assert.equal(isTournamentTerminalSubmissionError(new Error("run_too_fast")), false);
  assert.equal(isTournamentSessionConflictError(new Error("attempt_active_elsewhere")), true);
});
