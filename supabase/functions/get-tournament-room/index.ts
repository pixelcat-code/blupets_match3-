import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
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

    const { error: closeExpiredError } = await supabase.rpc("close_expired_tournament_rooms");
    if (closeExpiredError) throw closeExpiredError;

    const { data: room, error: roomError } = await supabase
      .from("tournament_rooms")
      // Never disclose a seed from room metadata: it becomes available only
      // through start-tournament-run after the room is live.
      .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, max_players, vibe_id, rules, created_at")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);

    // Opening a lobby is the join action. The DB function locks the room row,
    // making the displayed lobby population a real reservation rather than a
    // race at the instant the host starts.
    if (room.status === "lobby") {
      const { data: reserved, error: reserveError } = await supabase.rpc("reserve_tournament_room_slot", {
        target_room_id: room.id,
        target_user_id: userId,
      });
      if (reserveError) throw reserveError;
      if (!reserved) return json({ error: "room_full" }, 409, cors);
    }

    const { data: entries, error: entriesError } = await supabase
      .from("tournament_leaderboard_entries")
      .select("user_id, account_name, avatar_url, score, moves_used, created_at")
      .eq("room_id", room.id)
      .order("score", { ascending: false })
      .order("moves_used", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);
    if (entriesError) throw entriesError;

    let playerState = {
      hasStarted: false,
      hasSubmitted: false,
      score: null as number | null,
      rank: null as number | null,
      startedAt: null as string | null,
      expiresAt: null as string | null,
    };
    if (userId) {
      const { data: run } = await supabase
        .from("tournament_runs")
        .select("id, started_at, submitted_at")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .maybeSingle();
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
      };
    }

    return json({ room, entries: rankRows(entries ?? [], userId), playerState }, 200, cors);
  } catch (error) {
    console.error("get-tournament-room failed:", error);
    return json({ error: "get_tournament_room_failed" }, 500, cors);
  }
});
