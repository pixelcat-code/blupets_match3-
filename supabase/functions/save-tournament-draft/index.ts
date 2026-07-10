import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { getReplayResultSummary, replayRun } from "../../../src/run-replay.js";
import { NEUTRAL_VIBE, VIBES } from "../../../src/vibes.js";
import { tournamentAttemptExpiresAt, tournamentEndMs } from "../../../src/util/tournament-deadline.js";

const MAX_ACTIONS = 500;

function str(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const out = value.trim();
  return out && out.length <= maxLen ? out : null;
}

function validateResult(raw: any): { result?: any; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "missing_result" };
  const score = Number(raw.score);
  const movesUsed = Number(raw.movesUsed);
  if (!Number.isInteger(score) || score < 0 || score > 10_000_000) return { error: "invalid_score" };
  if (!Number.isInteger(movesUsed) || movesUsed < 0 || movesUsed > 10_000) return { error: "invalid_moves" };
  const formKey = str(raw.formKey, 64);
  const colorId = str(raw.colorId, 32);
  const partnerColorId = str(raw.partnerColorId, 32);
  if (!formKey || !colorId || !partnerColorId) return { error: "invalid_form" };
  return {
    result: {
      score,
      movesUsed,
      formKey,
      formName: str(raw.formName, 80) || formKey,
      colorId,
      partnerColorId,
      vibe: str(raw.vibe, 32),
    },
  };
}

function sameResult(client: any, replayed: any) {
  return client.score === replayed.score &&
    client.movesUsed === replayed.movesUsed &&
    client.formKey === replayed.formKey &&
    client.colorId === replayed.colorId &&
    client.partnerColorId === replayed.partnerColorId &&
    (client.vibe ?? null) === (replayed.vibe ?? null);
}

function tournamentOptions(room: any) {
  const rules = room.rules && typeof room.rules === "object" ? room.rules : {};
  return {
    diagonalAssist: Boolean(rules.diagonalAssist),
    diagonalSwaps: Boolean(rules.diagonalSwaps),
    specialTiles: rules.specialTiles !== false,
    endlessRun: rules.endlessRun !== false,
    vibe: VIBES.find((vibe) => vibe.id === room.vibe_id) ?? NEUTRAL_VIBE,
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Missing bearer token" }, 401, cors);
    const body = await req.json().catch(() => ({}));
    const runId = String(body.runId ?? "");
    const { result, error: resultError } = validateResult(body.result);
    if (!runId || resultError) return json({ error: resultError ?? "missing_run_id" }, 422, cors);
    if (!Array.isArray(body.actions) || body.actions.length > MAX_ACTIONS) {
      return json({ error: "invalid_actions" }, 422, cors);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);

    const { data: run, error: runError } = await supabase
      .from("tournament_runs")
      .select("id, user_id, seed, created_at, started_at, submitted_at, draft_action_count, tournament_rooms(ends_at, duration_minutes, vibe_id, rules)")
      .eq("id", runId)
      .eq("user_id", userData.user.id)
      .single();
    if (runError || !run) return json({ error: "run_not_found" }, 404, cors);
    if (run.submitted_at) return json({ ok: true, finalized: true }, 200, cors);

    const room = Array.isArray(run.tournament_rooms) ? run.tournament_rooms[0] : run.tournament_rooms;
    if (!room) return json({ error: "room_not_found" }, 404, cors);
    const startMs = new Date(run.started_at || run.created_at).getTime();
    const endMs = tournamentEndMs(room.ends_at);
    if (!Number.isFinite(startMs) || endMs === null) return json({ error: "invalid_room_deadline" }, 422, cors);
    const attemptEndMs = tournamentAttemptExpiresAt(
      startMs,
      Math.max(1, Number(room.duration_minutes || 30)) * 60_000,
      endMs,
    );
    if (Date.now() > attemptEndMs) return json({ error: "attempt_expired" }, 422, cors);

    const replay = replayRun(Number(run.seed) >>> 0, body.actions, tournamentOptions(room) as any);
    const replayed = getReplayResultSummary(replay.state);
    if (!replayed || !sameResult(result, replayed)) return json({ error: "replay_mismatch" }, 422, cors);

    // Pagehide and periodic requests can arrive out of order. Never let an
    // older snapshot overwrite a draft with more player actions.
    const actionCount = replay.actions.length;
    if (actionCount < Number(run.draft_action_count || 0)) return json({ ok: true, stale: true }, 200, cors);
    const { data: updated, error: updateError } = await supabase
      .from("tournament_runs")
      .update({
        draft_actions: replay.actions,
        draft_result: result,
        draft_action_count: actionCount,
        draft_saved_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("user_id", userData.user.id)
      .is("submitted_at", null)
      .lte("draft_action_count", actionCount)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    return json({ ok: true, saved: Boolean(updated), actionCount }, 200, cors);
  } catch (error) {
    console.error("save-tournament-draft failed:", error);
    return json({ error: "save_tournament_draft_failed" }, 500, cors);
  }
});
