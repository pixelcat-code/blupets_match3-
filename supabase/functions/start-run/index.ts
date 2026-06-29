import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

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

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    // A player runs exactly one game at a time. Clear any prior unsubmitted
    // runs for this user before issuing a new seed. This prevents abandoned or
    // failed-to-submit runs from piling up (which used to hit a hard cap and
    // lock the player out of starting new games), and keeps at most one open
    // run per user, so seeds can't be hoarded for cherry-picking.
    await supabase
      .from("game_runs")
      .delete()
      .eq("user_id", userData.user.id)
      .is("submitted_at", null);

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

    return json({ runId: data.id, seed }, 200, cors);
  } catch (error) {
    console.error("start-run failed:", error);
    return json({ error: "start_run_failed" }, 500, cors);
  }
});
