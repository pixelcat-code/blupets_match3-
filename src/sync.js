import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260617-1";

// supabase-js wraps a non-2xx edge-function response in a FunctionsHttpError
// whose `.context` is the raw Response. Pull the server's `{ error: "code" }`
// out of it so the real reason (e.g. "too_many_open_runs", "rate_limited")
// reaches the UI instead of a generic "Edge Function returned a non-2xx" string.
async function fnErrorCode(error) {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    }
  } catch {
    // body already consumed or not JSON — fall through to the generic message
  }
  return error?.message || "unknown_error";
}

export async function startTrustedRun() {
  const { configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("start-run", { body: {} });
  if (error) throw new Error(await fnErrorCode(error));
  if (!data?.runId || !Number.isInteger(data.seed)) {
    throw new Error("Trusted run service returned an invalid run.");
  }
  return { runId: data.runId, seed: data.seed >>> 0, actions: [] };
}

// `result` is the client-reported win: { score, movesUsed, formKey, formName,
// colorId, partnerColorId, vibe }. `extra` may include trusted-write metadata
// such as the current collection snapshot. The server validates plausibility
// and writes the leaderboard entry; browsers stay RLS-blocked from direct table
// writes.
export async function submitTrustedRun(runId, result, extra = {}) {
  const { configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("submit-run", {
    body: { runId, result, ...extra },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function syncCollectionSnapshot(extra = {}) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("sync-collection", {
    body: extra,
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function syncProgressSnapshot(progress) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("sync-progress", {
    body: { progress },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function fetchUserProgress() {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from("user_progress")
    .select("wins, runs, best_score, fewest_moves_win, forms, progress")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const snapshot = data.progress && typeof data.progress === "object" && !Array.isArray(data.progress)
    ? data.progress
    : {};
  return {
    ...snapshot,
    wins: data.wins ?? 0,
    runs: data.runs ?? 0,
    bestScore: data.best_score ?? 0,
    fewestMovesWin: data.fewest_moves_win ?? null,
    forms: { ...(snapshot.forms ?? {}), ...(data.forms ?? {}) },
  };
}

export async function fetchPublicUserEntries(userId) {
  const { configured } = getSupabaseConfig();
  if (!configured) return [];

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from("leaderboard_entries")
    .select("score, moves_used, blupets_count, family_badges, t4_color, t4_partner, t4_form_key, created_at")
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    score: row.score,
    movesUsed: row.moves_used,
    blupetsCount: Number(row.blupets_count ?? countFamilyBadges(row.family_badges) ?? 0),
    familyBadges: row.family_badges ?? {},
    t4Color: row.t4_color,
    t4Partner: row.t4_partner,
    t4FormKey: row.t4_form_key,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
  }));
}

function countFamilyBadges(familyBadges) {
  if (!familyBadges || typeof familyBadges !== "object" || Array.isArray(familyBadges)) return 0;
  return Object.values(familyBadges).reduce((sum, value) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? sum + Math.max(0, Math.min(9, n)) : sum;
  }, 0);
}

export async function fetchGlobalLeaderboard(limit = 100) {
  const { configured } = getSupabaseConfig();
  if (!configured) return [];

  const client = await getSupabaseClient();
  const select =
    "user_id, account_name, avatar_url, score, moves_used, blupets_count, family_badges, t4_color, t4_partner, t4_form_key, vibe, created_at";
  const [scoreResult, blupetsResult] = await Promise.all([
    client
      .from("leaderboard_entries")
      .select(select)
      .not("user_id", "is", null)
      .order("score", { ascending: false })
      .limit(limit * 5),
    client
      .from("leaderboard_entries")
      .select(select)
      .not("user_id", "is", null)
      .order("blupets_count", { ascending: false })
      .order("score", { ascending: false })
      .limit(limit * 5),
  ]);

  if (scoreResult.error) throw scoreResult.error;
  if (blupetsResult.error) throw blupetsResult.error;
  const data = [...(scoreResult.data ?? []), ...(blupetsResult.data ?? [])];

  // Track best-score AND best-collection entry per user independently.
  // A single dedup by score would discard larger collections with lower scores.
  const byScore = new Map();
  const byBlupets = new Map();
  for (const row of data ?? []) {
    const uid = row.user_id;
    row.blupets_count = Number(row.blupets_count ?? countFamilyBadges(row.family_badges) ?? 0);
    if (!byScore.has(uid) || row.score > byScore.get(uid).score) {
      byScore.set(uid, row);
    }
    const bestBlupets = byBlupets.get(uid);
    if (
      !bestBlupets ||
      row.blupets_count > bestBlupets.blupets_count ||
      (row.blupets_count === bestBlupets.blupets_count && row.score > bestBlupets.score)
    ) {
      byBlupets.set(uid, row);
    }
  }

  // Union of both sets; a user may contribute 1 or 2 distinct rows.
  const seen = new Set();
  const unique = [];
  for (const row of [...byScore.values(), ...byBlupets.values()]) {
    const key = `${row.user_id}:${row.score}:${row.blupets_count}`;
    if (!seen.has(key)) { seen.add(key); unique.push(row); }
  }

  return unique.map((row) => ({
    userId: row.user_id,
    accountName: row.account_name ?? "Player",
    avatarUrl: row.avatar_url ?? "",
    score: row.score,
    movesUsed: row.moves_used,
    blupetsCount: row.blupets_count,
    familyBadges: row.family_badges ?? {},
    t4Color: row.t4_color,
    t4Partner: row.t4_partner,
    t4FormKey: row.t4_form_key,
    vibe: row.vibe,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
  }));
}
