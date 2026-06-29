# Blupets Match-3 MVP: аудит безопасности, UI/UX и трудоемкости процессов

Дата аудита: 2026-06-29.

## Executive summary

Проект - vanilla JS статическое приложение с Supabase Auth, Supabase Storage, публичным leaderboard и Edge Functions на Deno/TypeScript. Базовые защитные контуры уже есть: CSP/security headers в `vercel.json` и `_headers`, RLS включен, прямые browser writes в ключевые таблицы отозваны, Supabase service-role key не найден в browser-delivered файлах, avatar URL фильтруется до `https:`, тесты проходят (`npm test`: 73/73).

Главные подтвержденные проблемы:

1. Серверная проверка score/leaderboard не соответствует документации: `submit-run` больше не replay-ит action log, а принимает client-reported результат после plausibility-check. Это позволяет пользователю с валидной сессией подать завышенный, но попадающий в лимиты score.
2. `sync-progress` и `submit-guest-run` доверяют клиентскому progress snapshot для cloud-профиля/коллекции. Это не раскрывает чужие данные, но делает коллекцию, квесты и публичный collection state подменяемыми владельцем аккаунта.
3. Есть расхождения между документацией, комментариями и кодом. Они повышают риск будущих небезопасных изменений: handoff и docs говорят "replay", а код прямо говорит "We no longer replay".
4. UI/UX стартового потока принудительно открывает auth modal поверх первого экрана. Guest-игра работает, но `Collection`/`Quests` locked/disabled до входа; на mobile нижняя навигация видима под auth modal.
5. Процесс разработки дорогой из-за очень крупных файлов (`src/main.js` 5183 строки, `styles.css` 8827 строк), ручных cache-bust query strings и отдельного ручного deploy Edge Functions.

Проверенные артефакты: `output/playwright/start-auth-desktop.png`, `output/playwright/start-desktop.png`, `output/playwright/game-desktop.png`, `output/playwright/start-mobile.png`.

## Critical / High

### H-1. Leaderboard result можно подделать в пределах plausibility bounds

Severity: High.

Location:

- `supabase/functions/submit-run/index.ts:75-79`
- `supabase/functions/submit-run/index.ts:91-122`
- `supabase/functions/submit-run/index.ts:234-247`
- `supabase/functions/submit-run/index.ts:291-294`
- противоречащая документация: `CLAUDE.md:114`, `docs/supabase-auth-setup.md:3`, `docs/supabase-auth-setup.md:60`

Evidence:

```ts
// Plausibility bounds for a client-reported completed run. We no longer replay
// the action log server-side; instead we sanity-check the reported result...
```

`validateResult()` проверяет только типы/границы: `score <= 10_000_000`, `movesUsed >= 5`, `movesUsed <= 10_000`, строки ограничены длиной. После этого `entry` создается из `result.score`, `result.movesUsed`, `result.formKey`, `result.colorId`, `result.partnerColorId`, `result.vibe` и вставляется в `leaderboard_entries`.

Impact: авторизованный пользователь может вызвать `submit-run` с валидным `runId` и искусственным результатом, который пройдет текущие bounds/rate-limit, и попасть в публичный leaderboard.

Fix:

- Вернуть replay в `submit-run`: импортировать/дублировать deterministic game engine для Deno, replay-ить `body.actions` от server-issued `run.seed`, сравнивать computed `score`, `movesUsed`, `formKey`, `colorId`, `partnerColorId`, `vibe` с client summary.
- До replay не писать `user_progress` и `leaderboard_entries`.
- Добавить edge/unit tests: forged high score rejected; altered moves rejected; altered final form rejected; valid replay accepted.
- Обновить документацию только после фактического replay.

Mitigation if replay is too expensive short-term:

- Снизить `MAX_SCORE` до фактического максимума, измеренного тестами/симуляциями.
- Добавить server-side min duration based on score/moves, not only `MIN_RUN_DURATION_MS = 3000`.
- Временно помечать такие rows как `validation_mode = 'plausibility'` и не смешивать с trusted replay leaderboard.

False-positive notes: это не предположение. Код прямо говорит, что replay больше не используется, и вставляет client-reported result.

### H-2. Guest-run promotion пишет leaderboard без seed/replay

Severity: High for leaderboard integrity.

Location:

