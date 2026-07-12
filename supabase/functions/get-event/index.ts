import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401, cors);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(500, Math.floor(requestedLimit)))
      : 100;

    const { error: lifecycleError } = await supabase.rpc("refresh_event_lifecycle");
    if (lifecycleError) throw lifecycleError;
    const { data, error } = await supabase.rpc("fetch_event_snapshot", {
      target_user_id: userData.user.id,
      result_limit: limit,
    });
    if (error) throw error;
    return json({ snapshot: data ?? null, serverTime: new Date().toISOString() }, 200, cors);
  } catch (error) {
    console.error("get-event failed:", error);
    return json({ error: "get_event_failed" }, 500, cors);
  }
});
