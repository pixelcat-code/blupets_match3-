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

    let userId: string | null = null;
    const token = bearerToken(req);
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const { data: room, error: roomError } = await supabase
      .from("tournament_rooms")
      .select("id, code, title, creator_user_id, status, starts_at, ends_at, seed, vibe_id, rules, created_at")
      .eq("code", code)
      .single();
    if (roomError || !room) return json({ error: "room_not_found" }, 404, cors);

    const { data: entries, error: entriesError } = await supabase
      .from("tournament_leaderboard_entries")
      .select("user_id, account_name, avatar_url, score, moves_used, created_at")
      .eq("room_id", room.id)
      .order("score", { ascending: false })
      .order("moves_used", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100);
    if (entriesError) throw entriesError;

    let playerState = { hasStarted: false, hasSubmitted: false, score: null as number | null, rank: null as number | null };
    if (userId) {
      const { data: run } = await supabase
        .from("tournament_runs")
        .select("id, submitted_at")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .maybeSingle();
      const ranked = rankRows(entries ?? [], userId);
      const own = ranked.find((entry) => entry.isPlayer);
      playerState = {
        hasStarted: Boolean(run),
        hasSubmitted: Boolean(run?.submitted_at || own),
        score: own?.score ?? null,
        rank: own?.rank ?? null,
      };
    }

    return json({ room, entries: rankRows(entries ?? [], userId), playerState }, 200, cors);
  } catch (error) {
    console.error("get-tournament-room failed:", error);
    return json({ error: "get_tournament_room_failed" }, 500, cors);
  }
});
