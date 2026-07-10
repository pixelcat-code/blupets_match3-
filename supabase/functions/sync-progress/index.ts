import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { BLUPETS_FAMILIES } from "../../../src/blupets-canon-data.js";

const VALID_FORM_KEYS = new Set(
  BLUPETS_FAMILIES.flatMap((family) =>
    [...family.forms["2"], ...family.forms["3"], ...family.forms["4"]].map((form) => form.key),
  ),
);

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
    if (entry === true && VALID_FORM_KEYS.has(key)) out[key] = true;
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
    const publishCollection = body.publishCollection === true;

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
    // Public collection publishing is opt-in so ordinary progress saves never
    // touch leaderboard rows. The snapshot is canonicalized and unioned, so a
    // stale browser cannot hide forms that were already published.
    const verifiedCollectionTiles = trustedCollectionTiles(
      safeObject(existing?.progress).verifiedCollectionTiles,
    );
    const publicCollectionTiles = publishCollection
      ? {
          ...trustedCollectionTiles(safeObject(existing?.progress).publicCollectionTiles),
          ...trustedCollectionTiles(safeObject(existing?.progress).collectionTiles),
          ...trustedCollectionTiles(clientProgress.collectionTiles),
        }
      : trustedCollectionTiles(safeObject(existing?.progress).publicCollectionTiles);
    const progress = {
      ...clientProgress,
      wins,
      runs,
      bestScore,
      fewestMovesWin,
      forms,
      verifiedCollectionTiles,
      publicCollectionTiles,
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

    if (publishCollection) {
      const meta = userData.user.user_metadata ?? {};
      const accountName = String(
        meta.display_name || meta.full_name || meta.name ||
        meta.preferred_username || meta.user_name || userData.user.email || "Player",
      ).slice(0, 128);
      const { error: profileError } = await supabase
        .from("player_public_profiles")
        .upsert({
          user_id: userData.user.id,
          account_name: accountName,
          collection_tiles: publicCollectionTiles,
          blupets_count: Object.keys(publicCollectionTiles).length,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (profileError) throw profileError;
    }

    return json({ ok: true, progress, collectionTiles: publicCollectionTiles }, 200, cors);
  } catch (error) {
    console.error("sync-progress failed:", error);
    return json({ error: "sync_progress_failed" }, 500, cors);
  }
});
