# Supabase Setup

This app supports optional Google and X/Twitter login through Supabase Auth. Signed-in run submissions go through Supabase Edge Functions that replay a submitted run from a server-issued seed before writing trusted rows. Guest runs are still allowed into the leaderboard after sign-in; new guest runs receive a server seed from `start-guest-run` and are replay-verified by `submit-guest-run`.

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

Open **Dashboard → SQL Editor → New query**, paste the contents of `docs/supabase-schema.sql`, and run it. This creates read-only browser policies for:

- `user_progress` — one row per user, reserved for trusted backend writes
- `game_runs` — server-issued run seeds and submit status
- `leaderboard_entries` — one row per accepted run, globally readable; signed-in runs are `replay_verified` and guest-promotion runs are always `guest_replay_verified`

Row Level Security is enabled. Browser clients can read allowed rows but cannot insert/update progress, run seeds, or leaderboard rows directly.

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

The app redirects back to the current page, stripping the `#hash`.

## 5. Implemented features

- Google sign-in
- X/Twitter sign-in
- Sign-out
- **Supabase progress** — trusted wins, runs, forms, and public collection snapshots are written by replay-verified run submissions; client-local capsule/quest state is stored only as private account progress
- **Leaderboard writes** — `start-run` and `start-guest-run` issue server seeds; both submit routes replay-verify an action log. `sync-progress` stores private progress and optionally publishes a canonicalized capsule collection snapshot in the same request.
- **Avatar URL security** — provider avatar URLs are validated (`https:` only) before use in CSS or `<img>` src

## 6. Deploy Edge Functions

Deploy all functions after applying the schema:

```bash
npm run supabase:functions:deploy
npm run supabase:verify
```

Required function secrets:

```bash
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Never put the service-role key in browser-delivered files.
