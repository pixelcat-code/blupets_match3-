import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260629-client-singleton-1";
import { randomSeed } from "./rng.js";
import { VIBES } from "./vibes.js";

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

const LOCAL_TOURNAMENT_KEY = "blupets.localTournamentRooms.v1";
const LOCAL_PLAYER_ID_KEY = "blupets.localTournamentPlayerId.v1";

function readLocalTournamentStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_TOURNAMENT_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalTournamentStore(store) {
  localStorage.setItem(LOCAL_TOURNAMENT_KEY, JSON.stringify(store));
}

function localPlayerId() {
  let id = localStorage.getItem(LOCAL_PLAYER_ID_KEY);
  if (!id) {
    id = `local-${randomSeed().toString(36)}`;
    localStorage.setItem(LOCAL_PLAYER_ID_KEY, id);
  }
  return id;
}

function localPlayerName() {
  return localStorage.getItem("blupets.profileName") || "Local Player";
}

function normalizeTournamentCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function isLocalDevHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function localTournamentCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[randomSeed() % alphabet.length];
  }
  return code;
}

function rankLocalEntries(room) {
  const uid = localPlayerId();
  return [...(room.entries ?? [])]
    .sort((a, b) => b.score - a.score || a.movesUsed - b.movesUsed || String(a.submittedAt).localeCompare(String(b.submittedAt)))
    .map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      accountName: entry.accountName,
      avatarUrl: entry.avatarUrl ?? "./assets/blu-logo.png",
      score: entry.score,
      movesUsed: entry.movesUsed,
      submittedAt: entry.submittedAt,
      isPlayer: entry.userId === uid,
    }));
}

function localRoomPayload(room) {
  const entries = rankLocalEntries(room);
  const own = entries.find((entry) => entry.isPlayer);
  const run = (room.runs ?? {})[localPlayerId()] ?? null;
  return {
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      status: room.status,
      starts_at: room.starts_at,
      ends_at: room.ends_at,
      seed: room.seed,
      vibe_id: room.vibe_id,
      rules: room.rules,
      playerState: {
        hasStarted: Boolean(run),
        hasSubmitted: Boolean(own),
        score: own?.score ?? null,
        rank: own?.rank ?? null,
      },
    },
    entries,
    playerState: {
      hasStarted: Boolean(run),
      hasSubmitted: Boolean(own),
      score: own?.score ?? null,
      rank: own?.rank ?? null,
    },
  };
}

function createLocalTournamentRoom({ title, durationMinutes, vibeId } = {}) {
  const store = readLocalTournamentStore();
  let code = localTournamentCode();
  while (store[code]) code = localTournamentCode();
  const duration = Math.max(5, Math.min(24 * 60, Math.trunc(Number(durationMinutes) || 30)));
  const vibe = VIBES.find((entry) => entry.id === vibeId) ?? VIBES[randomSeed() % VIBES.length];
  const now = Date.now();
  const room = {
    id: `local-room-${code}`,
    code,
    title: String(title || "").trim().slice(0, 60) || "Community Cup",
    status: "live",
    starts_at: new Date(now).toISOString(),
    ends_at: new Date(now + duration * 60_000).toISOString(),
    seed: randomSeed() >>> 0,
    vibe_id: vibe.id,
    rules: {
      attemptsLimit: 1,
      diagonalAssist: false,
      diagonalSwaps: false,
      specialTiles: true,
      endlessRun: true,
      boostersAllowed: false,
    },
    runs: {},
    entries: [],
  };
  store[code] = room;
  writeLocalTournamentStore(store);
  return { room: localRoomPayload(room).room, local: true };
}

function getLocalTournamentRoom(code) {
  const store = readLocalTournamentStore();
  const room = store[normalizeTournamentCode(code)];
  if (!room) throw new Error("room_not_found");
  return { ...localRoomPayload(room), local: true };
}

function startLocalTournamentRun(code) {
  const store = readLocalTournamentStore();
  const room = store[normalizeTournamentCode(code)];
  if (!room) throw new Error("room_not_found");
  if (Date.now() > new Date(room.ends_at).getTime()) throw new Error("room_ended");
  const uid = localPlayerId();
  room.runs = room.runs ?? {};
  if (room.runs[uid]) throw new Error("attempt_already_used");
  const runId = `local-run-${room.code}-${uid}`;
  room.runs[uid] = { id: runId, startedAt: new Date().toISOString(), submittedAt: null };
  store[room.code] = room;
  writeLocalTournamentStore(store);
  return {
    runId,
    roomId: room.id,
    code: room.code,
    seed: Number(room.seed) >>> 0,
    vibeId: room.vibe_id,
    rules: room.rules,
    actions: [],
    tournament: true,
    local: true,
  };
}

