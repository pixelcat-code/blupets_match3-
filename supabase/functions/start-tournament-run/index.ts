import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { isTournamentEnded, tournamentAttemptExpiresAt, tournamentEndMs } from "../../../src/util/tournament-deadline.js";

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401, cors);
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    if (!code) return json({ error: "missing_code" }, 400, cors);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);

    const { error: closeExpiredError } = await supabase.rpc("close_expired_tournament_rooms");
    if (closeExpiredError) throw closeExpiredError;

    const { data: room, error: roomError } = await supabase
      .from("tournament_rooms")
      .select("id, code, title, status, started_at, ends_at, duration_minutes, seed, vibe_id, rules")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);

    if (room.status !== "live" || !room.started_at) {
      return json({ error: "room_not_live" }, 422, cors);
    }

    const now = Date.now();
    const roomEndsAtMs = tournamentEndMs(room.ends_at);
    if (roomEndsAtMs === null || isTournamentEnded(room.ends_at, now)) {
      // Keep the persisted state honest for subsequent reads. The guarded update
      // also makes concurrent late starts harmless.
      await supabase
        .from("tournament_rooms")
        .update({ status: "ended" })
        .eq("id", room.id)
        .eq("status", "live");
      return json({ error: "tournament_ended" }, 422, cors);
    }

    const { data: reservedPlayer, error: reservationError } = await supabase
      .from("tournament_room_players")
      .select("user_id")
      .eq("room_id", room.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservedPlayer) return json({ error: "not_registered_for_room" }, 403, cors);

    const startedAt = new Date(now).toISOString();
    const durationMs = Math.max(1, Number(room.duration_minutes || 30)) * 60_000;
    // An attempt cannot extend the shared tournament window.
    const expiresAt = new Date(tournamentAttemptExpiresAt(now, durationMs, roomEndsAtMs)).toISOString();

    const { data: run, error: runError } = await supabase
      .from("tournament_runs")
      .insert({
        room_id: room.id,
        user_id: userData.user.id,
        seed: room.seed,
        started_at: startedAt,
      })
      .select("id")
      .single();

    if (runError) {
      if (String(runError.message ?? "").toLowerCase().includes("duplicate")) {
        return json({ error: "attempt_already_used" }, 409, cors);
      }
      throw runError;
    }

    return json({
      runId: run.id,
      roomId: room.id,
      code: room.code,
      seed: Number(room.seed) >>> 0,
      vibeId: room.vibe_id,
      rules: room.rules,
      startedAt,
      expiresAt,
    }, 200, cors);
  } catch (error) {
    console.error("start-tournament-run failed:", error);
    return json({ error: "start_tournament_run_failed" }, 500, cors);
  }
});
