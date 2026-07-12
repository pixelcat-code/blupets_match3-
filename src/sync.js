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

export async function removeTournamentPlayer(code, userId) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("remove-tournament-player", {
    body: { code, userId },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function setTournamentReady(code, ready) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("set-tournament-ready", {
    body: { code, ready: Boolean(ready) },
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
  return {
    ...data,
    seed: data.seed >>> 0,
    actions: Array.isArray(data.actions) ? data.actions : [],
    tournament: true,
  };
}

export async function submitTournamentRun(runId, result, actions = [], { abandoned = false } = {}) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("submit-tournament-run", {
    body: { runId, result, actions, abandoned },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function saveTournamentDraft(runId, result, actions = []) {
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("save-tournament-draft", {
    body: { runId, result, actions },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return data;
}

export async function fetchTournamentLeaderboard(code, limit = 100) {
  const client = await getSupabaseClient();
  const { data, error } = await client.rpc("fetch_tournament_leaderboard_snapshot", {
    target_code: code,
    result_limit: limit,
  });
  if (error) throw error;
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

  const { data, error } = await client.rpc("fetch_public_user_entries", {
    target_user_id: userId,
    result_limit: 500,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Reads only the allowlisted public collection snapshot through a SECURITY
// DEFINER RPC. This avoids an Edge Function invocation per public-profile view
// while user_progress itself remains owner-only under RLS.
export async function fetchPublicCollectionTiles(userId) {
  const { configured } = getSupabaseConfig();
  if (!configured) return null;
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.rpc("get_public_collection", {
      target_user_id: userId,
    });
    if (error || !data) return null;
    const ct = data.collectionTiles ?? data;
    return (ct && typeof ct === "object" && !Array.isArray(ct)) ? ct : null;
  } catch {
    return null;
  }
}

// ── Tournament realtime ──────────────────────────────────────────────────────
// One channel per open room. postgres_changes: room row (host Start) + verified
// leaderboard finals. Presence: ephemeral connected-players list (name/avatar/
// state), no DB writes. Callers get plain callbacks; we own the single channel.
let _tournamentChannel = null;

export async function subscribeTournamentRoom(code, roomId, { onPresenceSync, onBroadcast, onLeaderboardInsert } = {}) {
  await unsubscribeTournamentRoom();
  const client = await getSupabaseClient();
  const channel = client.channel(`tournament:${code}`, {
    config: { presence: { key: code } },
  });

  channel.on("presence", { event: "sync" }, () => {
    try { onPresenceSync?.(channel.presenceState()); } catch (e) { console.error(e); }
  });
  // Room rows are deliberately not exposed through Realtime because they
  // contain the tournament seed. Broadcast only carries non-sensitive lobby
  // events. Verified leaderboard rows are safe to stream directly from
  // Postgres, avoiding one Edge Function refetch per connected player.
  for (const event of ["room-live", "kick", "ready"]) {
    channel.on("broadcast", { event }, ({ payload }) => {
      try { onBroadcast?.({ event, payload }); } catch (e) { console.error(e); }
    });
  }
  if (typeof onLeaderboardInsert === "function") {
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "tournament_leaderboard_entries",
        filter: `room_id=eq.${roomId}`,
      },
      ({ new: row }) => {
        try { onLeaderboardInsert(row); } catch (e) { console.error(e); }
      },
    );
  }

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };
      const timeout = setTimeout(() => {
        finish(reject, new Error("tournament_realtime_timeout"));
      }, 10_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") finish(resolve);
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          finish(reject, new Error(`tournament_realtime_${status.toLowerCase()}`));
        }
      });
    });
  } catch (error) {
    await client.removeChannel(channel).catch(() => {});
    throw error;
  }
  _tournamentChannel = channel;
  return channel;
}

export function presenceTrack(channel, payload) {
  return channel?.track?.(payload);
}

export function sendTournamentBroadcast(event, payload = {}) {
  if (!_tournamentChannel) return Promise.resolve("not-connected");
  return _tournamentChannel.send({ type: "broadcast", event, payload });
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
  const { data, error } = await client.rpc("fetch_global_leaderboard", {
    result_limit: limit,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Authenticated event snapshot. Without an active event the response is null
// and no event UI is rendered.
export async function fetchEventSnapshot(limit = 100) {
  const { configured } = getSupabaseConfig();
  if (!configured) return { snapshot: null, serverTime: null };
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke("get-event", {
    body: { limit: Math.max(1, Math.min(500, Math.floor(Number(limit) || 100))) },
  });
  if (error) throw new Error(await fnErrorCode(error));
  return { snapshot: data?.snapshot ?? null, serverTime: data?.serverTime ?? null };
}