- `supabase/functions/submit-guest-run/index.ts:71-100`
- `supabase/functions/submit-guest-run/index.ts:178-190`
- `supabase/functions/submit-guest-run/index.ts:225-228`
- `CLAUDE.md:22`

Evidence:

`submit-guest-run` принимает `body.result`, проверяет те же broad bounds (`MAX_SCORE = 10_000_000`, `MIN_MOVES = 5`) и вставляет row в `leaderboard_entries`. Handoff документирует это как "plausibility-only, no pre-issued seed".

Impact: после sign-in можно сохранить pending guest run с подмененным score/collection state. Идентичность берется из auth user, но результат и коллекционная статистика берутся из клиента.

Fix, с учетом продуктового требования оставить guest run в leaderboard:

- Оставить `submit-guest-run`, но явно считать этот путь `plausibility_checked`, а не `replay_verified`.
- Добавить в схему `leaderboard_entries.validation_mode` со значениями вроде `replay_verified` / `guest_plausibility`.
- В UI можно продолжать показывать guest rows в общем leaderboard, но в админке/аналитике и будущих античит-правилах отличать эти строки.
- Лучший следующий шаг без отключения guest leaderboard: при старте guest run выдавать anonymous/pre-auth server seed, а после sign-in привязывать run к user and replay.

Mitigation:

- Ужесточить bounds и cooldown для `submit-guest-run`.
- Добавить `validation_mode`, даже если guest rows остаются в основном рейтинге.

### H-3. Cloud progress и public collection доверяют client-owned snapshot

Severity: High for data integrity, Medium for data privacy.

Location:

- `supabase/functions/sync-progress/index.ts:15-38`, `68-80`
- `supabase/functions/submit-run/index.ts:220-232`, `255-276`
- `supabase/functions/submit-guest-run/index.ts:166-176`, `201-222`
- `supabase/functions/get-public-collection/index.ts:18-39`
- `docs/supabase-schema.sql:32-37`

Evidence:

`sync-progress` sanitizes shape and size, then upserts client-sent `progress`. `get-public-collection` reads `user_progress.progress.collectionTiles` through service-role and returns it for public profile display. `docs/supabase-schema.sql` also has global read policy for `user_progress`.

Impact: владелец аккаунта может подменить свои capsules/shards/collectionTiles/quests/progress. Это влияет на публичный профиль и любые рейтинги/бейджи, которые используют эти поля. Чужие private secrets здесь не выявлены, но целостность игровых данных не обеспечена.

Fix:

- Разделить данные:
  - `trusted_progress`: только server-derived fields from replay/capsule server logic.
  - `client_preferences`: tutorialSeen, muted, local UI state.
  - `public_collection`: server-derived collection only.
- `sync-progress` не должен принимать счетчики, коллекцию, shards/capsules и milestones как source of truth.
- `get-public-collection` должен читать только server-derived public fields.

Mitigation:

- Пока серверной capsule логики нет, явно маркировать public collection как "local/profile" и не использовать в competitive ranking.

Status 2026-06-29:

- Implemented for public/ranking integrity: `submit-run` and `submit-guest-run` now derive leaderboard `blupets_count` and `collection_tiles` from replay state plus existing `serverCollectionTiles`, not from client `familyBadges` or `progress.collectionTiles`.
- Implemented for privacy: `get-public-collection` returns only `progress.serverCollectionTiles`; `user_progress` canonical RLS is own-read only.
- Implemented for compatibility: `sync-collection` remains callable but no longer updates leaderboard rows from client data.
- Remaining: capsule inventory, shards, and milestones are still client-local cloud sync fields. Full integrity for those requires a server-side capsule-open/economy function.

## Medium

### M-1. Документация безопасности не соответствует исполняемому коду

Severity: Medium.

Location:

- `CLAUDE.md:112-116`
- `docs/supabase-auth-setup.md:3`, `60`
- `src/sync.js:33-35`
- `supabase/functions/submit-run/index.ts:75-79`

Evidence:

Docs/client comments говорят, что сервер replay-ит action log; Edge Function говорит "We no longer replay".

Impact: будущий разработчик может считать leaderboard trusted и строить новые функции поверх неподтвержденного результата.

Fix:

- После H-1 обновить все docs/comments в один источник правды.
- Добавить `docs/security-model.md` с таблицей "field -> source of truth -> trusted/untrusted -> visible where".
- В CI добавить проверку, что `submit-run` содержит replay acceptance test.

