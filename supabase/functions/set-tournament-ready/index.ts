import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { tournamentReject, tournamentRpcErrorCode } from "../_shared/tournament-errors.ts";

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
    if (!code || typeof body.ready !== "boolean") {
      return tournamentReject("set-tournament-ready", "invalid_request", 400, cors);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);

    const { data, error } = await supabase.rpc("set_tournament_ready_state", {
      target_code: code,
      target_user_id: userData.user.id,
      target_ready: body.ready,
    });
    if (error) {
      const code = tournamentRpcErrorCode(error, "set_tournament_ready_failed");
      const status = code === "room_not_found" ? 404 :
        code === "not_registered_for_room" ? 403 :
        code === "room_already_started" ? 409 :
        code === "host_has_no_ready_state" ? 422 : 500;
      if (status < 500) return tournamentReject("set-tournament-ready", code, status, cors);
      throw error;
    }

    return json({ ok: true, ...data }, 200, cors);
  } catch (error) {
    console.error("set-tournament-ready failed:", error);
    return json({ error: "set_tournament_ready_failed" }, 500, cors);
  }
});
