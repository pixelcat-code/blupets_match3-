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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Static security checks passed.");
