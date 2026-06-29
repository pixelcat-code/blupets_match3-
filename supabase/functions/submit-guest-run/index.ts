import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { getReplayResultSummary, replayRun } from "../../../src/run-replay.js";

function labelForUser(user: any) {
  const meta = user?.user_metadata ?? {};
  return (
    meta.display_name ||
    meta.full_name ||
    meta.name ||
    meta.preferred_username ||
    meta.user_name ||
    user?.email ||
    user?.id ||
    "Player"
  );
}

function avatarForUser(user: any) {
  const meta = user?.user_metadata ?? {};
  const raw = meta.avatar_url || meta.picture || "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function emptyProgress() {
  return { forms: {}, runs: 0, wins: 0, bestScore: 0, fewestMovesWin: null as number | null };
}

function mergeRunResult(progress: any, result: any) {
  const next = { ...emptyProgress(), ...(progress ?? {}) };
  const formKey = result.formKey;
  const existing = next.forms?.[formKey];

  next.forms = { ...(next.forms ?? {}) };
  next.runs = Number(next.runs ?? 0) + 1;
  next.wins = Number(next.wins ?? 0);
  next.bestScore = Math.max(Number(next.bestScore ?? 0), result.score);
  if (next.fewestMovesWin == null || result.movesUsed < next.fewestMovesWin) {
    next.fewestMovesWin = result.movesUsed;
  }
  if (formKey !== "RUN_COMPLETE") {
    next.forms[formKey] = {
      name: result.formName || existing?.name || formKey,
      asset: null,
      color: result.colorId || existing?.color || null,
      partner: result.partnerColorId || existing?.partner || null,
      count: Number(existing?.count ?? 0) + 1,
      firstAt: existing?.firstAt ?? Date.now(),
    };
  }
  return next;
}

const MAX_SCORE = 10_000_000;
const MIN_MOVES = 5;
const MAX_MOVES = 10_000;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMITS_PER_WINDOW = 20;
const MIN_BETWEEN_GUEST_SUBMITS_MS = 30_000;
const MIN_RUN_DURATION_MS = 3000;
const RUN_TTL_MS = 30 * 60 * 1000;
const MAX_ACTIONS = 500;

function str(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function validateResult(raw: any): { result?: any; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "missing_result" };
  const score = Number(raw.score);
  if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) return { error: "invalid_score" };
  const movesUsed = Number(raw.movesUsed);
  if (!Number.isInteger(movesUsed) || movesUsed > MAX_MOVES) return { error: "invalid_moves" };
  if (movesUsed < MIN_MOVES) return { error: "implausible_run" };
  const formKey = str(raw.formKey, 64);
  if (!formKey) return { error: "invalid_form" };
  const colorId = str(raw.colorId, 32);
  const partnerColorId = str(raw.partnerColorId, 32);
  if (!colorId || !partnerColorId) return { error: "invalid_form" };
  const formName = str(raw.formName, 80) || formKey;
  const vibe = str(raw.vibe, 32);
  return { result: { score, movesUsed, formKey, formName, colorId, partnerColorId, vibe } };
}

function sameResult(client: any, replayed: any) {
  return (
    client.score === replayed.score &&
    client.movesUsed === replayed.movesUsed &&
    client.formKey === replayed.formKey &&
    client.colorId === replayed.colorId &&
    client.partnerColorId === replayed.partnerColorId &&
    (client.vibe ?? null) === (replayed.vibe ?? null)
  );
}