### M-2. Public user_progress globally readable в schema docs

Severity: Medium privacy/design risk.

Location:

- `docs/supabase-schema.sql:32-37`
- `supabase/functions/get-public-collection/index.ts:18-39`

Evidence:

Schema doc создает `user_progress: global read using (true)`. Edge Function comment говорит, что service-role нужен, потому что RLS "own read" может блокировать another user's row. Эти две модели конфликтуют.

Impact: если live DB следует `docs/supabase-schema.sql`, браузер может читать полные `user_progress` rows, включая progress JSON, а не только public-safe `collectionTiles`. Если live DB следует older own-read policy, функция работает как service-role public facade. По репозиторию нельзя подтвердить live policy, но конфликт в SQL/doc доказан.

Fix:

- Сделать canonical migration: revoke global read from `user_progress`; allow own read only.
- Public data отдавать через `get-public-collection`, но ограничивать ответ allowlist полей и размером.
- Обновить `docs/supabase-schema.sql` и комментарии.

Status 2026-06-29: implemented via `202606291520_lock_user_progress_public_reads.sql`, `docs/supabase-schema.sql`, and `get-public-collection`.

### M-3. Third-party dependency loaded via dynamic import from esm.sh without SRI

Severity: Medium supply-chain risk.

Location:

- `src/supabase-client.js:1`, `16-24`
- `deno.lock:3-7`
- `vercel.json:8-9`

Evidence:

Original finding: browser imported `https://esm.sh/@supabase/supabase-js@2`; CSP allowed `https://esm.sh`. Deno lock pinned only Edge Function remote import hashes, not browser dynamic import integrity.

Impact: third-party JS has first-party privileges in the browser origin. CSP limits source to esm.sh but does not provide SRI for dynamic import.

Fix:

- Prefer vendoring/self-hosting pinned Supabase browser bundle.
- Or add a build step that bundles `@supabase/supabase-js` into first-party JS.
- Keep CSP `script-src 'self'` once CDN dependency is removed.

Status 2026-06-29: implemented for the browser app. Supabase JS is bundled into `vendor/supabase-js-2.108.2.js`, `src/supabase-client.js` imports that first-party file, and browser CSP no longer allows `https://esm.sh`. Edge Functions still use Deno remote imports, covered by Deno locking/deploy bundling rather than browser CSP.

### M-4. Inline styles force `style-src 'unsafe-inline'`

Severity: Medium defense-in-depth.

Location:

- `vercel.json:8-9`
- `_headers:15-16`
- `index.html:187`, `196`
- dynamic inline styles in `src/main.js:2959`, `2968`, `3782`

Evidence:

CSP has `style-src 'self' 'unsafe-inline'`. Repo comments say inline style attributes require it.

Impact: if DOM XSS appears elsewhere, `unsafe-inline` makes CSS injection easier. It does not enable JS execution by itself, but weakens CSP.

Fix:

- Replace dynamic inline color/background styles with CSS variables set via audited helper or finite class allowlists.
- Move `style="display: none"` initial states to CSS classes/hidden attributes.
- Then tighten CSP style-src.

Status 2026-06-29: partially implemented. Static modal `style="display:none"` attributes were replaced with `hidden`; evolution partner modal rendering and public-profile avatar action were moved away from HTML strings containing inline style attributes. CSP still needs `style-src 'unsafe-inline'` because board layout, FX positioning, progress bars, and several generated UI fragments still use runtime inline styles. Full closure requires a larger render/CSS refactor.

### M-5. UI navigation exposes locked destinations inconsistently

Severity: Medium UX / access control clarity.

Location:

- `src/main.js:859-863`
- `src/main.js:820-829`
- `index.html:437-454`
- Playwright mobile snapshot: bottom nav shows Home/Collect/Quests/Rank/Guide while auth modal is open.

Evidence:

Desktop start buttons for Collection/Quests are disabled in snapshot. Mobile bottom nav buttons are visible and not disabled in markup; click is gated later by `openMetaSection`, which opens auth modal for collection/quests.

Impact: mobile users see destinations that look available, then get blocked by auth. This increases taps and makes "Skip" feel less honest because major sections remain locked.

Fix:

- Reflect locked state on mobile nav: `aria-disabled`, disabled visual state, and auth prompt on tap with clear reason.
- Or let guest users view read-only Collection/Quests from local in-memory state and show "sign in to save/sync".

