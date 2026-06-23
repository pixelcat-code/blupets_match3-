# Capsule Collection System Plan

## Goal

Move tile collection away from direct run unlocks into a capsule loop:

```txt
Play run -> earn capsules -> open capsules -> unlock collection tiles
Duplicate tile -> shards -> exchange shards for more capsules
Achievement badges -> one-time bonus capsules
```

Monetization is intentionally deferred. The current implementation should stay local-first and playable without purchases.

## Final Collection Model

The collection has 324 collectible evolution forms, split into three capsule drop tiers:

```txt
Base       = T2 / Base Evolved forms  = 180 tiles
Advanced   = T3 / Advanced forms      = 108 tiles
Ascended   = T4 / Ascended forms      = 36 tiles
Total                                  = 324 tiles
```

Basic color blocks are not collectible capsule drops.

## Capsule Economy

There is one capsule type. Each capsule rolls one tier:

```txt
Base       78%
Advanced   19%
Ascended    3%
```

Duplicate conversion:

```txt
Base duplicate       -> 1 shard
Advanced duplicate   -> 5 shards
Ascended duplicate   -> 25 shards
```

Shard exchange:

```txt
25 shards -> 1 capsule
```

## Pity Rules

Pity is part of the core capsule system:

```txt
15 capsules without a new tile       -> next capsule guarantees a new tile
40 capsules without Advanced+        -> next capsule guarantees Advanced or Ascended
100 capsules without Ascended        -> next capsule guarantees Ascended
```

Priority order when multiple pity counters are active:

```txt
Ascended pity > Advanced+ pity > new-tile pity > normal odds
```

## Run Score Rewards

Score reward is non-cumulative. Use final run score:

```txt
0-4,999        -> 0 capsules
5,000-9,999    -> 1 capsule
10,000-19,999  -> 2 capsules
20,000-34,999  -> 3 capsules
35,000-49,999  -> 4 capsules
50,000-74,999  -> 5 capsules
75,000-99,999  -> 7 capsules
100,000+       -> 10 capsules
```

## Badge / Achievement Rewards

Existing milestone badges remain as achievement history, but they now also grant one-time bonus capsules when first unlocked.

Current implemented reward by badge tier:

```txt
common      -> +1 capsule
uncommon    -> +2 capsules
rare        -> +3 capsules
epic        -> +5 capsules
legendary   -> +10 capsules
```

This is intentionally simple and can be tuned after UI testing.

## Already Implemented

Core data layer in `src/progress.js`:

- `COLLECTION_TILES`: canonical 324 collection tiles.
- `COLLECTION_TIERS`: `base`, `advanced`, `ascended`.
- `CAPSULE_DROP_ODDS`: `78/19/3`.
- `CAPSULE_PITY`: `15/40/100`.
- `DUPLICATE_SHARDS`: `1/5/25`.
- `SHARDS_PER_CAPSULE`: `25`.
- `SCORE_CAPSULE_REWARDS`: score threshold table.
- `capsulesForScore(score)`.
- `openCapsule(progress, rng)`.
- `exchangeShardsForCapsules(progress, maxCapsules)`.
- `getCollectionTileEntries(progress)`.
- `foldRun(...)` now awards score capsules and one-time milestone bonus capsules.
- `foldRun(...)` records reached run forms in `inventoryForms` / evolution history only; capsule collection tiles are unlocked only by `openCapsule(...)`.
- `getAscendedKeyByFormKey(formKey)` maps any Base/Advanced/Ascended form to its lineage's Ascended key.
- `collectionLineageStageLevel(progress, apexKey)` lets the evolution tree unlock only the deepest collection tier the player actually owns.

UI layer in `src/main.js` / `styles.css`:

- Own profile Inventory tab now shows full `Collection N/324` progress.
- Mobile profile chip now shows full collection progress `N/324`.
- Own profile Inventory tab renders a capsule panel:
  - capsules balance;
  - shards balance;
  - one large capsule CTA that opens the fullscreen reveal modal;
  - `Exchange Shards`;
- Own profile Inventory tab renders all 324 collection tiles grouped by:
  - `Base` (`180`);
  - `Advanced` (`108`);
  - `Ascended` (`36`).
