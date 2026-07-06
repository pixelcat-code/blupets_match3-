import { test, expect } from "@playwright/test";

const SUPABASE_GLOB = "**yccfnorilbisrxbwtlwv.supabase.co/**";

// Mirror the helper from smoke.spec.mjs: fires a native DOM click that runs
// the bound handler regardless of CSS pointer-events / opacity state.
function clickEl(page, selector) {
  return page.locator(selector).evaluate((el) => el.click());
}

// Mirror openApp from smoke.spec.mjs: block Supabase so the app runs as an
// offline guest and reaches the start screen quickly.
async function openApp(page) {
  await page.route(SUPABASE_GLOB, (route) => route.abort());
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  await page.goto("/");
  return pageErrors;
}

// The Lobby is auth-gated: a guest tapping it must hit the sign-in modal first,
// NOT the tournament create/join modal. Guards enterTournament()'s guest guard.
test("guest tapping Lobby opens the auth modal, not the tournament modal", async ({ page }) => {
  const errors = await openApp(page);

  await expect(page.locator("#startScreen")).toBeVisible();

  await clickEl(page, '[data-meta-nav="tournament"]');

  await expect(page.locator("#authModal")).toBeVisible();
  await expect(page.locator("#tournamentModal")).toBeHidden();

  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});

// The tournament modal's Join/Create tabs swap the visible form, and Join is the
// default. Guests can't reach the modal through the UI (auth gate above), so this
// force-reveals it and drives the tab handler (setTournamentModalTab) directly.
test("tournament modal tabs swap the visible form (Join is the default)", async ({ page }) => {
  const errors = await openApp(page);

  // Join ships as the active tab in the markup (swapped ahead of Create).
  await expect(page.locator("#tournamentTabJoin")).toHaveClass(/is-active/);

  // Reveal the modal (normally shown only after sign-in) to exercise the tabs.
  await page.locator("#tournamentModal").evaluate((el) => { el.hidden = false; });

  // Switch to Create → create form shows, join hides.
  await clickEl(page, "#tournamentTabCreate");
  await expect(page.locator("#tournamentModalCreateForm")).toBeVisible();
  await expect(page.locator("#tournamentModalJoinForm")).toBeHidden();

  // Switch back to Join → join form shows, create hides.
  await clickEl(page, "#tournamentTabJoin");
  await expect(page.locator("#tournamentModalJoinForm")).toBeVisible();
  await expect(page.locator("#tournamentModalCreateForm")).toBeHidden();

  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});
