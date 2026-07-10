import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { isTournamentEnded, tournamentAttemptExpiresAt, tournamentEndMs } from "../../../src/util/tournament-deadline.js";

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
      .select("user_id, removed_at")
      .eq("room_id", room.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservedPlayer || reservedPlayer.removed_at) return json({ error: "not_registered_for_room" }, 403, cors);

    const durationMs = Math.max(1, Number(room.duration_minutes || 30)) * 60_000;
    const { data: existingRun, error: existingRunError } = await supabase
      .from("tournament_runs")
      .select("id, seed, started_at, submitted_at, draft_actions")
      .eq("room_id", room.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (existingRunError) throw existingRunError;
    if (existingRun) {
      if (existingRun.submitted_at) return json({ error: "attempt_already_used" }, 409, cors);
      const existingStartedMs = new Date(existingRun.started_at).getTime();
      const existingExpiresMs = tournamentAttemptExpiresAt(existingStartedMs, durationMs, roomEndsAtMs);
      if (!Number.isFinite(existingStartedMs) || now >= existingExpiresMs) {
        return json({ error: "tournament_ended" }, 422, cors);
      }
      // A duplicate start means the browser is returning, not requesting a
      // second attempt. Resume the same seed and server checkpoint.
      return json({
        runId: existingRun.id,
        roomId: room.id,
        code: room.code,
        seed: Number(existingRun.seed) >>> 0,
        vibeId: room.vibe_id,
        rules: room.rules,
        startedAt: existingRun.started_at,
        expiresAt: new Date(existingExpiresMs).toISOString(),
        actions: Array.isArray(existingRun.draft_actions) ? existingRun.draft_actions : [],
        resumed: true,
      }, 200, cors);
    }

    const startedAt = new Date(now).toISOString();
    // An attempt cannot extend the shared tournament window.
    const expiresAt = new Date(tournamentAttemptExpiresAt(now, durationMs, roomEndsAtMs)).toISOString();

    const { data: run, error: runError } = await supabase
      .from("tournament_runs")
      .insert({
        room_id: room.id,
        user_id: userData.user.id,
        seed: room.seed,
        started_at: startedAt,
        draft_account_name: labelForUser(userData.user),
        draft_avatar_url: avatarForUser(userData.user),
      })
      .select("id")
      .single();

    if (runError) {
      if (String(runError.message ?? "").toLowerCase().includes("duplicate")) {
        // Another tab won a simultaneous first-start race. The next request
        // follows the existing-run branch above and resumes that same attempt.
        return json({ error: "start_race_retry" }, 409, cors);
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
