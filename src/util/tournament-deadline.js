// Shared tournament deadline rules. Keep the server as the authority, while the
// browser uses the same pure calculations only to present an honest disabled UI.

export function tournamentEndMs(value) {
  const ms = new Date(value ?? "").getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isTournamentEnded(endsAt, now = Date.now()) {
  const endMs = tournamentEndMs(endsAt);
  return endMs === null || now >= endMs;
}

export function tournamentAttemptExpiresAt(startedAtMs, durationMs, roomEndsAtMs) {
  return Math.min(startedAtMs + Math.max(1, durationMs), roomEndsAtMs);
}
