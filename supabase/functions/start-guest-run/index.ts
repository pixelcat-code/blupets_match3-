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
    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    await supabase
      .from("guest_game_runs")
      .delete()
      .is("submitted_at", null)
      .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

    const seedBytes = new Uint32Array(1);
    crypto.getRandomValues(seedBytes);
    const seed = seedBytes[0] >>> 0;

    const { data, error } = await supabase
      .from("guest_game_runs")
      .insert({ seed })
      .select("id")
      .single();
    if (error) throw error;

    return json({ runId: data.id, seed }, 200, cors);
  } catch (error) {
    console.error("start-guest-run failed:", error);
    return json({ error: "start_guest_run_failed" }, 500, cors);
  }
});
