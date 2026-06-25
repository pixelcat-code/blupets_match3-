import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";

function labelForUser(user: any) {
  const meta = user?.user_metadata ?? {};
  return (
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
    // Return the normalized href (not the raw string) so any dangerous
    // characters in the URL are percent-encoded before being stored/rendered.
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function emptyProgress() {
  return { forms: {}, runs: 0, wins: 0, bestScore: 0, fewestMovesWin: null as number | null };
}

// Merge a validated win result into the cross-run progress record.
function mergeWin(progress: any, result: any) {
  const next = { ...emptyProgress(), ...(progress ?? {}) };
  const formKey = result.formKey;
  const existing = next.forms?.[formKey];

  next.forms = { ...(next.forms ?? {}) };
  next.runs = Number(next.runs ?? 0) + 1;
  next.wins = Number(next.wins ?? 0) + 1;
  next.bestScore = Math.max(Number(next.bestScore ?? 0), result.score);
  if (next.fewestMovesWin == null || result.movesUsed < next.fewestMovesWin) {
    next.fewestMovesWin = result.movesUsed;
  }
  next.forms[formKey] = {
    name: result.formName || existing?.name || formKey,
    asset: null,
    color: result.colorId || existing?.color || null,
    partner: result.partnerColorId || existing?.partner || null,
    count: Number(existing?.count ?? 0) + 1,
    firstAt: existing?.firstAt ?? Date.now(),
  };
  return next;
}

// Plausibility bounds for a client-reported win. We no longer replay the action
// log server-side; instead we sanity-check the reported result against ranges a
// real T4 victory must fall within, and reject anything obviously forged or
// malformed. This keeps wins flowing reliably while still blocking the crudest
// tampering. Account name / avatar are taken from the authenticated user (never
// the client), so identity itself can't be spoofed.
const MAX_SCORE = 10_000_000;
const MIN_MOVES = 5; // a real T4 win can't complete in fewer swaps
const MAX_MOVES = 10_000;

function str(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

// Validate the client-reported result. Returns the normalized result, or an
// error code string on the first failed check.
function validateResult(raw: any): { result?: any; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "missing_result" };

  const score = Number(raw.score);
  if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) {
    return { error: "invalid_score" };
  }

  const movesUsed = Number(raw.movesUsed);
  if (!Number.isInteger(movesUsed) || movesUsed > MAX_MOVES) {
    return { error: "invalid_moves" };
  }
  if (movesUsed < MIN_MOVES) {
    return { error: "implausible_run" };
  }

  const formKey = str(raw.formKey, 64);
  if (!formKey) return { error: "invalid_form" };

  const colorId = str(raw.colorId, 32);
  const partnerColorId = str(raw.partnerColorId, 32);
  if (!colorId || !partnerColorId) return { error: "invalid_form" };

  const formName = str(raw.formName, 80) || formKey;
  const vibe = str(raw.vibe, 32); // optional; null if absent

  return {
    result: { score, movesUsed, formKey, formName, colorId, partnerColorId, vibe },
  };
}

// Per-user submission rate limiting. Cap submissions and require a minimum
// wall-clock run duration to block scripted open->submit->repeat farming loops.
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMITS_PER_WINDOW = 20;
const MIN_RUN_DURATION_MS = 3000;

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
    const runId = String(body.runId ?? "");
    if (!runId) return json({ error: "Missing runId" }, 400, cors);

    const { result, error: validationError } = validateResult(body.result);
    if (validationError) return json({ error: validationError }, 422, cors);

    // Per-family unlocked-tile snapshot ({ apexKey: count }). Self-reported (no
    // server-side merge validation is possible), so just defend the shape:
    // at most 36 entries, integer counts clamped to [0, 9], short keys.
    const familyBadges: Record<string, number> = {};
    const rawBadges = body.familyBadges;
    if (rawBadges && typeof rawBadges === "object" && !Array.isArray(rawBadges)) {
      for (const [key, value] of Object.entries(rawBadges).slice(0, 36)) {
        const n = Math.trunc(Number(value));
        familyBadges[String(key).slice(0, 64)] =
          Number.isFinite(n) ? Math.max(0, Math.min(9, n)) : 0;
      }
    }
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
    const user = userData.user;

    // Rate-limit: reject if the user already submitted MAX_SUBMITS_PER_WINDOW
    // runs in the trailing window. Blocks high-speed farming.
    const windowStart = new Date(Date.now() - SUBMIT_WINDOW_MS).toISOString();
    const { count: recentSubmits, error: rateError } = await supabase
      .from("game_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("submitted_at", "is", null)
      .gte("submitted_at", windowStart);
    if (rateError) throw rateError;
    if ((recentSubmits ?? 0) >= MAX_SUBMITS_PER_WINDOW) {
      return json({ error: "rate_limited" }, 429, cors);
    }

    const { data: run, error: runError } = await supabase
      .from("game_runs")
      .select("id, seed, submitted_at, created_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) return json({ error: "Run not found" }, 404, cors);
    if (run.submitted_at) return json({ error: "Run already submitted" }, 409, cors);

    const runAgeMs = Date.now() - new Date(run.created_at).getTime();

    // Reject runs older than 30 minutes — prevents storing seeds for later cherry-picking.
    const RUN_TTL_MS = 30 * 60 * 1000;
    if (runAgeMs > RUN_TTL_MS) {
      return json({ error: "run_expired" }, 422, cors);
    }

    // Reject impossibly fast submissions — a real T4 win cannot complete in
    // under a few seconds of wall-clock time, so this catches instant scripts.
    if (runAgeMs < MIN_RUN_DURATION_MS) {
      return json({ error: "run_too_fast" }, 422, cors);
    }

    const accountName = labelForUser(user);
    const avatarUrl = avatarForUser(user);
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
      family_badges: familyBadges,
      blupets_count: blupetsCount,
    };

    const { data: progressRow } = await supabase
      .from("user_progress")
      .select("wins, runs, best_score, fewest_moves_win, forms, progress")
      .eq("user_id", user.id)
      .maybeSingle();
    const clientProgress = sanitizeProgressSnapshot(body.progress, progressRow?.progress ?? {});
    const progress = mergeWin({
      wins: progressRow?.wins,
      runs: progressRow?.runs,
      bestScore: progressRow?.best_score,
      fewestMovesWin: progressRow?.fewest_moves_win,
      forms: progressRow?.forms,
    }, result);
    const clientRuns = Number(clientProgress?.runs);
    if (Number.isFinite(clientRuns) && clientRuns > Number(progressRow?.runs ?? 0)) {
      progress.runs = Math.max(0, Math.floor(clientRuns));
    }
    const progressSnapshot = {
      ...clientProgress,
      wins: progress.wins,
      runs: progress.runs,
      bestScore: progress.bestScore,
      fewestMovesWin: progress.fewestMovesWin,
      forms: progress.forms,
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

    const { error: runUpdateError } = await supabase
      .from("game_runs")
      .update({ submitted_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("user_id", user.id);
    if (runUpdateError) throw runUpdateError;

    return json({ ok: true, entry, progress: progressSnapshot }, 200, cors);
  } catch (error) {
    console.error("submit-run failed:", error);
    return json({ error: "submit_run_failed" }, 500, cors);
  }
});
