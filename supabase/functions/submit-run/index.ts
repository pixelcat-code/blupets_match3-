import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { replayRun } from "../../../src/run-replay.js";
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

function mergeWin(progress: any, state: any) {
  const next = { ...emptyProgress(), ...(progress ?? {}) };
  const meta = state.victoryMeta;
  const formKey = meta?.formKey || `${meta?.colorId ?? "UNKNOWN"}:${meta?.partnerColorId ?? "UNKNOWN"}:T4`;
  const existing = next.forms?.[formKey];

  next.forms = { ...(next.forms ?? {}) };
  next.runs = Number(next.runs ?? 0) + 1;
  next.wins = Number(next.wins ?? 0) + 1;
  next.bestScore = Math.max(Number(next.bestScore ?? 0), Number(state.score ?? 0));
  if (next.fewestMovesWin == null || state.movesUsed < next.fewestMovesWin) {
    next.fewestMovesWin = state.movesUsed;
  }
  next.forms[formKey] = {
    name: meta?.formName || existing?.name || formKey,
    asset: null,
    color: meta?.colorId || existing?.color || null,
    partner: meta?.partnerColorId || existing?.partner || null,
    count: Number(existing?.count ?? 0) + 1,
    firstAt: existing?.firstAt ?? Date.now(),
  };
  return next;
}

// Per-user submission rate limiting — the run replay validates that a single
// run is legitimate, but not the rate of farming. Cap submissions and require a
// minimum wall-clock run duration to block scripted open→submit→repeat loops.
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMITS_PER_WINDOW = 20;
const MIN_RUN_DURATION_MS = 3000;

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
    // runs in the trailing window. Blocks high-speed seed farming.
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

    const { state, actions } = replayRun(run.seed, body.actions);
    if (!state.victory || !state.victoryMeta) {
      return json({ error: "Run replay did not reach victory" }, 422, cors);
    }

    // Reject implausible wins: T4 requires 42+ matches; fewer than 5 swaps is impossible.
    if (state.movesUsed < 5) {
      return json({ error: "implausible_run" }, 422, cors);
    }

    const accountName = labelForUser(user);
    const avatarUrl = avatarForUser(user);
    const meta = state.victoryMeta;
    const entry = {
      user_id: user.id,
      account_name: accountName,
      avatar_url: avatarUrl || null,
      score: state.score,
      moves_used: state.movesUsed,
      t4_color: meta.colorId,
      t4_partner: meta.partnerColorId,
      t4_form_key: meta.formKey,
      vibe: state.vibe.id,
    };

    const { data: progressRow } = await supabase
      .from("user_progress")
      .select("wins, runs, best_score, fewest_moves_win, forms")
      .eq("user_id", user.id)
      .maybeSingle();
    const progress = mergeWin({
      wins: progressRow?.wins,
      runs: progressRow?.runs,
      bestScore: progressRow?.best_score,
      fewestMovesWin: progressRow?.fewest_moves_win,
      forms: progressRow?.forms,
    }, state);

    const { error: progressError } = await supabase.from("user_progress").upsert(
      {
        user_id: user.id,
        wins: progress.wins,
        runs: progress.runs,
        best_score: progress.bestScore,
        fewest_moves_win: progress.fewestMovesWin,
        forms: progress.forms,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (progressError) throw progressError;

    const { error: entryError } = await supabase.from("leaderboard_entries").insert(entry);
    if (entryError) throw entryError;

    const { error: runUpdateError } = await supabase
      .from("game_runs")
      .update({ submitted_at: new Date().toISOString(), action_count: actions.length })
      .eq("id", runId)
      .eq("user_id", user.id);
    if (runUpdateError) throw runUpdateError;

    return json({ ok: true, entry, progress }, 200, cors);
  } catch (error) {
    console.error("submit-run failed:", error);
    return json({ error: "submit_run_failed" }, 500, cors);
  }
});