function submitLocalTournamentRun(runId, result) {
  const store = readLocalTournamentStore();
  const uid = localPlayerId();
  const room = Object.values(store).find((candidate) => candidate?.runs?.[uid]?.id === runId);
  if (!room) throw new Error("run_not_found");
  if (room.runs[uid].submittedAt) throw new Error("run_already_submitted");
  const submittedAt = new Date().toISOString();
  room.runs[uid].submittedAt = submittedAt;
  room.entries = (room.entries ?? []).filter((entry) => entry.userId !== uid);
  room.entries.push({
    userId: uid,
    accountName: localPlayerName(),
    avatarUrl: "./assets/blu-logo.png",
    score: Number(result?.score) || 0,
    movesUsed: Number(result?.movesUsed) || 0,
    submittedAt,
  });
  store[room.code] = room;
  writeLocalTournamentStore(store);
  return { ok: true, entry: room.entries[room.entries.length - 1], local: true };
}

function fetchLocalTournamentLeaderboard(code, limit = 100) {
  const payload = getLocalTournamentRoom(code);
  return {
    room: payload.room,
    entries: payload.entries.slice(0, limit),
    playerRank: payload.entries.find((entry) => entry.isPlayer)?.rank ?? null,
    local: true,
  };
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
  const { configured } = getSupabaseConfig();
  if (!configured || isLocalDevHost()) return createLocalTournamentRoom({ title, durationMinutes, vibeId });

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.functions.invoke("create-tournament-room", {
      body: { title, durationMinutes, vibeId },
    });
    if (error) throw new Error(await fnErrorCode(error));
    return data;
  } catch (error) {
    console.warn("[tournament] using local room fallback:", error);
    return createLocalTournamentRoom({ title, durationMinutes, vibeId });
  }
}

export async function getTournamentRoom(code) {
  const { configured } = getSupabaseConfig();
  if (!configured || isLocalDevHost()) return getLocalTournamentRoom(code);

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.functions.invoke("get-tournament-room", {
      body: { code },
    });
    if (error) throw new Error(await fnErrorCode(error));
    return data;
  } catch (error) {
    console.warn("[tournament] using local get fallback:", error);
    return getLocalTournamentRoom(code);
  }
}

export async function startTournamentRun(code) {
  const { configured } = getSupabaseConfig();
  if (!configured || isLocalDevHost()) return startLocalTournamentRun(code);

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.functions.invoke("start-tournament-run", {
      body: { code },
    });
    if (error) throw new Error(await fnErrorCode(error));
    if (!data?.runId || !Number.isInteger(data.seed)) {
      throw new Error("Tournament run service returned an invalid run.");
    }
    return { ...data, seed: data.seed >>> 0, actions: [], tournament: true };
  } catch (error) {
    console.warn("[tournament] using local start fallback:", error);
    return startLocalTournamentRun(code);
  }
}

export async function submitTournamentRun(runId, result, actions = []) {
  const { configured } = getSupabaseConfig();
  if (!configured || isLocalDevHost() || String(runId).startsWith("local-run-")) return submitLocalTournamentRun(runId, result, actions);

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.functions.invoke("submit-tournament-run", {
      body: { runId, result, actions },
    });
    if (error) throw new Error(await fnErrorCode(error));
    return data;
  } catch (error) {
    console.warn("[tournament] using local submit fallback:", error);
    return submitLocalTournamentRun(runId, result, actions);
  }
}

export async function fetchTournamentLeaderboard(code, limit = 100) {
  const { configured } = getSupabaseConfig();
  if (!configured || isLocalDevHost()) return fetchLocalTournamentLeaderboard(code, limit);

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.functions.invoke("fetch-tournament-leaderboard", {
      body: { code, limit },
    });
    if (error) throw new Error(await fnErrorCode(error));
    return data;
  } catch (error) {
    console.warn("[tournament] using local leaderboard fallback:", error);
    return fetchLocalTournamentLeaderboard(code, limit);
  }
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
