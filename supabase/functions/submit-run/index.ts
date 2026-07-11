import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { getReplayCollectionTiles, getReplayResultSummary, replayRun } from "../../../src/run-replay.js";

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

// Merge a validated completed-run result into the cross-run progress record.
// The game has no win/loss state in production; all final results are runs.
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

// Bounds stay as a cheap malformed-payload filter. The authoritative result is
// computed below by replaying the submitted action log from the server-issued seed.
const MAX_SCORE = 10_000_000;
const MIN_MOVES = 5; // a meaningful run can't complete in fewer matching swaps
const MAX_MOVES = 10_000;
const MAX_ACTIONS = 500;

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

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mergeTrustedCollectionTiles(...sources: unknown[]): Record<string, true> {
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
    if (!Array.isArray(body.actions) || body.actions.length === 0 || body.actions.length > MAX_ACTIONS) {
      return json({ error: "invalid_actions" }, 422, cors);
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
    const user = userData.user;

    const { data: run, error: runError } = await supabase
      .from("game_runs")
      .select("id, seed, submitted_at, created_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runError || !run) return json({ error: "Run not found" }, 404, cors);
    if (run.submitted_at) {
      const { data: existingEntry } = await supabase
        .from("leaderboard_entries")
        .select("*")
        .eq("run_id", run.id)
        .maybeSingle();
      if (existingEntry) return json({ ok: true, entry: existingEntry, recovered: true }, 200, cors);
    } else {
      // Rate-limit new submissions only. A retry of a claimed run must always
      // be allowed to recover from a transient write failure.
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
    }

    const runAgeMs = Date.now() - new Date(run.created_at).getTime();

    if (!run.submitted_at) {
      // Reject runs older than 30 minutes — prevents storing seeds for later cherry-picking.
      const RUN_TTL_MS = 30 * 60 * 1000;
      if (runAgeMs > RUN_TTL_MS) {
        return json({ error: "run_expired" }, 422, cors);
      }

      // Reject impossibly fast submissions — a real run cannot complete in
      // under a few seconds of wall-clock time, so this catches instant scripts.
      if (runAgeMs < MIN_RUN_DURATION_MS) {
        return json({ error: "run_too_fast" }, 422, cors);
      }
    }

    const replay = replayRun(Number(run.seed) >>> 0, body.actions);
    const replayedResult = getReplayResultSummary(replay.state);
    if (!replayedResult?.complete) {
      return json({ error: "run_not_complete" }, 422, cors);
    }
    if (!sameResult(result, replayedResult)) {
      return json({ error: "replay_mismatch" }, 422, cors);
    }

    const accountName = labelForUser(user);
    const avatarUrl = avatarForUser(user);

    const { data: progressRow } = await supabase
      .from("user_progress")
      .select("wins, runs, best_score, fewest_moves_win, forms, progress, last_run_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const clientProgress = sanitizeProgressSnapshot(body.progress, progressRow?.progress ?? {});
    // Only a replay may change a public/ranked collection. Client capsule state
    // remains private UI progress and must never affect competitive standings.
    const collectionTilesEntry = mergeTrustedCollectionTiles(
      (progressRow?.progress as any)?.verifiedCollectionTiles,
      getReplayCollectionTiles(replay.state),
    );
    const { data: mergedCollection, error: collectionMergeError } = await supabase.rpc(
      "merge_player_public_collection",
      {
        target_user_id: user.id,
        incoming_tiles: collectionTilesEntry,
        incoming_account_name: accountName,
        incoming_avatar_url: avatarUrl || null,
      },
    );
    if (collectionMergeError) throw collectionMergeError;
    const publicCollectionTiles = mergeTrustedCollectionTiles(mergedCollection);

    const entry = {
      user_id: user.id,
      score: result.score,
      moves_used: result.movesUsed,
      t4_color: result.colorId,
      t4_partner: result.partnerColorId,
      t4_form_key: result.formKey,
      vibe: result.vibe,
      validation_mode: "replay_verified",
    };
    const currentProgress: any = progressRow ?? {};
    const progress = currentProgress.last_run_id === run.id
      ? {
        wins: currentProgress.wins ?? 0,
        runs: currentProgress.runs ?? 0,
        bestScore: currentProgress.best_score ?? 0,
        fewestMovesWin: currentProgress.fewest_moves_win ?? null,
        forms: currentProgress.forms ?? {},
      }
      : mergeRunResult({
        wins: progressRow?.wins ?? 0,
        runs: progressRow?.runs ?? 0,
        bestScore: progressRow?.best_score ?? 0,
        fewestMovesWin: progressRow?.fewest_moves_win ?? null,
        forms: progressRow?.forms ?? {},
      }, result);
    const progressSnapshot = {
      ...clientProgress,
      collectionTiles: publicCollectionTiles,
      wins: progress.wins,
      runs: progress.runs,
      bestScore: progress.bestScore,
      fewestMovesWin: progress.fewestMovesWin,
      forms: progress.forms,
      verifiedCollectionTiles: collectionTilesEntry,
      publicCollectionTiles,
    };

    if (!run.submitted_at) {
      const { data: claimedRun, error: claimError } = await supabase
        .from("game_runs")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("user_id", user.id)
        .is("submitted_at", null)
        .select("id")
        .single();
      if (claimError || !claimedRun) return json({ error: "Run already submitted" }, 409, cors);
    }

    const { error: progressError } = await supabase.from("user_progress").upsert(
      {
        user_id: user.id,
        wins: progress.wins,
        runs: progress.runs,
        best_score: progress.bestScore,
        fewest_moves_win: progress.fewestMovesWin,
        forms: progress.forms,
        progress: progressSnapshot,
        last_run_id: run.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (progressError) throw progressError;

    let persistedEntry = entry;
    const { error: entryError } = await supabase.from("leaderboard_entries").insert({ ...entry, run_id: run.id });
    if (entryError) {
      if (entryError.code !== "23505") throw entryError;
      const { data: existingEntry, error: existingEntryError } = await supabase
        .from("leaderboard_entries")
        .select("*")
        .eq("run_id", run.id)
        .single();
      if (existingEntryError || !existingEntry) throw entryError;
      persistedEntry = existingEntry;
    }

    return json({ ok: true, entry: persistedEntry, progress: progressSnapshot }, 200, cors);
  } catch (error) {
    console.error("submit-run failed:", error);
    return json({ error: "submit_run_failed" }, 500, cors);
  }
});
