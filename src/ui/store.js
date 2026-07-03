// Shared mutable UI state for the main controller and (eventually) the
// extracted render modules.
//
// ES modules forbid reassigning an imported binding from another file
// (`selectedTile = ...` in a render module would be a SyntaxError). Wrapping
// the mutable controller state in a single exported object sidesteps that:
// every module imports the same `app` reference and mutates its properties,
// which is allowed across module boundaries.
//
// Migration is incremental (P-4 phase 2): one field moves from a `let` in
// main.js to `app.<field>` per commit, with the test suite run after each.
export const app = {
  // Currently-selected board tile (tap-to-select swap flow), or null when no
  // tile is held. Written at the start/end of every swap attempt.
  selectedTile: null,
  // True while a board-resolution animation (swap/clear/drop/cascade) is in
  // flight. Guards input and cascade loops so moves can't overlap.
  isAnimating: false,
  // Which top-level screen is active: "start" | "game" | "victory" |
  // "gameover" | "profile" | "leaderboard" | "public-profile". Drives render()
  // dispatch and history routing.
  currentScreen: "start",
  // Authentication snapshot mirrored from src/auth.js. `configured` flips true
  // once Supabase creds load; `user` is null for guests. Drives the profile
  // chip, auth modal, and sign-in/out UI. Reassigned wholesale in main.js at
  // module init (the real shape lives there); this is the pre-init placeholder.
  authState: {
    configured: false,
    loading: true,
    user: null,
    label: "",
    avatarUrl: "",
    error: "",
  },
  // Local persisted player progress (discovered forms, best score, milestones).
  // Loaded from localStorage via loadProgress() in main.js at module init, which
  // reassigns this field; null is only the pre-init placeholder.
  progress: null,
  // The active gameplay state object (board, score, moves, combo, run config),
  // created when a run starts and null on the start/menu screens. The core
  // match-3 engine in game.js owns its shape; main.js reads/writes it across
  // the render and input paths.
  state: null,
  // ── Leaderboard view-state ────────────────────────────────────────────────
  // Rows fetched from the leaderboard edge function (best-per-user, both
  // categories interleaved). Replaced wholesale on each fetch; read by the
  // leaderboard/profile rank renderers.
  remoteLeaderboard: [],
  // "loading" | "ready" | "error" — drives distinct leaderboard placeholder
  // copy so fetching, an empty board, and a network failure read differently.
  leaderboardStatus: "loading",
  // Which leaderboard category is shown on mobile (where the two columns
  // collapse into a tab switcher). "score" = All Time, "blupets" = collection.
  leaderboardTab: "score",
  // ── Public-profile overlay state ──────────────────────────────────────────
  // When a player name/avatar is tapped from the start-screen meta popup, this
  // holds the in-flight/loaded public profile: { userId, accountName,
  // avatarUrl, entries, storedCollectionTiles, loading, error }. null when no
  // public profile is open in the meta overlay. Read by the meta-overlay and
  // public-profile renderers; reassigned wholesale on open/fetch/error.
  metaPublicProfile: null,
  // Which quest-type tab is active in the quests section ("collection" |
  // "color" | "technique" | "run_goals"). Read by the quest renderers and
  // normalized/written on tab activation. Lives here so render-quests.js can
  // read and update it across the module boundary.
  questTab: "collection",
  // ── Tournament room state ────────────────────────────────────────────────
  // Quick community tournaments are scoped rooms with their own seed, vibe,
  // one-attempt run, and leaderboard. They intentionally do not write to the
  // global progression/leaderboard paths.
  tournamentRoom: null,
  tournamentLeaderboard: [],
  tournamentStatus: "idle",
  tournamentCodeInput: "",
  tournamentCreateStatus: "idle",
  tournamentRunProof: null,
  tournamentPresence: [],
  tournamentIsHost: false,
  tournamentChannel: null,
  tournamentModalOpen: false,
};
