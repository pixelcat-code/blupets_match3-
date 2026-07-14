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
    if (!code) return json({ error: "missing_code" }, 400, cors);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);

    const { error: expiryError } = await supabase.rpc("close_expired_tournament_rooms");
    if (expiryError) throw expiryError;

    const { data, error } = await supabase.rpc("start_tournament_room_atomic", {
      target_code: code,
      target_host_id: userData.user.id,
    });
    if (error) {
      const code = tournamentRpcErrorCode(error, "start_tournament_room_failed");
      const status = code === "room_not_found" ? 404 :
        code === "not_host" ? 403 :
        code === "already_started" || code === "players_not_ready" ? 409 : 500;
      if (status < 500) return tournamentReject("start-tournament-room", code, status, cors);
      throw error;
    }

    return json(data, 200, cors);
  } catch (error) {
    console.error("start-tournament-room failed:", error);
    return json({ error: "start_tournament_room_failed" }, 500, cors);
  }
});
