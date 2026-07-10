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
      .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, vibe_id, rules")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);

    const { data, error } = await supabase
      .from("tournament_leaderboard_entries")
      .select("user_id, account_name, avatar_url, score, moves_used, created_at")
      .eq("room_id", room.id)
      .order("score", { ascending: false })
      .order("moves_used", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(Math.max(10, Math.min(200, Math.trunc(Number(body.limit) || 100))));
    if (error) throw error;

    const entries = (data ?? []).map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      accountName: row.account_name,
      avatarUrl: row.avatar_url,
      score: row.score,
      movesUsed: row.moves_used,
      submittedAt: row.created_at,
      isPlayer: Boolean(userId && row.user_id === userId),
    }));

    return json({ room, entries, playerRank: entries.find((entry) => entry.isPlayer)?.rank ?? null }, 200, cors);
  } catch (error) {
    console.error("fetch-tournament-leaderboard failed:", error);
    return json({ error: "fetch_tournament_leaderboard_failed" }, 500, cors);
  }
});
