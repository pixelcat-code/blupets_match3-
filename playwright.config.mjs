import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests for the Blupets match-3 app.
//
// These exist as a SAFETY NET for refactoring the 5200-line src/main.js
// (audit item P-4): they drive the real served page in a browser and assert
// screen-routing + board rendering, so they stay valid no matter how the JS
// is internally reorganised.
//
// All Supabase traffic is stubbed inside the specs (route abort) so the suite
// runs fully offline and never touches the live project / leaderboard.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
    // Run under reduced motion: the start screen has an entrance animation plus
    // several looping decorative layers (rays/auras/particles). The app silences
    // them under prefers-reduced-motion, which keeps the Start button stable and
    // clickable instead of perpetually "in motion" for Playwright's actionability.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Reuse the dev server if it is already running (CLAUDE.md notes one is
  // usually up on 4174); otherwise start the same static server the project uses.
  webServer: {
    command: "python3 -m http.server 4174 --bind 127.0.0.1",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
