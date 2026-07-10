import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    const userId = body.userId;
    if (!code || !isUuid(userId)) return json({ error: "invalid_request" }, 400, cors);

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
    if (room.creator_user_id !== userData.user.id) return json({ error: "not_host" }, 403, cors);
    if (room.status !== "lobby") return json({ error: "room_already_started" }, 409, cors);
    if (userId === userData.user.id) return json({ error: "cannot_remove_host" }, 422, cors);

    const { data: removed, error: removeError } = await supabase
      .from("tournament_room_players")
      .update({ removed_at: new Date().toISOString(), removed_by: userData.user.id })
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .is("removed_at", null)
      .select("user_id")
      .maybeSingle();
    if (removeError) throw removeError;
    if (!removed) return json({ error: "player_not_in_room" }, 404, cors);

    return json({ ok: true, userId: removed.user_id }, 200, cors);
  } catch (error) {
    console.error("remove-tournament-player failed:", error);
    return json({ error: "remove_tournament_player_failed" }, 500, cors);
  }
});
