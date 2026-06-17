import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260617-1";

export async function loadCloudProgress(userId) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from("user_progress")
    .select("wins, runs, best_score, fewest_moves_win, forms")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // no row yet — first sign-in
    throw error;
  }

  return {
    wins: data.wins ?? 0,
    runs: data.runs ?? 0,
    bestScore: data.best_score ?? 0,
    fewestMovesWin: data.fewest_moves_win ?? null,
    forms: typeof data.forms === "object" && data.forms !== null ? data.forms : {},
  };
}

export async function saveProgressToCloud(userId, progress) {
  const { configured } = getSupabaseConfig();
  if (!configured) return;

  const client = await getSupabaseClient();
  const { error } = await client.from("user_progress").upsert(
    {
      user_id: userId,
      wins: progress.wins ?? 0,
      runs: progress.runs ?? 0,
      best_score: progress.bestScore ?? 0,
      fewest_moves_win: progress.fewestMovesWin ?? null,
      forms: progress.forms ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function recordWinToCloud(userId, accountName, avatarUrl, entry) {
  const { configured } = getSupabaseConfig();
  if (!configured) return;

  const client = await getSupabaseClient();
  const base = {
    user_id: userId,
    account_name: accountName,
    score: entry.score,
    moves_used: entry.movesUsed,
    t4_color: entry.t4Color,
    t4_partner: entry.t4Partner,
    t4_form_key: entry.t4FormKey,
    vibe: entry.vibe,
  };
  const { error } = await client.from("leaderboard_entries").insert({ ...base, avatar_url: avatarUrl || null });
  if (error) {
    // avatar_url column may not exist yet — retry without it.
    if (error.message?.includes("avatar_url")) {
      const { error: e2 } = await client.from("leaderboard_entries").insert(base);
      if (e2) throw e2;
    } else {
      throw error;
    }
  }
}

export async function fetchGlobalLeaderboard(limit = 100) {
  const { configured } = getSupabaseConfig();
  if (!configured) return [];

  const client = await getSupabaseClient();
  // Fetch more rows than needed so deduplication still leaves enough entries.
  let { data, error } = await client
    .from("leaderboard_entries")
    .select("user_id, account_name, avatar_url, score, moves_used, t4_color, t4_partner, t4_form_key, vibe, created_at")
    .not("user_id", "is", null)
    .order("score", { ascending: false })
    .limit(limit * 5);

  // avatar_url column may not exist yet — retry without it.
  if (error && error.message?.includes("avatar_url")) {
    ({ data, error } = await client
      .from("leaderboard_entries")
      .select("user_id, account_name, score, moves_used, t4_color, t4_partner, t4_form_key, vibe, created_at")
      .not("user_id", "is", null)
      .order("score", { ascending: false })
      .limit(limit * 5));
  }

  if (error) throw error;

  // Keep only the best score per user, then re-sort and cap at limit.
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
