# Security Data Model

Last updated: 2026-06-29

This document is the canonical source for which game fields are trusted, public, and writable.

| Field / area | Source of truth | Writer | Reader | Public? | Validation |
| --- | --- | --- | --- | --- | --- |
| Run seed | Server | `start-run`, `start-guest-run` Edge Functions | Submit functions | No | Generated server-side |
| Run score, moves, T4 form, vibe | Server replay | `submit-run`, `submit-guest-run` | Leaderboard, own progress | Yes in leaderboard | Action log replay from server seed |
| Guest leaderboard row | Server replay when `guestRunId` exists; plausibility fallback otherwise | `submit-guest-run` | Leaderboard | Yes | `guest_replay_verified` or `guest_plausibility` |
| `leaderboard_entries.validation_mode` | Server | Submit functions | Leaderboard | Yes | Allowlist constraint |
| Public collection snapshot | Server replay | Submit functions | `get-public-collection`, leaderboard rows | Yes | `serverCollectionTiles` only |
| `user_progress.wins/runs/best_score/fewest_moves_win/forms` | Server | Submit functions | Own profile | No direct public table read | Derived from accepted runs |
| `user_progress.progress.serverCollectionTiles` | Server | Submit functions | `get-public-collection` allowlist | Yes via Edge Function | Derived from replay state |
| Client capsule collection, shards, capsule stats, quests | Client-local cloud sync | `sync-progress` | Owner only | No | Shape/size sanitation only |
| Account display name | User input | `update-account-name` | Leaderboard/profile labels | Yes | Length/character sanitation in Edge Function |
| Avatar URL | OAuth provider or uploaded storage URL | Auth/profile flow | UI/profile/leaderboard | Yes | `https:` URL allowlist before rendering |

Rules:

- Browser code must not write directly to `leaderboard_entries`, `game_runs`, `guest_game_runs`, or trusted progress columns.
- Public profile data must be returned through allowlisted Edge Functions, not direct global reads of `user_progress`.
- Client-owned capsule/economy fields must not affect public ranking until capsule opening moves to server-side logic.
- New public fields need an entry in this table before implementation.
