# Security Data Model

Last updated: 2026-07-10

This document is the canonical source for which game fields are trusted, public, and writable.

| Field / area | Source of truth | Writer | Reader | Public? | Validation |
| --- | --- | --- | --- | --- | --- |
| Run seed | Server | `start-run`, `start-guest-run`, `start-tournament-run` Edge Functions | Submit functions / active player only | No | Generated server-side; tournament seed is never exposed in room metadata |
| Run score, moves, T4 form, vibe | Server replay | `submit-run`, `submit-guest-run` | Leaderboard, own progress | Yes in leaderboard | Action log replay from server seed |
| Guest leaderboard row | Server replay | `submit-guest-run` | Leaderboard | Yes | A server-issued `guestRunId` and action log are mandatory |
| `leaderboard_entries.validation_mode` | Server | Submit functions | Leaderboard | Yes | Allowlist constraint |
| Public collection snapshot | Server replay | Submit functions | `get-public-collection`, trusted leaderboard rows | Yes | `verifiedCollectionTiles` only |
| `user_progress.wins/runs/best_score/fewest_moves_win/forms` | Server | Submit functions | Own profile | No direct public table read | Derived from accepted runs |
| `user_progress.progress.verifiedCollectionTiles` | Server | Submit functions | `get-public-collection` allowlist | Yes via Edge Function | Derived from replay state |
| Client capsule collection, shards, capsule stats, quests | Client-local cloud sync | `sync-progress` | Owner only | No | Shape/size sanitation only |
| Account display name | User input | `update-account-name` | Leaderboard/profile labels | Yes | Atomically reserved by a server-only unique index |
| Avatar URL | OAuth provider or uploaded storage URL | Auth/profile flow | UI/profile/leaderboard | Yes | `https:` URL allowlist before rendering |

Rules:

- Browser code must not write directly to `leaderboard_entries`, `game_runs`, `guest_game_runs`, or trusted progress columns.
- Public profile data must be returned through allowlisted Edge Functions, not direct global reads of `user_progress`.
- Client-owned capsule/economy fields must not affect public ranking until capsule opening moves to server-side logic.
- New public fields need an entry in this table before implementation.
