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
    if (!code || typeof body.ready !== "boolean") return json({ error: "invalid_request" }, 400, cors);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);

    const { data: room, error: roomError } = await supabase
      .from("tournament_rooms")
      .select("id, creator_user_id, status")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);
    if (room.status !== "lobby") return json({ error: "room_already_started" }, 409, cors);
    if (room.creator_user_id === userData.user.id) return json({ error: "host_has_no_ready_state" }, 422, cors);

    const { data: player, error: playerError } = await supabase
      .from("tournament_room_players")
      .update({ ready_at: body.ready ? new Date().toISOString() : null })
      .eq("room_id", room.id)
      .eq("user_id", userData.user.id)
      .is("removed_at", null)
      .select("user_id, ready_at")
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return json({ error: "not_registered_for_room" }, 403, cors);

    return json({ ok: true, ready: Boolean(player.ready_at) }, 200, cors);
  } catch (error) {
    console.error("set-tournament-ready failed:", error);
    return json({ error: "set_tournament_ready_failed" }, 500, cors);
  }
});
