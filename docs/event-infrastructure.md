# Run-badge event infrastructure

The event system is independent from ordinary capsules. No event content is
created by migrations, and no event is active by default.

## Product rules

- Only authenticated normal runs can award event badges.
- A run must be replay-verified, started during the active event, and submitted
  before the event ends.
- Every eligible run awards exactly one weighted-random badge.
- `run_id` is unique, so retries and simultaneous requests return the original
  badge instead of creating another one.
- Guest runs and tournament runs use separate tables/functions and never call
  the award RPC.
- Badge definitions and rank count are dynamic per event.
- Ranking compares counts from highest rank to lowest rank, then places first
  the player who reached the identical vector earlier.
- Results remain visible for seven days by default and can be archived early to
  replace them with another event.

## Final tables

- `events` — lifecycle and presentation configuration.
- `event_badge_definitions` — badge content, rank, asset, and drop weight.
- `event_run_badge_awards` — immutable one-run/one-badge ledger.
- `player_event_badge_progress` — leaderboard-ready player aggregation.
- `event_winner_snapshots` — frozen top three for the results screen.

The cleanup migration `202607121600_run_event_badges.sql` removes the abandoned
capsule-event and server-capsule tables/functions before creating this schema.

## Lifecycle

```text
draft -> scheduled -> active -> results -> archived
```

Service-role controls:

- `activate_event(event_id)`
- `finish_event(event_id, reason)`
- `archive_event(event_id, reason)`
- `replace_event(old_event_id, new_event_id)`

`refresh_event_lifecycle()` performs scheduled transitions and captures the
final top three.

## Award path

`submit-run` replays the normal run from its server seed. After claiming the
run, it calls:

```sql
award_event_badge_for_run(user_id, run_id, run_created_at, secure_roll)
```

The RPC independently verifies that the row belongs to the authenticated user,
is submitted, and started inside the active event window. Existing awards are
returned before lifecycle checks so a lost response can always be recovered.

## Launch checklist

1. Apply the cleanup migration only with explicit production approval.
2. Delete the four retired capsule Edge Functions with
   `npm run supabase:event:delete-retired`.
3. Deploy `submit-run` and `get-event`; do not change guest/tournament submitters.
4. Create one draft event and its badge definitions.
5. Test weighted selection, run retries, simultaneous submits, event end time,
   ranking order, winner capture, and early replacement.
6. Add final badge names, art, rank labels, and weights.
7. Run unit tests and the complete Playwright suite.
8. Activate only with explicit production approval.
