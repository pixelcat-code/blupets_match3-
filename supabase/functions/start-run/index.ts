import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

const MAX_OPEN_RUNS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Clean up stale open runs (>30 min old) before checking the cap.
    // Abandoned runs accumulate when the user quits mid-game; purging them
    // here prevents legitimate players from hitting the cherry-pick guard.
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from("game_runs")
      .delete()
      .eq("user_id", userData.user.id)
      .is("submitted_at", null)
      .lt("created_at", staleThreshold);

    // Block seed cherry-picking: reject if user already has too many recent
    // open (unsubmitted) runs even after cleanup.
    const { count, error: countError } = await supabase
      .from("game_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id)
      .is("submitted_at", null);

    if (countError) throw countError;
    if ((count ?? 0) >= MAX_OPEN_RUNS) {
      return json({ error: "too_many_open_runs" }, 429);
    }

    const seedBytes = new Uint32Array(1);
    crypto.getRandomValues(seedBytes);
    const seed = seedBytes[0] >>> 0;

    const { data, error } = await supabase
      .from("game_runs")
      .insert({
        user_id: userData.user.id,
        seed,
      })
      .select("id")
      .single();

    if (error) throw error;

    return json({ runId: data.id, seed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Start run failed" }, 500);
  }
});
