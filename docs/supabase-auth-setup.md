# Supabase Setup

This app supports optional Google and X/Twitter login through Supabase Auth. Progress and leaderboard writes are intentionally local-only in the browser until a trusted server or Supabase Edge Function validates runs before writing shared data.

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
- `leaderboard_entries` — one row per validated win, globally readable

Row Level Security is enabled on both tables. Browser clients can read allowed rows but cannot insert/update progress or leaderboard rows directly.

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
- **Local progress** — wins/runs/forms stay in browser storage
- **Cloud writes disabled** — direct browser writes to progress and leaderboard are blocked because they are forgeable
- **Avatar URL security** — provider avatar URLs are validated (`https:` only) before use in CSS or `<img>` src

## 6. Enabling trusted cloud sync later

To enable a real global leaderboard or cloud progress, add a server-side endpoint or Supabase Edge Function that:

- verifies the user's JWT server-side
- validates/replays the run or applies another anti-tamper proof
- writes `user_progress` and `leaderboard_entries` using service-role credentials
- keeps the browser anon key limited to read-only RLS policies