Status 2026-06-29: implemented via the first option. Mobile nav now marks Collection/Quests as locked and disabled for signed-out users, while Leaderboard and Guide remain accessible. The click handler ignores locked mobile nav buttons before opening a section.

### M-6. Auth modal is first interaction and competes with "Enter Run"

Severity: Medium UX conversion risk.

Location:

- `src/main.js:1770-1782`
- `index.html:80-128`
- Playwright desktop/mobile snapshots show auth modal on initial load.

Evidence:

Original finding: `shouldShowAuthModal()` returned true on start when not logged in and not dismissed. Snapshot showed modal focus on Skip before user could press Enter Run.

Impact: the primary game action is behind an account decision. For a casual game MVP, this adds friction before value is demonstrated.

Fix:

- Make first screen playable by default; move sign-in prompt to post-run save moment.
- Keep profile chip available for voluntary login.
- If auth prompt stays, change copy to explicitly say "Skip and play locally".

Status 2026-06-29: implemented. The auth modal no longer opens automatically on first load; it opens only from explicit sign-in/profile/auth-required actions. Guest users can press Enter Run immediately and still participate in guest leaderboard flow.

## Low / Positive Findings

### L-1. Browser direct writes to core tables are explicitly revoked

Severity: Positive.

Location:

- `supabase/migrations/202606172000_security_hardening.sql:8-19`
- `docs/supabase-schema.sql:83-91`

Evidence:

`revoke insert, update, delete` for `leaderboard_entries` and `user_progress`; `game_runs` revoked from `authenticated` and `anon`. This is correct for preventing direct table writes from the browser.

Keep:

- Preserve writes through Edge Functions only.
- Add migration tests or SQL smoke-check docs for live policy verification.

### L-2. Avatar URL and DOM output have meaningful escaping/allowlisting

Severity: Positive with caveat.

Location:

- `src/main.js:1476-1496`
- `src/main.js:3425-3487`
- `supabase/functions/submit-run/index.ts:28-39`
- `supabase/functions/update-account-name/index.ts:23-31`

Evidence:

`escapeHtml()` escapes text used in HTML templates. `safeImgSrc()` allows only `https:` normalized URLs. `safeCssUrl()` strips risky characters before CSS `url(...)`. Server-side avatar extraction also only returns `https:`.

Keep:

- Continue using `textContent` where possible.
- For future user-generated rich content, do not add raw `innerHTML`; add sanitizer/Trusted Types first.

### L-3. CSP and security headers exist in both Vercel and Netlify-compatible configs

Severity: Positive.

Location:

- `vercel.json:3-15`
- `_headers:15-20`

Evidence:

Headers include CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `frame-ancestors 'none'`.

Improve:

- After removing esm.sh and inline styles, tighten to `script-src 'self'`; remove `'unsafe-inline'` from style-src if feasible.

## UI/UX Audit

### Confirmed current behavior

- Initial desktop and mobile load opens auth modal (`Sign in to your profile`) over the start screen.
- Desktop start screen has primary `Enter Run`; Collection and Quests are disabled until auth; Leaderboard and Guide are available.
- Mobile start has bottom nav Home/Collect/Quests/Rank/Guide visible under auth modal.
- Guest `Enter Run` works after Skip; game screen shows Moves, Score, roster, vibe strip, board and a one-step coachmark.
- Console during guest run has one warning: `[sync] run started while signed out - result will be local-only.`

### UI/UX improvements

1. Move auth from first-run blocker to save/sync moment.
   - Concrete change: initial `shouldShowAuthModal()` should return false unless user taps Profile/locked cloud feature or completes a run.
   - Benefit: one tap to game instead of modal decision first.

2. Make guest/local mode explicit.
   - Concrete change: on start or profile chip show "Guest · local only" after Skip; on gameover show "Sign in to save this run".
   - Benefit: user understands why Collection/Quests may be locked or local.

3. Align mobile nav state with desktop locked state.
   - Concrete change: apply `.is-locked`, `aria-disabled`, and disabled styling to mobile Collection/Quests when not signed in, or unlock them as read-only local screens.

4. Replace text-only mobile nav with icon+label controls.
   - Concrete change: use icons for Home, Collection, Quests, Rank, Guide; keep labels short.
   - Benefit: faster scan and better match for bottom-nav pattern.

