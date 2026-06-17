# Supabase Setup

This app supports optional Google and X/Twitter login through Supabase Auth, with cloud sync for progress and a global leaderboard. The game still works without auth; missing config only disables sign-in and cloud features.

## 1. Create Supabase project

Create a project at Supabase, then copy:

- Project URL
- `anon` public API key

Put them in `auth-config.js`:

```js
window.BLUPETS_AUTH_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY",
};
```

The anon key is intended for browser use. Never put service-role keys in this file.

## 2. Run the database schema

Open **Dashboard → SQL Editor → New query**, paste the contents of `docs/supabase-schema.sql`, and run it. This creates:

- `user_progress` — one row per user, stores wins/runs/forms/bestScore
- `leaderboard_entries` — one row per win, globally readable

Row Level Security is enabled on both tables.

## 3. Enable auth providers

In **Dashboard → Authentication → Providers**:

- Enable **Google**
- Enable **X / Twitter** (OAuth 2.0)

For each provider, create the OAuth app in the provider console and paste the client ID / secret into Supabase. The Supabase provider ID for X/Twitter is `x`.

## 4. Set redirect URLs

In **Dashboard → Authentication → URL Configuration**, add every URL the app runs at:

```
http://127.0.0.1:4174
http://localhost:4174
https://your-deployed-domain.example
```

The app redirects back to the current page, stripping the `#hash` and `?demo=` param.

## 5. Implemented features

- Google sign-in
- X/Twitter sign-in
- Sign-out
- **Cloud progress sync** — on sign-in, local progress is replaced by cloud data; on each win, progress and the leaderboard entry are saved to Supabase
- **Global leaderboard** — all players (including guests) see the shared board; guests' wins are local-only
- **Avatar URL security** — provider avatar URLs are validated (`https:` only) before use in CSS or `<img>` src

## 6. Account merge policy

Currently: **cloud wins on first sign-in**. Local-only progress played as a guest is replaced by whatever is stored in Supabase. This is the simplest model. Merge logic can be added to `initializeAuth` in `src/main.js` if needed later.
