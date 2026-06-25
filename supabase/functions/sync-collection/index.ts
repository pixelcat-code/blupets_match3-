import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function sanitizeFamilyBadges(rawBadges: unknown): Record<string, number> {
  const familyBadges: Record<string, number> = {};
  if (!rawBadges || typeof rawBadges !== "object" || Array.isArray(rawBadges)) {
    return familyBadges;
  }
  for (const [key, value] of Object.entries(rawBadges).slice(0, 36)) {
    const n = Math.trunc(Number(value));
    familyBadges[String(key).slice(0, 64)] =
      Number.isFinite(n) ? Math.max(0, Math.min(9, n)) : 0;
  }
  return familyBadges;
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
    const familyBadges = sanitizeFamilyBadges(body.familyBadges);
    const blupetsCount = Object.values(familyBadges).reduce((sum, value) => sum + value, 0);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    const { error } = await supabase
      .from("leaderboard_entries")
      .update({
        family_badges: familyBadges,
        blupets_count: blupetsCount,
      })
      .eq("user_id", userData.user.id);
    if (error) throw error;

    return json({ ok: true, blupetsCount }, 200, cors);
  } catch (error) {
    console.error("sync-collection failed:", error);
    return json({ error: "sync_collection_failed" }, 500, cors);
  }
});
