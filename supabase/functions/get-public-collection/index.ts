import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders, json, requireEnv } from "../_shared/http.ts";

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
    // another user's row. This endpoint returns only server-derived public
    // collection data; client-owned progress.collectionTiles is private.
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

    const ct = data.progress?.verifiedCollectionTiles;
    const collectionTiles =
      ct && typeof ct === "object" && !Array.isArray(ct) ? ct : null;

    return json({ collectionTiles }, 200, cors);
  } catch (err) {
    console.error("get-public-collection failed:", err);
    return json({ collectionTiles: null }, 200, cors);
  }
});
