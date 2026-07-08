import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260629-client-singleton-1";

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

export async function startGuestRun() {
  const { configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("start-guest-run", { body: {} });
  if (error) throw new Error(await fnErrorCode(error));
  if (!data?.runId || !Number.isInteger(data.seed)) {
    throw new Error("Guest run service returned an invalid run.");
  }
  return { runId: data.runId, seed: data.seed >>> 0, actions: [], guest: true };
}

// `result` is the client-observed run summary and `actions` is the input log.
// The server replays actions from the server-issued seed before accepting the
// summary; browsers stay RLS-blocked from direct table writes.
export async function submitTrustedRun(runId, result, actions = [], extra = {}) {
  const { configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("submit-run", {
    body: { runId, result, actions, ...extra },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function createTournamentRoom({ title, durationMinutes, vibeId } = {}) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("create-tournament-room", {
    body: { title, durationMinutes, vibeId },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function getTournamentRoom(code) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("get-tournament-room", {
    body: { code },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function startTournamentRoom(code) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("start-tournament-room", {
    body: { code },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function startTournamentRun(code) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("start-tournament-run", {
    body: { code },
  });
  if (error) throw new Error(await fnErrorCode(error));
  if (!data?.runId) throw new Error("Tournament run service returned an invalid run.");
  return { ...data, seed: data.seed >>> 0, actions: [], tournament: true };
}

export async function submitTournamentRun(runId, result, actions = [], { abandoned = false } = {}) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("submit-tournament-run", {
    body: { runId, result, actions, abandoned },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function fetchTournamentLeaderboard(code, limit = 100) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("fetch-tournament-leaderboard", {
    body: { code, limit },
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

export async function submitGuestRun(result, extra = {}) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("submit-guest-run", {
    body: { result, ...extra },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function syncProfile({ name, avatarUrl } = {}) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;

  const body = {};
  if (name !== undefined) body.name = name;
  if (avatarUrl !== undefined) body.avatarUrl = avatarUrl;

  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("update-account-name", { body });
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

  // Try with collection_tiles (available after migration). Fall back to the
  // legacy select if the column doesn't exist yet so the profile still loads.
  let result = await client
    .from("leaderboard_entries")
    .select("score, moves_used, blupets_count, family_badges, t4_color, t4_partner, t4_form_key, collection_tiles, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (result.error) {
    result = await client
      .from("leaderboard_entries")
      .select("score, moves_used, blupets_count, family_badges, t4_color, t4_partner, t4_form_key, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
  }

  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    score: row.score,
    movesUsed: row.moves_used,
    blupetsCount: Number(row.blupets_count ?? countFamilyBadges(row.family_badges) ?? 0),
    familyBadges: row.family_badges ?? {},
    t4Color: row.t4_color,
    t4Partner: row.t4_partner,
    t4FormKey: row.t4_form_key,
    collectionTiles: (row.collection_tiles && typeof row.collection_tiles === "object") ? row.collection_tiles : null,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : 0,
  }));
}

// Reads another player's collectionTiles via the get-public-collection edge
// function, which uses the service-role key and bypasses RLS. Returns null on
// any error so the caller can fall back gracefully.
export async function fetchPublicCollectionTiles(userId) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.functions.invoke("get-public-collection", {
      body: { userId },
    });
    if (error || !data) return null;
    const ct = data.collectionTiles;
    return (ct && typeof ct === "object" && !Array.isArray(ct)) ? ct : null;
  } catch {
    return null;
  }
}

function countFamilyBadges(familyBadges) {
  if (!familyBadges || typeof familyBadges !== "object" || Array.isArray(familyBadges)) return 0;
  return Object.values(familyBadges).reduce((sum, value) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? sum + Math.max(0, Math.min(9, n)) : sum;
  }, 0);
}

// ── Tournament realtime ──────────────────────────────────────────────────────
// One channel per open room. postgres_changes: room row (host Start) + verified
// leaderboard finals. Presence: ephemeral connected-players list (name/avatar/
// state), no DB writes. Callers get plain callbacks; we own the single channel.
let _tournamentChannel = null;

export async function subscribeTournamentRoom(code, roomId, { onRoom, onEntry, onPresenceSync, onBroadcast } = {}) {
  await unsubscribeTournamentRoom();
  const client = await getSupabaseClient();
  const channel = client.channel(`tournament:${code}`, {
    config: { presence: { key: code } },
  });

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "tournament_rooms", filter: `code=eq.${code}` },
    (payload) => { try { onRoom?.(payload.new); } catch (e) { console.error(e); } },
  );
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "tournament_leaderboard_entries", filter: `room_id=eq.${roomId}` },
    (payload) => { try { onEntry?.(payload.new); } catch (e) { console.error(e); } },
  );
  channel.on("presence", { event: "sync" }, () => {
    try { onPresenceSync?.(channel.presenceState()); } catch (e) { console.error(e); }
  });
  channel.on("broadcast", { event: "kick" }, (payload) => {
    try { onBroadcast?.("kick", payload?.payload ?? {}); } catch (e) { console.error(e); }
  });

  await new Promise((resolve) => {
    channel.subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
  });
  _tournamentChannel = channel;
  return channel;
}

export function presenceTrack(channel, payload) {
  return channel?.track?.(payload);
}

export function sendTournamentBroadcast(channel, event, payload) {
  return channel?.send?.({ type: "broadcast", event, payload });
}

export async function unsubscribeTournamentRoom() {
  if (!_tournamentChannel) return;
  const channel = _tournamentChannel;
  _tournamentChannel = null;
  try {
    const client = await getSupabaseClient();
    await client.removeChannel(channel);
  } catch (error) {
    console.error("[tournament] channel teardown failed:", error);
  }
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
