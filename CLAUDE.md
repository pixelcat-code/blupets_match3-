# Blupets Match-3 — project guide

Vanilla-JS match-3 game. No build step: `index.html` loads ES modules directly.
Mobile-first responsive layout with a desktop layout tuned for 16:9 / 4:3.
Cloud features (auth, leaderboard, progress) run on Supabase. **Production is
live and shared with real players — do not push or deploy without explicit OK.**

## Run & test

```bash
# local server already runs at http://127.0.0.1:4174 (LAN: http://10.1.1.168:4174)
npm test                 # node:test unit suite — 75 tests, must stay green
npx playwright test      # e2e smoke suite — 6 tests, must stay green
```

Run BOTH after any change to `src/` and report real results (anti-degradation
rule #1 — never claim "passes" without running it).

## Where to look (topic → files)

Quick jump-table. Each row points at the file(s) to open first; the detailed
section (linked by name) has the rules. `render-*` is "one screen cluster per
file", so the screen name usually IS the file name.

| I want to change… | Open first | See section |
| --- | --- | --- |
| Match-3 engine (matches, cascades, scoring, special tiles, endless) | `src/game.js` | Architecture |
| Progress / capsules / collection / quests data | `src/progress.js`, `src/ui/quest-logic.js` | Architecture |
| A screen's HTML (what it shows) | `src/ui/render-<screen>.js` | Architecture · Module rules |
| A screen's behavior (DOM, events, routing) | `src/main.js` (the `render*`/controller for it) | Architecture · History routing |
| Shared UI state (cross-module) | `src/ui/store.js` (`app.*`) | Architecture |
| Leaderboard | `src/ui/render-leaderboard.js` + controller in `main.js` | Architecture |
| Profile / collection / capsules / evo-tree | `src/ui/render-profile-stats.js`, `render-collection.js`, `render-capsules.js`, `render-evo-tree.js` | Architecture |
| In-run HUD / board markup | `src/ui/render-game.js` + `renderBoard` in `main.js` | Architecture |
| Auth (sign-in/up, OAuth, avatar) | `src/main.js` **and** `src/auth.js` (change together) | Auth |
| Cloud submit / leaderboard write / anti-cheat | `src/sync.js` + `supabase/functions/<fn>` | Cloud sync |
| Styles / layout / responsive | `styles.css` (mobile = default, desktop = `@media 700px`) | Layout rules |
| Back-button / URL fragments | `setScreen`/`close*` in `src/main.js` | History routing |
| HTML escaping / safe img/css URLs | `src/ui/dom-safety.js` | Architecture |
| The `elements` DOM registry | `src/ui/dom.js` | Architecture |
| Cache-bust versions (`?v=`) | `index.html` | Cache-busting |

When unsure which `render-*` file owns a screen, `grep` the visible text or a CSS
class from the screen across `src/ui/`.

## Architecture

The app was split out of a ~4.6k-line `src/main.js` monolith (refactor P-4).
The current shape:

- **`src/main.js`** — the controller/glue layer. Holds the screens' DOM
  controllers (`renderProfile`, `renderMetaOverlay`, `render*Screen`,
  `renderAuth*`, `renderModals`, `renderGameover/VictoryScreen`,
  `openEvoTree`/`closeEvoTree`, `render()`), event wiring, history routing, and
  run lifecycle. A function that touches `elements.`/DOM lives here.
- **`src/ui/store.js`** — `export const app = {...}`: the single shared mutable
  UI state object (`selectedTile`, `isAnimating`, `currentScreen`, `authState`,
  `progress`, `state`, leaderboard view-state, `metaPublicProfile`, `questTab`).
  ES modules can't reassign an imported binding, so every module imports the
  same `app` and mutates its fields. **New cross-module state goes here, not as
  a `let` in main.js.**
- **`src/ui/render-*.js`** — pure HTML-string builders, one cluster per file:
  `render-game` (in-run HUD), `render-meta` (nav + meta-overlay title/status),
  `render-leaderboard`, `render-profile-stats`, `render-collection`,
  `render-public-profile`, `render-capsules`, `render-capsule-reveal`,
  `render-guide`, `render-quests`, `render-account`, `render-evo-tree`. They
  take data, return strings, and never touch `elements.`/DOM.
- **`src/ui/`** helpers — `dom.js` (the `elements` registry), `dom-safety.js`
  (`escapeHtml`, `safeImgSrc`, `safeCssUrl`), `block-assets.js`,
  `quest-logic.js`, `share-card.js`.
- **`src/util/`** — framework-free utils (`auth-label.js`, `tiles.js`).
- **Engine & services** — `game.js` (match-3 core), `progress.js`, `rng.js`,
  `run-replay.js`, `vibes.js`, `combo-feedback.js`, `coachmarks.js`, `audio.js`,
  `blupets-canon*.js`, `sync.js` (Supabase calls), `auth.js`,
  `supabase-client.js` (loads `vendor/supabase-js-2.108.2.js`).

### Module rules
- **Modules must NEVER import from `src/main.js`.** Anything two clusters share
  moves to a shared module (that's why `render-meta.js` exists).
- Before adding a cross-import, check for a cycle (`grep ^import` the target).
- `render-*` modules read state via `app` (store) and build strings; controllers
  in `main.js` own the `elements`/DOM writes and event handling.

## Cache-busting (`?v=`) — critical

Every module/asset is loaded with a `?v=` query string so browsers don't serve
stale files. The discipline:

- Edit `styles.css` → bump its `?v=` in `index.html`.
- Edit any `src/` module → bump that module's `?v=` in **every** importer, and
  if an importer's file content changed, bump ITS `?v=` in its own importers
  (the cascade reaches `main.js`).
- Edit `src/main.js` → bump `main.js?v=` (the `brand-ui-N` string) in
  `index.html`, +1 each commit.

Current versions (bump on change):
- `styles.css` → `?v=20260629-start-loading-1`
- `src/main.js` → `?v=20260629-brand-ui-35`
- `auth-config.js` → `?v=20260617-2`
- `sync.js` import in `main.js` → `?v=20260629-guest-replay-1`
- `auth.js` import in `main.js` → `?v=20260629-signin-guard-1`

## Layout rules

- **Mobile (≤699px) is the default (no media query) CSS.** Desktop overrides
  live in `@media (min-width: 700px)`. Never put mobile changes inside the media
  query.
- Keep the desktop profile gallery compact — it's tuned to fit all 36 forms in
  one viewport without scroll.
- Mobile game screen is a 5-row grid: topbar / roster / board / vibe-status /
  footer(hidden). Desktop is 2 columns: board right, controls left.

## History routing

- `setScreen(screen)` pushes `history.pushState` with a URL fragment (`#game`,
  `#profile`, `#leaderboard`, `#public-profile`, `#victory`, `#gameover`; none
  for start), guarded by `_inPopstate`.
- `closeProfile()` / `closeLeaderboard()` / `closePublicProfile()` call
  `history.back()` — **do not** revert these to `setScreen()` or the back-stack
  breaks. New screens follow the same pattern; close buttons check
  `_historyDepth > 0` before `history.back()`.

## Auth

- Username + password (synthetic `{slug}@players.blupets.game` internally; email
  hidden from users, used only for future recovery). Google + X/Twitter OAuth
  also wired (X uses Supabase provider id `x`). Email confirmation disabled.
- Avatar upload (JPEG/PNG/WebP ≤2 MB) → Supabase Storage
  `avatars/{userId}/avatar.{ext}`, cache-busted with `?v={timestamp}`. OAuth
  avatar URLs are validated (`https:` only) before use.
- Auth modal shows only when `currentScreen === "start" && !authState.user &&
  !authModalDismissed` — easy to re-open accidentally on screen-state changes.
- `blupets_return` is stored in `localStorage` (not sessionStorage — wiped
  during the OAuth tab redirect on mobile) with a 10-min expiry;
  `consumeReturnTo()` reads+deletes it.
- `initializeAuth()` must keep calling `history.replaceState` to strip the
  `#access_token` fragment after Supabase consumes it.
- Auth flow spans `src/main.js` and `src/auth.js` — change both together.
- For mobile OAuth, the LAN origin must be in Supabase → Authentication → URL
  Configuration.

## Cloud sync (Supabase edge functions)

- `src/sync.js` calls edge functions only — it never writes Supabase tables
  directly. **Do not re-enable direct browser writes for leaderboard/progress.**
- `start-run` issues server run seeds (deletes the user's prior unsubmitted
  run). `submit-run` replays the action log server-side and rejects results that
  don't match. Account name/avatar come from the authed user, never the client.
- Guests: `start-guest-run` → on finish, "Sign in to save" → after sign-in
  `applyPendingGuestRun` calls `submit-guest-run` to replay-verify before
  writing. Leaderboard rows are tagged `replay_verified` /
  `guest_replay_verified` / `guest_plausibility`.
- `fetchPublicUserEntries(userId)` reads `leaderboard_entries` directly (public
  read, no edge function) for the public-profile screen.
- Deploy edge functions separately:
  `npx supabase functions deploy <name> --project-ref yccfnorilbisrxbwtlwv`
  (CLI is authed + linked). A `git push` deploys ONLY the Vercel frontend.

## Deploy

- Frontend: `git push origin main` → Vercel auto-deploy. Static, no build step.
- Edge functions: deploy via the Supabase CLI (above) — push does not touch them.
- DB schema: `docs/supabase-schema.sql` (browser clients stay read-only for
  writes). If you change providers/redirect URLs, update
  `docs/supabase-auth-setup.md` too.

## Key files

`index.html`, `styles.css`, `auth-config.js`, `vercel.json`, `_headers`,
`src/main.js`, `src/ui/*`, `src/util/*`, `src/sync.js`, `src/auth.js`,
`supabase/functions/*`, `docs/supabase-auth-setup.md`, `docs/supabase-schema.sql`.
