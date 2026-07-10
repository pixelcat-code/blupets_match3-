import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
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

    const body = await req.json().catch(() => ({}));
    const rawName = typeof body.name === "string" ? body.name.trim() : null;
    if (rawName !== null && (rawName.length === 0 || rawName.length > 64)) {
      return json({ error: "invalid_name" }, 422, cors);
    }

    let rawAvatarUrl: string | null = null;
    if (typeof body.avatarUrl === "string") {
      try {
        const u = new URL(body.avatarUrl);
        if (u.protocol !== "https:") return json({ error: "invalid_avatar_url" }, 422, cors);
        rawAvatarUrl = u.href;
      } catch {
        return json({ error: "invalid_avatar_url" }, 422, cors);
      }
    }

    if (rawName === null && rawAvatarUrl === null) {
      return json({ error: "nothing_to_update" }, 422, cors);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401, cors);
    }
    const userId = userData.user.id;

    const profilePatch: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (rawName !== null) {
      profilePatch.account_name = rawName;
      profilePatch.normalized_name = rawName.toLowerCase();
    }
    if (rawAvatarUrl !== null) profilePatch.avatar_url = rawAvatarUrl;

    const { error: profileError } = await supabase
      .from("player_public_profiles")
      .upsert(profilePatch, { onConflict: "user_id" });
    if (profileError) {
      if (profileError.code === "23505") return json({ error: "name_taken" }, 409, cors);
      throw profileError;
    }

    return json({ ok: true, updatedCount: 1 }, 200, cors);
  } catch (error) {
    console.error("update-account-name failed:", error);
    return json({ error: "update_failed" }, 500, cors);
  }
});
