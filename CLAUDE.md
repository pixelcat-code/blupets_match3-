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
- Form gallery now lives in `Profile`. Collection count badges (`×N`) are hidden.
- Profile screen includes `Sign in` and `Sign out`.
- Google + X/Twitter login is wired through Supabase Auth.
- Supabase config is already filled in `auth-config.js`.
- Leaderboard reads validated rows written by Supabase Edge Functions.
- Leaderboard has two columns: **All Time** (best score per user) and **Speed Run** (fewest moves per user), deduped independently.
- Clicking a player's name or avatar in the leaderboard opens their **public profile screen** — identical layout to own profile, showing their discovered forms and stats pulled from `leaderboard_entries`.
- Browser history routing: every screen push calls `history.pushState` with a URL fragment (`#game`, `#profile`, `#leaderboard`, `#public-profile`, `#victory`, `#gameover`, no fragment for start). Browser back/forward buttons navigate between screens.

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
- `src/sync.js` — Supabase calls: `startTrustedRun`, `submitTrustedRun`, `fetchUserProgress`, `fetchGlobalLeaderboard`, `fetchPublicUserEntries`
- `src/auth.js`
- `auth-config.js`
- `docs/supabase-auth-setup.md`

## Current versions (bump on change)

- `styles.css` query string: `?v=20260618-151`
- `main.js` query string: `?v=20260618-148`
- `auth-config.js` query string: `?v=20260617-2`
- `sync.js` import in `main.js`: `?v=20260618-10` — bump this whenever `sync.js` changes

Always bump `?v=` on `styles.css` in `index.html` after any CSS edit, or the browser serves stale CSS.
Always bump the `sync.js?v=` import string inside `main.js` when `sync.js` changes, then bump `main.js?v=` in `index.html` too.

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
- `Leaderboard` opens a two-column board with validated records from Supabase.
- Clicking a player name/avatar in the leaderboard opens their public profile screen (`#public-profile`).
- The profile gallery is dense enough to show all 36 forms without scroll on the current desktop target.
- Progress stays local immediately, then verified wins are submitted through Edge Functions when signed in.
- Browser back button navigates between screens (start ↔ game ↔ leaderboard ↔ profile ↔ public-profile ↔ victory/gameover).

## Current test status

- `npm test` passes (35/35).

## Useful run command

```bash
npm test
```

## If you continue from here

- **Mobile vs desktop**: all mobile changes are in the default (no media query) section of `styles.css`. Desktop overrides live inside `@media (min-width: 700px)`. Never put mobile changes inside the media query.
- **Keep the desktop profile gallery compact**; its layout was tuned to fit all cards in one viewport.
- **Auth modal visibility**: easy to accidentally re-open when changing screen state. The modal only shows when `currentScreen === "start" && !authState.user && !authModalDismissed`.
- **History routing**: `setScreen(screen)` pushes `history.pushState` when the screen changes (guarded by `_inPopstate` flag). `closeProfile()`, `closeLeaderboard()`, and `closePublicProfile()` call `history.back()` — do not revert these to `setScreen()` calls or the back-stack breaks. If you add new screens, follow the same pattern: `setScreen()` pushes, close buttons call `history.back()`, popstate handler restores.
- **`_historyDepth`** counts how many pushes we've made. Close functions check `_historyDepth > 0` before calling `history.back()` to avoid navigating away from the app if there's no stack.
- **Public profile screen** (`#publicProfileScreen`) uses the same CSS classes as the own-profile screen (`.profile-screen`, `.profile-card`, etc.). It is a read-only view — no sign-in/sign-out buttons. Data comes from `fetchPublicUserEntries(userId)` in `sync.js`, which reads `leaderboard_entries` directly (no edge function needed).
- If you change auth flow, update both `src/main.js` and `src/auth.js`.
- Do not re-enable direct browser writes for leaderboard/progress; keep writes behind `start-run` / `submit-run`.
- If you change provider settings or redirect URLs, update `docs/supabase-auth-setup.md` too.
- If you add or rename OAuth token cleanup, make sure `initializeAuth()` still calls `history.replaceState` to strip the `#access_token` fragment after Supabase consumes it.

## Cloud sync status

- `src/sync.js` calls Edge Functions; it does not write Supabase tables directly.
- `supabase/functions/start-run` creates server-issued run seeds.
- `supabase/functions/submit-run` replays action logs and writes server-computed results.
- `fetchPublicUserEntries(userId)` reads `leaderboard_entries` directly (public read, no edge function).
- Schema: `docs/supabase-schema.sql` keeps browser clients read-only for writes.
- Avatar URLs from OAuth are validated (`https:` only) before use in CSS or `<img>` src.

## Notes

- If you need to verify browser behavior, use the local server already running on `http://127.0.0.1:4174`.
- LAN address for phone testing: `http://10.1.1.168:4174` (add to Supabase allowed URLs for OAuth to work).

## Deploy Configuration (configured by /setup-deploy)
- Platform: auto-deploy on git push (Netlify/Vercel/similar)
- Deploy trigger: `git push origin main`
- Project type: static web app (vanilla JS, no build step)
