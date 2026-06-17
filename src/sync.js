// Cloud leaderboard/progress writes are intentionally disabled in the browser.
// A public client can forge score, moves, forms, and progress; trusted sync must
// go through a server/Edge Function that validates a run before writing.

export async function fetchGlobalLeaderboard() {
  return [];
}
