import { test, expect } from "@playwright/test";

// Black-box smoke net for src/main.js. Each test loads the real page with all
// Supabase network blocked, so the app runs as an offline guest. The assertions
// pin the screen-routing wiring (setScreen toggling `hidden`), the board build,
// the in-game back button, and history (browser back/forward) — the surfaces a
// main.js refactor (P-4) is most likely to break.

const SUPABASE_GLOB = "**yccfnorilbisrxbwtlwv.supabase.co/**";

// The Start button is revealed by a CSS animation tied to the real-browser
// asset/interaction lifecycle; in headless it stays opacity:0 / pointer-events:none,
// so Playwright's normal click is intercepted by the container. These smoke tests
// care about the click HANDLER (does Start → board), not the reveal animation, so
// we fire a native DOM click that runs the bound handler regardless of CSS state.
function clickEl(page, selector) {
  return page.locator(selector).evaluate((el) => el.click());
}

/**
 * Set up a page with Supabase blocked and uncaught page errors collected.
 * Returns the errors array so a test can assert nothing threw.
 */
async function openApp(page) {
  // Block every call to the live Supabase project. Aborted fetches make
  // startGuestRun / getSession reject fast, so the app falls back to a local
  // guest seed immediately instead of waiting out the 8s handshake timeout.
  await page.route(SUPABASE_GLOB, (route) => route.abort());

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/");
  return pageErrors;
}

test("start screen renders with the Start button", async ({ page }) => {
  const errors = await openApp(page);

  await expect(page.locator("#startScreen")).toBeVisible();
  await expect(page.locator("#start-run")).toBeVisible();
  // No other screen should be showing on load.
  await expect(page.locator("#gameScreen")).toBeHidden();

  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});

test("tapping Start deals a full 8x8 board", async ({ page }) => {
  const errors = await openApp(page);

  await clickEl(page, "#start-run");

  // Game screen takes over and the board fills with 64 tiles.
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#startScreen")).toBeHidden();
  await expect(page.locator("#board .tile")).toHaveCount(64);

  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});

test("in-game back button returns to the start screen", async ({ page }) => {
  await openApp(page);

  await clickEl(page, "#start-run");
  await expect(page.locator("#gameScreen")).toBeVisible();

  await clickEl(page, "#back-to-start");
  await expect(page.locator("#startScreen")).toBeVisible();
  await expect(page.locator("#gameScreen")).toBeHidden();
});

test("browser back and forward navigate between start and game", async ({ page }) => {
  await openApp(page);

  await clickEl(page, "#start-run");
  await expect(page.locator("#gameScreen")).toBeVisible();

  // Browser Back → start screen.
  await page.goBack();
  await expect(page.locator("#startScreen")).toBeVisible();
  await expect(page.locator("#gameScreen")).toBeHidden();

  // Browser Forward → game screen again (history idx must survive the round-trip).
  await page.goForward();
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#startScreen")).toBeHidden();
});

// --- Meta-render coverage --------------------------------------------------
// These widen the net ahead of the stateful main.js split (P-4 phases 2-3),
// which reorganises the render pipeline. render() calls renderAuth /
// renderLeaderboard / renderProfile / renderMetaOverlay / renderCollectionScreen
// / renderQuestsScreen TOGETHER on every screen change (they paint their own
// hidden containers), so any navigation here exercises that whole batch. The
// safety assertion is "no uncaught error during those renders".
//
// As an offline guest, collection/quests require auth, so those popups aren't
// directly reachable — but their render functions still run inside render() on
// each navigation below, which is what the refactor must not break.
//
// NOT covered: victory / gameover screens. Reaching them needs a full played-out
// run (deterministic win/lose), too slow/flaky for a smoke net.
// renderVictoryScreen / renderGameoverScreen must be checked manually if touched.

test("the profile chip opens the auth modal for a guest (no render errors)", async ({ page }) => {
  const errors = await openApp(page);

  await clickEl(page, "#profileChip");

  // Guest → auth modal (a signed-in user would get the account popup instead).
  await expect(page.locator("#authModal")).toBeVisible();
  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});

test("opening the leaderboard meta popup renders without errors", async ({ page }) => {
  const errors = await openApp(page);

  await clickEl(page, "#start-leaderboard");

  // Desktop viewport → the leaderboard opens as the meta popup overlay.
  await expect(page.locator("#metaPopup")).toBeVisible();
  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});

test("desktop section page has a real history entry (browser Back closes it)", async ({ page }) => {
  // On desktop the section "popups" are full-screen PAGES with their own history
  // entry: the address fragment reflects the section and browser Back closes the
  // page instead of exiting the app. Guards the openMetaOverlay/popstate wiring.
  const errors = await openApp(page);

  await clickEl(page, "#start-leaderboard");
  await expect(page.locator("#metaPopup")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("#rank");

  // Browser Back → the page closes, back to the start screen (not out of the app).
  await page.goBack();
  await expect(page.locator("#metaPopup")).toBeHidden();
  await expect(page.locator("#startScreen")).toBeVisible();

  // Browser Forward → the page reopens (history idx survives the round-trip).
  await page.goForward();
  await expect(page.locator("#metaPopup")).toBeVisible();

  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});
