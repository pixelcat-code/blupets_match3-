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

    const { error: closeExpiredError } = await supabase.rpc("close_expired_tournament_rooms");
    if (closeExpiredError) throw closeExpiredError;

    const { data: room, error: roomError } = await supabase
      .from("tournament_rooms")
      .select("id, code, creator_user_id, status, duration_minutes")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);
    if (room.creator_user_id !== userData.user.id) return json({ error: "not_host" }, 403, cors);
    if (room.status !== "lobby") return json({ error: "already_started" }, 409, cors);

    const now = Date.now();
    const startedAt = new Date(now).toISOString();
    const endsAt = new Date(now + Number(room.duration_minutes || 30) * 60_000).toISOString();

    // Guard against a double-start race: only flip a row that is still 'lobby'.
    const { data: updated, error: updateError } = await supabase
      .from("tournament_rooms")
      .update({ status: "live", started_at: startedAt, starts_at: startedAt, ends_at: endsAt })
      .eq("id", room.id)
      .eq("status", "lobby")
      .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, vibe_id, rules")
      .single();
    if (updateError || !updated) return json({ error: "already_started" }, 409, cors);

    return json({ room: updated }, 200, cors);
  } catch (error) {
    console.error("start-tournament-room failed:", error);
    return json({ error: "start_tournament_room_failed" }, 500, cors);
  }
});