5. Add loading/error states for remote leaderboard/profile that are visually distinct.
   - Code already has loading/error text paths in `src/main.js:1058-1075` and `3421-3473`; make them skeleton/empty states with retry buttons.

6. Preserve coachmark but expose "don't show again" through progress.
   - The guide is currently one step and blocks the board. Store completion in progress and avoid repeating after first run for signed-in/local users.

## Process / Maintainability Audit

### Confirmed complexity hotspots

- `src/main.js`: 5183 lines.
- `styles.css`: 8827 lines.
- `src/game.js`: 1446 lines.
- Manual cache-bust rules in `CLAUDE.md:53-61`; actual imports in `index.html:12`, `index.html:474`, `src/main.js:18`, `src/main.js:53`, `src/main.js:66`.
- Frontend deploy is git push, but Edge Functions deploy separately per `CLAUDE.md:116`.
- Current working tree was already dirty before report creation: `CLAUDE.md`, `index.html`, `styles.css`.

### Process improvements

1. Add a build step to eliminate manual query-string cache busting.
   - Use Vite or a minimal asset-manifest script.
   - Output hashed assets; remove manual `?v=` bump requirements.

2. Split `src/main.js` by ownership.
   - Suggested modules:
     - `ui/auth-view.js`
     - `ui/leaderboard-view.js`
     - `ui/profile-view.js`
     - `ui/meta-nav.js`
     - `ui/game-screen.js`
     - `flows/run-submit.js`
   - Start with pure extraction only; no behavior changes.

3. Split `styles.css` by screen.
   - Suggested files:
     - `base.css`
     - `start.css`
     - `game.css`
     - `profile.css`
     - `leaderboard.css`
     - `mobile-nav.css`
   - Bundle via build step.

4. Add CI checks.
   - `npm test`.
   - Static grep/security checks for `innerHTML`, `eval`, direct `.from(...).insert/update` in browser code, and version/comment drift.
   - Playwright smoke tests for start -> skip -> enter run -> first board visible, mobile nav state, leaderboard load state.

   Status 2026-06-29: partially implemented. `npm run check:security-static` now covers browser CDN/inline-style/direct-table-write regressions. A GitHub Actions workflow was prepared locally but could not be pushed because the current GitHub token lacks `workflow` scope; Playwright CI smoke remains pending.

5. Unify Edge Function deployment.
   - Add script:
     - `supabase:functions:deploy`: deploy all functions.
     - `supabase:verify`: call health/smoke endpoint or run a known unauthorized request test.
   - Document exact deploy order with migrations.

   Status 2026-06-29: implemented npm scripts `supabase:functions:deploy` and `supabase:verify`; setup docs now use these commands.

6. Create a security model doc and keep it canonical.
   - Fields: score, moves, collectionTiles, capsules, shards, account_name, avatar_url, progress.
   - Columns: source, trusted/untrusted, writer, reader, public/private, validation.

   Status 2026-06-29: implemented in `docs/security-data-model.md`.

7. Add DB policy verification SQL.
   - A small `docs/supabase-policy-check.sql` that lists grants and RLS policies for `user_progress`, `leaderboard_entries`, `game_runs`, `storage.objects`.

   Status 2026-06-29: implemented in `docs/supabase-policy-check.sql`.

## Recommended execution order

1. Fix leaderboard integrity: H-1 first, H-2 second.
2. Split trusted vs client-owned progress: H-3.
3. Correct docs/comments to match implemented security model.
4. Adjust auth-first UX and mobile locked state.
5. Add CI + Playwright smoke tests.
6. Add build step and remove manual cache busting.
7. Split `main.js` and `styles.css` after behavior is protected by tests.

## Verification performed

- `npm test`: passed, 73/73.
- Local server: `npm run serve` on `http://127.0.0.1:4174`.
- Playwright desktop/mobile snapshots and screenshots:
  - `output/playwright/start-auth-desktop.png`
  - `output/playwright/start-desktop.png`
  - `output/playwright/game-desktop.png`
  - `output/playwright/start-mobile.png`

## Out of scope / not verified

- Live Supabase project policies and deployed function versions were not queried.
- OAuth provider dashboards were not inspected.
- Production response headers were inferred from repo config (`vercel.json`, `_headers`), not from a live deployed URL.
