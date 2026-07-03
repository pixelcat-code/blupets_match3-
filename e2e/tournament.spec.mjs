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

test("tournament modal opens from the start screen", async ({ page }) => {
  const errors = await openApp(page);

  await expect(page.locator("#startScreen")).toBeVisible();

  await clickEl(page, "#start-tournament");

  const modal = page.locator("#tournamentModal");
  await expect(modal).toBeVisible();
  await expect(page.locator("#tournamentModalCreateForm")).toBeVisible();
  await expect(page.locator("#tournamentModalJoinForm")).toBeVisible();

  // Close via backdrop click.
  await clickEl(page, "#tournamentModalBackdrop");
  await expect(modal).toBeHidden();

  expect(errors, errors.map((e) => e.message).join("\n")).toHaveLength(0);
});
