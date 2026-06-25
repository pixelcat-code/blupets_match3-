import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function int(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function sanitizeProgress(raw: unknown) {
  const source = safeObject(raw);
  const forms = safeObject(source.forms);
  const progress = {
    tutorialSeen: Boolean(source.tutorialSeen),
    forms,
    collectionTiles: safeObject(source.collectionTiles),
    inventoryForms: safeObject(source.inventoryForms),
    evoBadges: safeObject(source.evoBadges),
    capsules: int(source.capsules),
    shards: int(source.shards),
    capsuleStats: safeObject(source.capsuleStats),
    milestones: safeObject(source.milestones),
    runs: int(source.runs),
    wins: int(source.wins),
    bestScore: int(source.bestScore),
    fewestMovesWin: source.fewestMovesWin == null ? null : int(source.fewestMovesWin),
  };
  const jsonText = JSON.stringify(progress);
  if (jsonText.length > 200_000) {
    throw new Error("progress_too_large");
  }
  return progress;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const progress = sanitizeProgress(body.progress);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    const { error } = await supabase.from("user_progress").upsert(
      {
        user_id: userData.user.id,
        wins: progress.wins,
        runs: progress.runs,
        best_score: progress.bestScore,
        fewest_moves_win: progress.fewestMovesWin,
        forms: progress.forms,
        progress,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;

    return json({ ok: true, progress }, 200, cors);
  } catch (error) {
    console.error("sync-progress failed:", error);
    return json({ error: "sync_progress_failed" }, 500, cors);
  }
});
