import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260617-1";

export async function startTrustedRun() {
  const { configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("start-run", { body: {} });
  if (error) throw error;
  if (!data?.runId || !Number.isInteger(data.seed)) {
    throw new Error("Trusted run service returned an invalid run.");
  }
  return { runId: data.runId, seed: data.seed >>> 0, actions: [] };
}

export async function submitTrustedRun(runId, actions) {
  const { configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("submit-run", {
    body: { runId, actions },
  });
  if (error) throw error;
  return data;
}

export async function fetchGlobalLeaderboard(limit = 100) {
  const { configured } = getSupabaseConfig();
  if (!configured) return [];

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from("leaderboard_entries")
    .select("user_id, account_name, avatar_url, score, moves_used, t4_color, t4_partner, t4_form_key, vibe, created_at")
    .not("user_id", "is", null)
    .order("score", { ascending: false })
    .limit(limit * 5);

  if (error) throw error;

  const best = new Map();
  for (const row of data ?? []) {
    const uid = row.user_id;
    if (!best.has(uid) || row.score > best.get(uid).score) {
      best.set(uid, row);
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.moves_used - b.moves_used)
    .slice(0, limit)
    .map((row) => ({
      accountName: row.account_name ?? "Player",
      avatarUrl: row.avatar_url ?? "",
      score: row.score,
      movesUsed: row.moves_used,
      t4Color: row.t4_color,
      t4Partner: row.t4_partner,
      t4FormKey: row.t4_form_key,
      vibe: row.vibe,
      timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
    }));
}
