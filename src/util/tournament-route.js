function normalizeRouteTournamentCode(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

// Keep an active tournament room addressable. This lets a regular browser
// refresh restore the same room through the existing invite deep-link flow.
// As soon as the player navigates to another screen, the room prefix is
// removed so `/t/CODE` does not leak into unrelated pages.
export function tournamentUrlForScreen({
  screen,
  pathname = "/",
  tournamentCode = "",
} = {}) {
  const code = normalizeRouteTournamentCode(tournamentCode);
  if (screen === "tournament" && code) return `/t/${code}`;

  const path = String(pathname || "/").startsWith("/t/") ? "/" : String(pathname || "/");
  return path + (screen && screen !== "start" ? `#${screen}` : "");
}
