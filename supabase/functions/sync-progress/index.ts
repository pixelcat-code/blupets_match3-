import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

// Sanitize a capsule-collection map to { key: true }, capping size and key
// length. Matches the helper in submit-run / submit-guest-run so the Blupets
// count derived here is identical to the one written at run-submit time.
function trustedCollectionTiles(value: unknown): Record<string, true> {
  const out: Record<string, true> = {};
  for (const [key, entry] of Object.entries(safeObject(value)).slice(0, 512)) {
    if (entry === true) out[String(key).slice(0, 96)] = true;
  }
  return out;
}

function int(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function sanitizeClientProgress(raw: unknown) {
  const source = safeObject(raw);
  const progress = {
    tutorialSeen: Boolean(source.tutorialSeen),
    collectionTiles: safeObject(source.collectionTiles),
    inventoryForms: safeObject(source.inventoryForms),
    evoBadges: safeObject(source.evoBadges),
    capsules: int(source.capsules),
    shards: int(source.shards),
    capsuleStats: safeObject(source.capsuleStats),
    milestones: safeObject(source.milestones),
    saraiHeartQuest: safeObject(source.saraiHeartQuest),
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
    const clientProgress = sanitizeClientProgress(body.progress);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_progress")
      .select("wins, runs, best_score, fewest_moves_win, forms, progress")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    const wins = int(existing?.wins);
    const runs = int(existing?.runs);
    const bestScore = int(existing?.best_score);
    const fewestMovesWin = existing?.fewest_moves_win == null ? null : int(existing?.fewest_moves_win);
    const forms = safeObject(existing?.forms);
    // Client progress is private and may be modified locally. Preserve only the
    // server-derived collection produced by replay-verified submissions.
    const verifiedCollectionTiles = trustedCollectionTiles(
      safeObject(existing?.progress).verifiedCollectionTiles,
    );
    const progress = {
      ...clientProgress,
      wins,
      runs,
      bestScore,
      fewestMovesWin,
      forms,
      verifiedCollectionTiles,
    };

    const { error } = await supabase.from("user_progress").upsert(
      {
        user_id: userData.user.id,
        wins,
        runs,
        best_score: bestScore,
        fewest_moves_win: fewestMovesWin,
        forms,
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
