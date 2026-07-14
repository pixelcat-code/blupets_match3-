import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function labelForUser(user: any) {
  const meta = user?.user_metadata ?? {};
  return meta.display_name || meta.full_name || meta.name || meta.preferred_username || user?.email || user?.id || "Player";
}

function avatarForUser(user: any) {
  const raw = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function rankRows(rows: any[], userId: string | null) {
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    accountName: row.account_name,
    avatarUrl: row.avatar_url,
    score: row.score,
    movesUsed: row.moves_used,
    submittedAt: row.created_at,
    isPlayer: Boolean(userId && row.user_id === userId),
  }));
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    if (!code) return json({ error: "missing_code" }, 400, cors);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401, cors);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);
    const userId = userData.user.id;

    const { data: loadedRoom, error: roomError } = await supabase
      .from("tournament_rooms")
      // Never disclose a seed from room metadata: it becomes available only
      // through start-tournament-run after the room is live.
      .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, max_players, vibe_id, rules, created_at, lobby_expires_at")
      .eq("code", code)
      .single();
    if (roomError || !loadedRoom) return json({ error: "room_not_found" }, 404, cors);
    let room = loadedRoom;

    const lobbyEndMs = new Date(room.lobby_expires_at ?? "").getTime();
    if (room.status === "lobby" && Number.isFinite(lobbyEndMs) && lobbyEndMs <= Date.now()) {
      const { data: endedRoom, error: endedError } = await supabase
        .from("tournament_rooms")
        .update({ status: "ended" })
        .eq("id", room.id)
        .eq("status", "lobby")
        .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, max_players, vibe_id, rules, created_at, lobby_expires_at")
        .maybeSingle();
      if (endedError) throw endedError;
      if (endedRoom) room = endedRoom;
    }

    // Cron is the primary expiry owner. This guarded write only reconciles the
    // one room being opened when its deadline has already passed, instead of
    // running a project-wide close RPC on every lobby refresh.
    const roomEndMs = new Date(room.ends_at ?? "").getTime();
    if (room.status === "live" && Number.isFinite(roomEndMs) && roomEndMs <= Date.now()) {
      const { data: endedRoom, error: endedError } = await supabase
        .from("tournament_rooms")
        .update({ status: "ended" })
        .eq("id", room.id)
        .eq("status", "live")
        .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, max_players, vibe_id, rules, created_at, lobby_expires_at")
        .maybeSingle();
      if (endedError) throw endedError;
      if (endedRoom) room = endedRoom;
    }

    // Opening a lobby is the join action. The DB function locks the room row,
    // making the displayed lobby population a real reservation rather than a
    // race at the instant the host starts.
    if (room.status === "lobby") {
      const { data: reserved, error: reserveError } = await supabase.rpc("reserve_tournament_room_slot", {
        target_room_id: room.id,
        target_user_id: userId,
      });
      if (reserveError) throw reserveError;
      if (!reserved) {
        const { data: player } = await supabase
          .from("tournament_room_players")
          .select("removed_at")
          .eq("room_id", room.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (player?.removed_at) return json({ error: "removed_from_room" }, 403, cors);
        return json({ error: "room_full" }, 409, cors);
      }
    } else if (room.creator_user_id !== userId) {
      // A live/finished room is not a spectator entry point. Reject before the
      // client starts a polling loop that can only produce membership errors.
      const { data: player, error: playerError } = await supabase
        .from("tournament_room_players")
        .select("removed_at")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (playerError) throw playerError;
      if (player?.removed_at) return json({ error: "removed_from_room" }, 403, cors);
      if (!player) return json({ error: "not_registered_for_room" }, 403, cors);
    }

    // Presence can disappear while a phone sleeps. Persist the small public
    // roster identity so the host still sees every registered player.
    const { error: identityError } = await supabase
      .from("tournament_room_players")
      .update({
        account_name: labelForUser(userData.user),
        avatar_url: avatarForUser(userData.user),
      })
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .is("removed_at", null);
    if (identityError) throw identityError;

    // These reads are independent after membership is established. Running
    // them together removes two sequential network round-trips from the most
    // frequently opened tournament function.
    const entriesRequest = supabase
      .from("tournament_leaderboard_entries")
      .select("user_id, account_name, avatar_url, score, moves_used, created_at")
      .eq("room_id", room.id)
      .order("score", { ascending: false })
      .order("moves_used", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);
    const playersRequest = supabase
      .from("tournament_room_players")
      .select("user_id, account_name, avatar_url, ready_at, ready_updated_at, removed_at")
      .eq("room_id", room.id);
    const runRequest = supabase
      .from("tournament_runs")
      .select("id, seed, started_at, submitted_at, draft_actions")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .maybeSingle();
    const [
      { data: entries, error: entriesError },
      { data: players, error: playersError },
      { data: run, error: runError },
    ] = await Promise.all([entriesRequest, playersRequest, runRequest]);
    if (entriesError) throw entriesError;
    if (playersError) throw playersError;
    if (runError) throw runError;
    const playerRows = (players ?? []).map((player) => ({
      userId: player.user_id,
      accountName: player.account_name,
      avatarUrl: player.avatar_url,
      ready: Boolean(player.ready_at),
      readyUpdatedAt: player.ready_updated_at,
      removedAt: player.removed_at,
    }));

    let playerState = {
      hasStarted: false,
      hasSubmitted: false,
      score: null as number | null,
      rank: null as number | null,
      startedAt: null as string | null,
      expiresAt: null as string | null,
      resume: null as any,
    };
    if (userId) {
      const ranked = rankRows(entries ?? [], userId);
      const own = ranked.find((entry) => entry.isPlayer);
      const durationMs = Math.max(1, Number(room.duration_minutes || 30)) * 60_000;
      const runStartedMs = run?.started_at ? new Date(run.started_at).getTime() : NaN;
      const roomEndsMs = room.ends_at ? new Date(room.ends_at).getTime() : NaN;
      const expiryMs = Number.isFinite(runStartedMs)
        ? Math.min(runStartedMs + durationMs, Number.isFinite(roomEndsMs) ? roomEndsMs : Infinity)
        : NaN;
      playerState = {
        hasStarted: Boolean(run),
        hasSubmitted: Boolean(run?.submitted_at || own),
        score: own?.score ?? null,
        rank: own?.rank ?? null,
        startedAt: run?.started_at ?? null,
        expiresAt: Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null,
        // This is returned only to the authenticated owner of the run. It
        // contains the server-verified checkpoint needed to continue from a
        // different tab/device after a browser close.
        resume: run && !run.submitted_at && Array.isArray(run.draft_actions)
          ? { runId: run.id, seed: Number(run.seed) >>> 0, actions: run.draft_actions }
          : null,
      };
    }

    return json({
      serverNow: new Date().toISOString(),
      room,
      entries: rankRows(entries ?? [], userId),
      players: playerRows,
      playerState,
    }, 200, cors);
  } catch (error) {
    console.error("get-tournament-room failed:", error);
    return json({ error: "get_tournament_room_failed" }, 500, cors);
  }
});
