import test from "node:test";
import assert from "node:assert/strict";
import {
  TOURNAMENT_DISCONNECTED_POLL_MS,
  TOURNAMENT_DRAFT_SYNC_INTERVAL_MS,
  TOURNAMENT_LIVE_SAFETY_POLL_MS,
  TOURNAMENT_LOBBY_SAFETY_POLL_MS,
  tournamentDraftSyncDelayMs,
  tournamentPollIntervalMs,
} from "../src/util/tournament-sync-policy.js";

test("tournament polling stays fast only while Realtime is unavailable", () => {
  assert.equal(tournamentPollIntervalMs({ channelJoined: false, roomStatus: "lobby" }), TOURNAMENT_DISCONNECTED_POLL_MS);
  assert.equal(tournamentPollIntervalMs({ channelJoined: true, roomStatus: "lobby" }), TOURNAMENT_LOBBY_SAFETY_POLL_MS);
  assert.equal(tournamentPollIntervalMs({ channelJoined: true, roomStatus: "live" }), TOURNAMENT_LIVE_SAFETY_POLL_MS);
});

test("tournament drafts save immediately once, then batch during play", () => {
  const now = 1_000_000;
  assert.equal(tournamentDraftSyncDelayMs({ immediate: true, lastAttemptAt: now, now }), 0);
  assert.equal(tournamentDraftSyncDelayMs({ lastAttemptAt: 0, now }), 0);
  assert.equal(
    tournamentDraftSyncDelayMs({ lastAttemptAt: now - 30_000, now }),
    TOURNAMENT_DRAFT_SYNC_INTERVAL_MS - 30_000,
  );
  assert.equal(tournamentDraftSyncDelayMs({ lastAttemptAt: now - TOURNAMENT_DRAFT_SYNC_INTERVAL_MS, now }), 0);
});