- Own Inventory collection cards are display-only; tapping them no longer opens the lineage evolution tree.
- Profile tabs are `Inventory`, `Quests`, and `Settings`.
- Quests are grouped by quest type tabs, sorted by difficulty inside each type, and rendered as progress rows with completion marks instead of rarity cards.
- Public profile remains Ascended-only until cloud schema supports public `collectionTiles`.
- Gameover summary is capsule-first:
  - no longer shows newly opened forms;
  - shows the final score and one capsule CTA;
  - the CTA opens all available capsules when any are ready, otherwise it is disabled;
  - the capsule roll happens only after clicking the large `assets/blocks/origin.svg` cube in that modal;
  - the modal hides the underlying screen during opening, builds glow intensity, flashes almost fullscreen, then reveals the opened form/card grid.
- Own profile Inventory uses the same fullscreen capsule reveal flow:
  - one large capsule CTA opens all ready capsules;
  - no inline recent-result cards are shown in the inventory panel;
  - shard exchange remains as the secondary action.

Tests in `tests/progress.test.mjs`:

- 324 tile shape: `180/108/36`.
- Score reward thresholds.
- Score capsules + milestone capsules.
- Capsule opening.
- Duplicate -> shards.
- Shards -> capsules.
- New tile pity.
- Advanced+ pity.
- Ascended pity.

Latest test / smoke status:

```txt
npm test -> 64/64 passing
Browser smoke:
- Inventory tab: 324 cards, Base 180, Advanced 108, Ascended 36, capsule panel present
- Quests tab: 70 quests grouped by type tabs, no visible rarity grouping
- Gameover and inventory capsule CTAs reveal tiles in the same fullscreen modal; neither surface renders duplicate recent-result cards after closing
- Gameover reveal desktop/mobile smoke: capsule SVG present, batch summary present, centered layout, no console errors
```

## Important Current Limitation

The capsule system is still local-only. Public profiles and cloud sync still expose only old Ascended `forms` until the Supabase schema/API is updated.

## Next Implementation Steps

1. Tune the collection grid density after visual review on mobile and desktop.

2. Further tune capsule reveal UX after visual review:

- adjust timing/scale of the capsule bounce/crack animation;
- decide whether multi-open should keep the current full grid or use a paged/compact summary for very large capsule counts;
- add stronger duplicate/shards feedback if needed.

3. Add a deterministic UI smoke/test path for opening capsules:

- seed localStorage with capsules;
- click the inventory capsule CTA;
- assert collection count changes;
- seed shards;
- click `Exchange Shards`;
- assert capsule balance changes.

4. Clean up old local records if needed.

Current collection behavior:

- New runs no longer write reached forms into `collectionTiles`.
- `collectionTiles` is now capsule-only for new progress writes.
- Older local saves may already contain polluted `collectionTiles` from the removed bridge; there is no per-tile source flag in those records, so clearing/migrating that data should be an explicit product decision.

5. Cloud sync / public profile follow-up:

- extend Supabase `user_progress` to store `collectionTiles`, `capsules`, `shards`, and `capsuleStats`;
- update Edge Functions and `sync.js`;
- update public profile to show 324 collection tiles if public collection display is desired.

6. Cache bust after UI changes:

- If `styles.css` changes, bump `styles.css?v=` in `index.html` and `CLAUDE.md`.
- If `src/main.js` changes, bump `main.js?v=` in `index.html` and `CLAUDE.md`.
- If `src/progress.js` changes, bump its import query in `src/main.js`, then bump `main.js?v=`.

## Files Most Likely To Change Next

```txt
src/main.js
styles.css
tests/progress.test.mjs
index.html
CLAUDE.md
```

## Design Constraints To Preserve

- Do not reintroduce Codex/family/bronze/silver/gold terminology.
- Use Blupix/game terms:
  - Collection
  - Inventory
  - Base
  - Advanced
  - Ascended
  - Capsule
  - Shards
  - Vibe
- Keep badges separate from collection. Badges are achievement history + capsule rewards.
- Keep public profile read-only and conservative until cloud schema is updated.
- Avoid nested cards in profile UI.
- Keep profile tabs: Collection/Inventory and Badges must remain separate.
