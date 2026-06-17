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
    return url.protocol === "https:" ? raw : "";
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

    const body = await req.json().catch(() => ({}));
    const runId = String(body.runId ?? "");
    if (!runId) return json({ error: "Missing runId" }, 400);

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const user = userData.user;

    const { data: run, error: runError } = await supabase
      .from("game_runs")
      .select("id, seed, submitted_at, created_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) return json({ error: "Run not found" }, 404);
    if (run.submitted_at) return json({ error: "Run already submitted" }, 409);

    // Reject runs older than 30 minutes — prevents storing seeds for later cherry-picking.
    const RUN_TTL_MS = 30 * 60 * 1000;
    if (Date.now() - new Date(run.created_at).getTime() > RUN_TTL_MS) {
      return json({ error: "run_expired" }, 422);
    }

    const { state, actions } = replayRun(run.seed, body.actions);
    if (!state.victory || !state.victoryMeta) {
      return json({ error: "Run replay did not reach victory" }, 422);
    }

    // Reject implausible wins: T4 requires 42+ matches; fewer than 5 swaps is impossible.
    if (state.movesUsed < 5) {
      return json({ error: "implausible_run" }, 422);
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

    return json({ ok: true, entry, progress });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Submit run failed" }, 500);
  }
});
