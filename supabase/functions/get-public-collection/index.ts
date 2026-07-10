import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { BLUPETS_FAMILIES } from "../../../src/blupets-canon-data.js";

const VALID_FORM_KEYS = new Set(
  BLUPETS_FAMILIES.flatMap((family) =>
    [...family.forms["2"], ...family.forms["3"], ...family.forms["4"]].map((form) => form.key),
  ),
);

function canonicalTiles(...values: unknown[]): Record<string, true> | null {
  const out: Record<string, true> = {};
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [key, owned] of Object.entries(value as Record<string, unknown>)) {
      if (owned === true && VALID_FORM_KEYS.has(key)) out[key] = true;
    }
  }
  return Object.keys(out).length ? out : null;
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
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    if (!userId) return json({ collectionTiles: null }, 200, cors);

    // Use service-role key so the RLS "own read" policy doesn't block reading
    // another user's row. Return only the canonicalized public snapshot.
    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase
      .from("user_progress")
      .select("progress")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return json({ collectionTiles: null }, 200, cors);

    // Accounts created across earlier versions may have forms in any of these
    // fields. Merge them so a partial migration never makes a collection look
    // empty; only canonical keys leave this endpoint.
    const collectionTiles = canonicalTiles(
      data.progress?.collectionTiles,
      data.progress?.verifiedCollectionTiles,
      data.progress?.publicCollectionTiles,
    );

    return json({ collectionTiles }, 200, cors);
  } catch (err) {
    console.error("get-public-collection failed:", err);
    return json({ collectionTiles: null }, 200, cors);
  }
});
