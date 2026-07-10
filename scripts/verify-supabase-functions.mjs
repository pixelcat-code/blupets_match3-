import { readFileSync } from "node:fs";

function readBrowserConfig() {
  const text = readFileSync(new URL("../auth-config.js", import.meta.url), "utf8");
  const supabaseUrl = text.match(/supabaseUrl:\s*"([^"]+)"/)?.[1] ?? "";
  const supabaseAnonKey = text.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1] ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("auth-config.js is missing supabaseUrl or supabaseAnonKey");
  }
  return { supabaseUrl, supabaseAnonKey };
}

async function invoke(baseUrl, anonKey, name, body = {}, expectedStatus = 200) {
  const headers = { "content-type": "application/json" };
  if (anonKey) headers.authorization = `Bearer ${anonKey}`;
  const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status !== expectedStatus) {
    throw new Error(`${name}: expected ${expectedStatus}, got ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function invokeRpc(baseUrl, anonKey, name, body = {}) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} RPC: ${res.status} ${await res.text()}`);
  return res.json();
}

const { supabaseUrl, supabaseAnonKey } = readBrowserConfig();

const guestRun = await invoke(supabaseUrl, supabaseAnonKey, "start-guest-run");
if (!guestRun?.runId || !Number.isFinite(Number(guestRun.seed))) {
  throw new Error(`start-guest-run: invalid response ${JSON.stringify(guestRun)}`);
}

await invokeRpc(supabaseUrl, supabaseAnonKey, "get_public_collection", {
  target_user_id: "00000000-0000-0000-0000-000000000000",
});

await invoke(supabaseUrl, "", "start-run", {}, 401);
await invoke(supabaseUrl, "", "submit-run", {}, 401);
await invoke(supabaseUrl, "", "submit-guest-run", {}, 401);
await invoke(supabaseUrl, "", "sync-progress", {}, 401);
await invoke(supabaseUrl, "", "update-account-name", {}, 401);

console.log("Supabase function smoke checks passed.");