function sanitizeProgressSnapshot(raw: unknown, fallback: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  try {
    const jsonText = JSON.stringify(raw);
    if (jsonText.length > 200_000) return fallback;
    return JSON.parse(jsonText);
  } catch {
    return fallback;
  }
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mergeCollectionTiles(...sources: unknown[]): Record<string, true> {
  const out: Record<string, true> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(safeRecord(source)).slice(0, 512)) {
      if (value === true) out[String(key).slice(0, 96)] = true;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401, cors);

    const body = await req.json().catch(() => ({}));

    const { result, error: validationError } = validateResult(body.result);
    if (validationError) return json({ error: validationError }, 422, cors);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);
    const user = userData.user;

    // Rate limit: max 20 guest-run submissions per hour.
    const windowStart = new Date(Date.now() - SUBMIT_WINDOW_MS).toISOString();
    const { count: recentSubmits, error: rateError } = await supabase
      .from("leaderboard_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", windowStart);
    if (rateError) throw rateError;
    if ((recentSubmits ?? 0) >= MAX_SUBMITS_PER_WINDOW) {
      return json({ error: "rate_limited" }, 429, cors);
    }

    // Prevent double-submit from rapid retries (30-second cooldown).
    const recentWindow = new Date(Date.now() - MIN_BETWEEN_GUEST_SUBMITS_MS).toISOString();
    const { count: recentCount } = await supabase
      .from("leaderboard_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", recentWindow);
    if ((recentCount ?? 0) > 0) {
      return json({ error: "too_soon" }, 429, cors);
    }

    let validationMode = "guest_plausibility";
    const guestRunId = typeof body.guestRunId === "string" ? body.guestRunId.trim() : "";
    if (guestRunId) {
      if (!Array.isArray(body.actions) || body.actions.length === 0 || body.actions.length > MAX_ACTIONS) {
        return json({ error: "invalid_actions" }, 422, cors);
      }

      const { data: guestRun, error: guestRunError } = await supabase
        .from("guest_game_runs")
        .select("id, seed, created_at, submitted_at")
        .eq("id", guestRunId)
        .single();
      if (guestRunError || !guestRun) return json({ error: "guest_run_not_found" }, 404, cors);
      if (guestRun.submitted_at) return json({ error: "guest_run_already_submitted" }, 409, cors);

      const runAgeMs = Date.now() - new Date(guestRun.created_at).getTime();
      if (runAgeMs > RUN_TTL_MS) return json({ error: "guest_run_expired" }, 422, cors);
      if (runAgeMs < MIN_RUN_DURATION_MS) return json({ error: "guest_run_too_fast" }, 422, cors);

      const replay = replayRun(Number(guestRun.seed) >>> 0, body.actions);
      const replayedResult = getReplayResultSummary(replay.state);
      if (!replayedResult?.complete) return json({ error: "guest_run_not_complete" }, 422, cors);
      if (!sameResult(result, replayedResult)) return json({ error: "guest_replay_mismatch" }, 422, cors);

      const { data: claimedGuestRun, error: claimGuestError } = await supabase
        .from("guest_game_runs")
        .update({ submitted_at: new Date().toISOString(), claimed_by: user.id })
        .eq("id", guestRunId)
        .is("submitted_at", null)
        .select("id")
        .single();
      if (claimGuestError || !claimedGuestRun) {
        return json({ error: "guest_run_already_submitted" }, 409, cors);
      }
      validationMode = "guest_replay_verified";
    }

    const accountName = labelForUser(user);
    const avatarUrl = avatarForUser(user);

    const { data: progressRow } = await supabase
      .from("user_progress")
      .select("wins, runs, best_score, fewest_moves_win, forms, progress")
      .eq("user_id", user.id)
      .maybeSingle();
    const clientProgress = sanitizeProgressSnapshot(body.progress, progressRow?.progress ?? {});
    // Blupets count = the player's capsule collection (progress.collectionTiles),
    // the SAME Set the collection screen counts via collectionTileCount. Capsules
    // are client-trusted (plausibility), not replay-derived. mergeCollectionTiles
    // sanitizes keys/values and caps size. The full client set is written each
    // submission, so capsules (monotonic on the client) never regress.
    const collectionTilesEntry = mergeCollectionTiles(
      (clientProgress as any)?.collectionTiles,
    );
    const blupetsCount = Object.keys(collectionTilesEntry).length;

    const entry = {
      user_id: user.id,
      account_name: accountName,
      avatar_url: avatarUrl || null,
      score: result.score,
      moves_used: result.movesUsed,
      t4_color: result.colorId,
      t4_partner: result.partnerColorId,
      t4_form_key: result.formKey,
      vibe: result.vibe,
      family_badges: {},
      blupets_count: blupetsCount,
      collection_tiles: collectionTilesEntry,
      validation_mode: validationMode,
    };

    const progress = mergeRunResult({
      wins: progressRow?.wins ?? 0,
      runs: progressRow?.runs ?? 0,
      bestScore: progressRow?.best_score ?? 0,
      fewestMovesWin: progressRow?.fewest_moves_win ?? null,
      forms: progressRow?.forms ?? {},
    }, result);

    const progressSnapshot = {
      ...clientProgress,
      wins: progress.wins,
      runs: progress.runs,
      bestScore: progress.bestScore,
      fewestMovesWin: progress.fewestMovesWin,
      forms: progress.forms,
      serverCollectionTiles: collectionTilesEntry,
    };

    const { error: progressError } = await supabase.from("user_progress").upsert(
      {
        user_id: user.id,
        wins: progress.wins,
        runs: progress.runs,
        best_score: progress.bestScore,
        fewest_moves_win: progress.fewestMovesWin,
        forms: progress.forms,
        progress: progressSnapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (progressError) throw progressError;

    const { error: entryError } = await supabase.from("leaderboard_entries").insert(entry);
    if (entryError) throw entryError;

    // Blupets count is a property of the USER's capsule collection, not of any
    // single run. Overwrite every existing row for this user so the read-path
    // max-by-blupets dedup (sync.js fetchGlobalLeaderboard) can never resurrect
    // a stale, run-evolved (Set B) count. Evolved run forms must NOT influence
    // the leaderboard blupets number — only the capsule set does.
    const { error: backfillError } = await supabase
      .from("leaderboard_entries")
      .update({ blupets_count: blupetsCount, collection_tiles: collectionTilesEntry })
      .eq("user_id", user.id);
    if (backfillError) throw backfillError;

    return json({ ok: true, entry, progress: progressSnapshot }, 200, cors);
  } catch (error) {
    console.error("submit-guest-run failed:", error);
    return json({ error: "submit_guest_run_failed" }, 500, cors);
  }
});
