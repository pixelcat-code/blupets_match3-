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

    // ── Uniqueness check (only when changing the display name) ───────────────
    if (rawName !== null) {
      // 1. Check username-based accounts via synthetic email slug.
      //    We query auth.users through the admin API — wrapped in try/catch
      //    because the method may throw in some runtime environments.
      const slug = rawName.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (slug) {
        try {
          const { data: authLookup } = await supabase.auth.admin.getUserByEmail(
            `${slug}@players.blupets.game`,
          );
          if (authLookup?.user && authLookup.user.id !== userId) {
            return json({ error: "name_taken" }, 409, cors);
          }
        } catch {
          // admin lookup unavailable — fall through to leaderboard check below
        }
      }

      // 2. Check display names already in the leaderboard (catches OAuth players
      //    and any player who has submitted at least one run). Case-insensitive.
      const { data: existing, error: lookupError } = await supabase
        .from("leaderboard_entries")
        .select("user_id")
        .ilike("account_name", rawName)
        .neq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (lookupError) {
        console.error("name uniqueness check failed:", lookupError);
        // Non-fatal: skip uniqueness check rather than blocking all renames
      } else if (existing) {
        return json({ error: "name_taken" }, 409, cors);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const patch: Record<string, string> = {};
    if (rawName !== null) patch.account_name = rawName;
    if (rawAvatarUrl !== null) patch.avatar_url = rawAvatarUrl;

    const { error: leaderError, count } = await supabase
      .from("leaderboard_entries")
      .update(patch)
      .eq("user_id", userId)
      .select("user_id", { count: "exact", head: true });

    if (leaderError) throw leaderError;

    return json({ ok: true, updatedCount: count ?? 0 }, 200, cors);
  } catch (error) {
    console.error("update-account-name failed:", error);
    return json({ error: "update_failed" }, 500, cors);
  }
});
