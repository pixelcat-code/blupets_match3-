// Pure leaderboard ordering for tournament entries: highest score first, then
// fewer moves, then earliest submission. Mirrors the server-side ORDER BY so the
// UI and edge functions rank identically. Returns a new array with `rank` set.
export function rankTournamentEntries(entries) {
  return [...(entries ?? [])]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.movesUsed ?? 0) !== (b.movesUsed ?? 0)) return (a.movesUsed ?? 0) - (b.movesUsed ?? 0);
      return new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime();
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
