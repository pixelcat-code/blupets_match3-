# Blupets Match-3 MVP Handoff

This repo is a vanilla JS match-3 game with a responsive mobile-first layout and a desktop layout tuned for 16:9 / 4:3 browser play.

## What is already done

- Desktop responsive layout is implemented.
- Start screen now has:
  - a profile chip in the top-right (mobile: shows `[icon] N/36`; desktop: shows `[icon] Profile`)
  - an auth modal that appears on entry
  - a `Skip` action to bypass login
- Start-screen mute button:
  - **Mobile**: top-left corner, pill shape, blue outline
  - **Desktop**: bottom-left corner, same style
- Profile screen is separate from leaderboard.
- Form gallery now lives in `Profile`.
- Profile screen includes `Sign in` and `Sign out`.
- Google + X/Twitter login is wired through Supabase Auth.
- Supabase config is already filled in `auth-config.js`.
- Leaderboard shows `All Time` and `Speed Run` side by side on one page.
- Leaderboard entries now store/display the account name that set the record.
- Browser history routing: every screen push calls `history.pushState` with a URL fragment (`#game`, `#profile`, `#leaderboard`, `#victory`, `#gameover`, no fragment for start). Browser back/forward buttons navigate between screens.

## Mobile game screen layout (≤699px)

The game frame is a 5-row CSS grid (top to bottom):
1. **Topbar** — 3-column grid: `[← back | mute]` / `[MOVES | SCORE pills]` / `[circular red reroll button]`
2. **Roster row** — 8 color rings in one horizontal flex row
3. **Board** — fills remaining height
4. **Vibe status** — strip + status text
5. **game-footer** — hidden on mobile (display: none)

The desktop reroll medallion+track (`.reroll-dock`) is `display: none` on mobile. The circular reroll HUD (`#reroll-hud`) is `display: none` on desktop.

## Desktop game screen layout (≥700px)

Unchanged from before: 2-column grid, reroll dock in left column, footer with mute at bottom.

## Key files

- `index.html`
- `styles.css`
- `src/main.js`
- `src/auth.js`
- `auth-config.js`
- `docs/supabase-auth-setup.md`

## Current versions (bump on change)

- `styles.css` query string: `?v=20260617-124`
- `main.js` query string: `?v=20260617-117`
- `auth-config.js` query string: `?v=20260617-2`

Always bump `?v=` on `styles.css` in `index.html` after any CSS edit, or the browser serves stale CSS.

## Auth setup status

- Supabase URL and publishable key are already set.
- Google provider is wired.
- X provider uses Supabase provider id `x`.
- The app expects OAuth provider setup to be complete in Google Cloud and X Developer Platform.
- **Mobile testing**: add `http://10.1.1.168:4174` (or whatever the LAN IP is) to **Supabase → Authentication → URL Configuration**. Without this, OAuth redirects fail on mobile.

## Mobile auth notes

- `blupets_return` is stored in `localStorage` (not `sessionStorage`) with a 10-minute expiry JSON payload `{v, exp}`. sessionStorage is wiped by mobile browsers during OAuth tab redirect; localStorage is not.
- `consumeReturnTo()` reads and deletes this key, returning `null` if expired.

## Current UI behavior

- On page load, the auth modal opens.
- `Skip` closes the modal and lets the player continue.
- `Profile` opens the profile screen (shows `N/36` count on mobile chip).
- `Leaderboard` opens a two-column board with `All Time` and `Speed Run` visible together.
- The profile gallery is dense enough to show all 36 forms without scroll on the current desktop target.
- Leaderboard rows include the account name above the record summary.
- Browser back button navigates between screens (start ↔ game ↔ leaderboard ↔ profile ↔ victory/gameover).

## Current test status

- `npm test` passes (33/33).

## Useful run command

```bash
npm test
```

## If you continue from here

- **Mobile vs desktop**: all mobile changes are in the default (no media query) section of `styles.css`. Desktop overrides live inside `@media (min-width: 700px)`. Never put mobile changes inside the media query.
- **Keep the desktop profile gallery compact**; its layout was tuned to fit all cards in one viewport.
- **Auth modal visibility**: easy to accidentally re-open when changing screen state. The modal only shows when `currentScreen === "start" && !authState.user && !authModalDismissed`.
- **History routing**: `setScreen(screen)` pushes `history.pushState` when the screen changes (guarded by `_inPopstate` flag). `closeProfile()` and `closeLeaderboard()` call `history.back()` — do not revert these to `setScreen()` calls or the back-stack breaks. If you add new screens, follow the same pattern: `setScreen()` pushes, close buttons call `history.back()`, popstate handler restores.
- **`_historyDepth`** counts how many pushes we've made. Close functions check `_historyDepth > 0` before calling `history.back()` to avoid navigating away from the app if there's no stack.
- If you change auth flow, update both `src/main.js` and `src/auth.js`.
- If you change leaderboard storage or record structure, update the record payload in `recordVictory()` and the render logic together.
- If you change provider settings or redirect URLs, update `docs/supabase-auth-setup.md` too.
- If you add or rename OAuth token cleanup, make sure `initializeAuth()` still calls `history.replaceState` to strip the `#access_token` fragment after Supabase consumes it.

## Cloud sync (implemented)

- `src/supabase-client.js` — shared Supabase client singleton (used by auth.js and sync.js).
- `src/sync.js` — four exported functions: `loadCloudProgress`, `saveProgressToCloud`, `recordWinToCloud`, `fetchGlobalLeaderboard`.
- On sign-in: cloud progress overwrites local (cloud wins).
- On each win: progress + leaderboard entry saved to Supabase.
- Leaderboard: global read for all users (guests see it too, read-only). Local fallback if offline.
- Schema: `docs/supabase-schema.sql` — run once in the Supabase SQL editor.
- Avatar URLs from OAuth are validated (`https:` only) before use in CSS or `<img>` src.

## Notes

- If you need to verify browser behavior, use the local server already running on `http://127.0.0.1:4174`.
- LAN address for phone testing: `http://10.1.1.168:4174` (add to Supabase allowed URLs for OAuth to work).
