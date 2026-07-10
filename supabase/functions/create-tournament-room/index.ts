import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { VIBES } from "../../../src/vibes.js";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

const MAX_ACTIVE_ROOMS = 5;
const MAX_DAILY_ROOMS = 20;
const MAX_DURATION_MINUTES = 24 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanTitle(value: unknown) {
  const title = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  return title || "Community Cup";
}

function durationMinutes(value: unknown) {
  const minutes = Math.trunc(Number(value));
  if (!Number.isFinite(minutes)) return 30;
  return Math.max(5, Math.min(MAX_DURATION_MINUTES, minutes));
}

function randomCode(length = 5) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function randomSeed() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] >>> 0;
}

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

    const { error: closeExpiredError } = await supabase.rpc("close_expired_tournament_rooms");
    if (closeExpiredError) throw closeExpiredError;

    const body = await req.json().catch(() => ({}));
    const now = Date.now();
    const duration = durationMinutes(body.durationMinutes);

    const { count: activeCount, error: activeError } = await supabase
      .from("tournament_rooms")
      .select("id", { count: "exact", head: true })
      .eq("creator_user_id", userData.user.id)
      .in("status", ["lobby", "live"])
      .gte("created_at", new Date(now - 24 * 60 * 60_000).toISOString());
    if (activeError) throw activeError;
    if ((activeCount ?? 0) >= MAX_ACTIVE_ROOMS) {
      return json({ error: "too_many_active_rooms" }, 429, cors);
    }

    const { count: dailyCount, error: dailyError } = await supabase
      .from("tournament_rooms")
      .select("id", { count: "exact", head: true })
      .eq("creator_user_id", userData.user.id)
      .gte("created_at", new Date(now - 24 * 60 * 60_000).toISOString());
    if (dailyError) throw dailyError;
    if ((dailyCount ?? 0) >= MAX_DAILY_ROOMS) {
      return json({ error: "room_create_rate_limited" }, 429, cors);
    }

    const requestedVibe = String(body.vibeId ?? "");
    const vibe = VIBES.find((entry) => entry.id === requestedVibe) ?? VIBES[randomSeed() % VIBES.length];
    const seed = randomSeed();
    const rules = {
      attemptsLimit: 1,
      diagonalAssist: false,
      diagonalSwaps: false,
      specialTiles: true,
      endlessRun: true,
      boostersAllowed: false,
    };

    let lastError = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomCode();
      const { data, error } = await supabase
        .from("tournament_rooms")
        .insert({
          code,
          title: cleanTitle(body.title),
          creator_user_id: userData.user.id,
          status: "lobby",
          starts_at: new Date(now).toISOString(),
          ends_at: null,
          duration_minutes: duration,
          seed,
          vibe_id: vibe.id,
          rules,
        })
        // A tournament seed is secret until an authenticated player starts an
        // attempt. Returning it from the lobby lets clients pre-compute a run.
        .select("id, code, title, creator_user_id, status, started_at, ends_at, duration_minutes, max_players, vibe_id, rules")
        .single();

      if (!error && data) {
        return json({ room: data }, 200, cors);
      }
      lastError = error;
      if (!String(error?.message ?? "").toLowerCase().includes("duplicate")) break;
    }

    throw lastError ?? new Error("Unable to create room");
  } catch (error) {
    console.error("create-tournament-room failed:", error);
    return json({ error: "create_tournament_room_failed" }, 500, cors);
  }
});
