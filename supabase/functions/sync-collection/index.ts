import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BLUPETS_FAMILIES } from "../../../src/blupets-canon-data.js";

const VALID_FORM_KEYS = new Set(
  BLUPETS_FAMILIES.flatMap((family) =>
    [...family.forms["2"], ...family.forms["3"], ...family.forms["4"]].map((form) => form.key),
  ),
);

function sanitizeCollectionTiles(value: unknown): Record<string, true> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const out: Record<string, true> = {};
  for (const [key, owned] of Object.entries(source)) {
    if (owned === true && VALID_FORM_KEYS.has(key)) out[key] = true;
  }
  return out;
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
    const requestedTiles = sanitizeCollectionTiles(body.collectionTiles);

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
      .select("progress")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    const priorProgress = existing?.progress && typeof existing.progress === "object" && !Array.isArray(existing.progress)
      ? existing.progress as Record<string, unknown>
      : {};
    // Capsule forms are a player-owned collection, but the snapshot is still
    // authenticated and canonicalized at the server boundary. Unioning makes
    // an accidental stale browser snapshot unable to hide prior discoveries.
    const collectionTiles = {
      ...sanitizeCollectionTiles(priorProgress.publicCollectionTiles),
      ...requestedTiles,
    };
    const progress = { ...priorProgress, publicCollectionTiles: collectionTiles };

    const { error: progressError } = await supabase
      .from("user_progress")
      .upsert({
        user_id: userData.user.id,
        progress,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (progressError) throw progressError;

    const { error: leaderboardError } = await supabase
      .from("leaderboard_entries")
      .update({
        blupets_count: Object.keys(collectionTiles).length,
        collection_tiles: collectionTiles,
        // "trusted" means this came through an authenticated server function
        // and was checked against the canonical form catalog.
        collection_trusted: true,
      })
      .eq("user_id", userData.user.id);
    if (leaderboardError) throw leaderboardError;

    return json({ ok: true, collectionTiles }, 200, cors);
  } catch (error) {
    console.error("sync-collection failed:", error);
    return json({ error: "sync_collection_failed" }, 500, cors);
  }
});
