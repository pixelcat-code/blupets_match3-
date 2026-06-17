import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

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
