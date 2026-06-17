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

export async function fetchUserProgress() {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from("user_progress")
    .select("wins, runs, best_score, fewest_moves_win, forms")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    wins: data.wins ?? 0,
    runs: data.runs ?? 0,
    bestScore: data.best_score ?? 0,
    fewestMovesWin: data.fewest_moves_win ?? null,
    forms: data.forms ?? {},
  };
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

  // Track best-score AND best-speed entry per user independently.
  // A single dedup by score would discard fast runs with lower scores.
  const byScore = new Map();
  const bySpeed = new Map();
  for (const row of data ?? []) {
    const uid = row.user_id;
    if (!byScore.has(uid) || row.score > byScore.get(uid).score) {
      byScore.set(uid, row);
    }
    if (!bySpeed.has(uid) || row.moves_used < bySpeed.get(uid).moves_used) {
      bySpeed.set(uid, row);
    }
  }

  // Union of both sets; a user may contribute 1 or 2 distinct rows.
  const seen = new Set();
  const unique = [];
  for (const row of [...byScore.values(), ...bySpeed.values()]) {
    const key = `${row.user_id}:${row.score}:${row.moves_used}`;
    if (!seen.has(key)) { seen.add(key); unique.push(row); }
  }

  return unique.map((row) => ({
    userId: row.user_id,
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
