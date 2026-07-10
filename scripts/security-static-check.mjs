import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const failures = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    const stats = statSync(join(root, rel));
    if (stats.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

function fail(message) {
  failures.push(message);
}

for (const file of ["index.html", "vercel.json", "_headers", ...walk("src").filter((f) => f.endsWith(".js"))]) {
  const text = read(file);
  if (text.includes("https://esm.sh")) {
    fail(`${file}: browser-facing code must not load esm.sh`);
  }
}

if (!read("index.html").includes("vendor/supabase-js-2.108.2.js") && !read("src/supabase-client.js").includes("../vendor/supabase-js-2.108.2.js")) {
  fail("Supabase browser SDK must be loaded from vendor/supabase-js-2.108.2.js");
}

if (/style\s*=/.test(read("index.html"))) {
  fail("index.html must not contain inline style attributes");
}

for (const file of walk("src").filter((f) => f.endsWith(".js"))) {
  const text = read(file);
  if (/\.from\(["'`](leaderboard_entries|user_progress|game_runs|guest_game_runs)["'`]\)\s*\.\s*(insert|update|upsert|delete)/.test(text)) {
    fail(`${file}: browser code must not write directly to trusted Supabase tables`);
  }
}

// Tournament seeds are competitive secrets. Lobby endpoints and browser-readable
// tables must never return them; only start-tournament-run may issue a seed for
// one authenticated, live attempt.
const tournamentRoom = read("supabase/functions/get-tournament-room/index.ts");
const tournamentCreate = read("supabase/functions/create-tournament-room/index.ts");
const tournamentStart = read("supabase/functions/start-tournament-run/index.ts");
if (/\.select\("[^"\n]*\bseed\b/.test(tournamentRoom) || /\.select\("[^"\n]*\bseed\b/.test(tournamentCreate)) {
  fail("tournament lobby endpoints must not disclose a deterministic seed");
}
if (!tournamentStart.includes("isTournamentEnded") || !tournamentStart.includes("tournamentAttemptExpiresAt")) {
  fail("start-tournament-run must enforce the room deadline and capped attempt expiry");
}

const guestSubmit = read("supabase/functions/submit-guest-run/index.ts");
if (!guestSubmit.includes("missing_guest_run_id") || guestSubmit.includes('validationMode = "guest_plausibility"')) {
  fail("guest leaderboard submissions must require a replay-verifiable guest run");
}

const progressSync = read("supabase/functions/sync-progress/index.ts");
if (progressSync.includes('.from("leaderboard_entries")')) {
  fail("sync-progress must not let client-owned capsule state alter leaderboard rows");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Static security checks passed.");
