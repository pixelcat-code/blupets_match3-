import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

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

    const { data: room, error: roomError } = await supabase
      .from("tournament_rooms")
      .select("id, code, title, status, starts_at, ends_at, seed, vibe_id, rules")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);

    const now = Date.now();
    if (room.status !== "live" || now < new Date(room.starts_at).getTime()) {
      return json({ error: "room_not_live" }, 422, cors);
    }
    if (now > new Date(room.ends_at).getTime()) {
      return json({ error: "room_ended" }, 422, cors);
    }

    const { data: run, error: runError } = await supabase
      .from("tournament_runs")
      .insert({
        room_id: room.id,
        user_id: userData.user.id,
        seed: room.seed,
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
    }, 200, cors);
  } catch (error) {
    console.error("start-tournament-run failed:", error);
    return json({ error: "start_tournament_run_failed" }, 500, cors);
  }
});
