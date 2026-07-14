import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { bearerToken, corsHeaders, json, requireEnv } from "../_shared/http.ts";
import { tournamentReject } from "../_shared/tournament-errors.ts";
import { getReplayResultSummary, replayRun } from "../../../src/run-replay.js";
import { NEUTRAL_VIBE, VIBES } from "../../../src/vibes.js";
import { tournamentAttemptExpiresAt, tournamentEndMs } from "../../../src/util/tournament-deadline.js";

const MAX_SCORE = 10_000_000;
const MAX_MOVES = 10_000;
const MAX_ACTIONS = 500;
const MIN_RUN_DURATION_MS = 3000;
// A small delivery buffer covers the final request racing mobile radios, but
// is short enough that it cannot turn into meaningful extra play time.
const SUBMIT_GRACE_MS = 15_000;

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

function str(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function validateResult(raw: any): { result?: any; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "missing_result" };

  const score = Number(raw.score);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return { error: "invalid_score" };
  }

  const movesUsed = Number(raw.movesUsed);
  if (!Number.isInteger(movesUsed) || movesUsed < 0 || movesUsed > MAX_MOVES) {
    return { error: "invalid_moves" };
  }

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
    const clientSessionId = body.clientSessionId;
    const abandoned = body.abandoned === true;
    const rejectionContext = {
      actionCount: Array.isArray(body.actions) ? body.actions.length : -1,
      abandoned,
    };
    if (!runId) return json({ error: "missing_run_id" }, 400, cors);
    if (!isUuid(clientSessionId)) {
      return tournamentReject("submit-tournament-run", "invalid_client_session", 400, cors, rejectionContext);
    }

    const { result, error: validationError } = validateResult(body.result);
    if (validationError) {
      return tournamentReject("submit-tournament-run", validationError, 422, cors, rejectionContext);
    }
    const zeroScoreDnf = abandoned && result?.score === 0;
    if (!Array.isArray(body.actions) || body.actions.length > MAX_ACTIONS || (!zeroScoreDnf && body.actions.length === 0)) {
      return tournamentReject("submit-tournament-run", "invalid_actions", 422, cors, rejectionContext);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401, cors);
    const user = userData.user;

    const { data: run, error: runError } = await supabase
      .from("tournament_runs")
      .select("id, room_id, user_id, seed, created_at, started_at, submitted_at, client_session_id, tournament_rooms(id, code, title, status, ends_at, duration_minutes, seed, vibe_id, rules)")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();
    if (runError || !run) return json({ error: "run_not_found" }, 404, cors);
    if (run.submitted_at) {
      const { data: existingEntry } = await supabase
        .from("tournament_leaderboard_entries")
        .select("*")
        .eq("room_id", run.room_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (existingEntry) return json({ ok: true, entry: existingEntry, recovered: true }, 200, cors);
    }
    if (!run.submitted_at && run.client_session_id !== clientSessionId) {
      return tournamentReject("submit-tournament-run", "attempt_active_elsewhere", 409, cors, rejectionContext);
    }

    const room = Array.isArray(run.tournament_rooms) ? run.tournament_rooms[0] : run.tournament_rooms;
    if (!room) return json({ error: "room_not_found" }, 404, cors);
    const attemptStartMs = new Date(run.started_at || run.created_at).getTime();
    const attemptDurationMs = Math.max(1, Number(room.duration_minutes || 30)) * 60_000;
    const roomEndsAtMs = tournamentEndMs(room.ends_at);
    if (roomEndsAtMs === null) {
      return tournamentReject("submit-tournament-run", "invalid_room_deadline", 422, cors, rejectionContext);
    }
    const attemptEndsAtMs = tournamentAttemptExpiresAt(attemptStartMs, attemptDurationMs, roomEndsAtMs);
    if (!run.submitted_at) {
      if (Date.now() > attemptEndsAtMs + SUBMIT_GRACE_MS) {
        return tournamentReject("submit-tournament-run", "attempt_expired", 422, cors, rejectionContext);
      }
      if (Date.now() - new Date(run.created_at).getTime() < MIN_RUN_DURATION_MS) {
        return tournamentReject("submit-tournament-run", "run_too_fast", 422, cors, rejectionContext);
      }
    }

    const replay = replayRun(Number(run.seed) >>> 0, body.actions, tournamentOptions(room) as any);
    const replayedResult = getReplayResultSummary(replay.state);
    if (!replayedResult || (!abandoned && !replayedResult.complete)) {
      return tournamentReject("submit-tournament-run", "run_not_complete", 422, cors, rejectionContext);
    }
    if (!sameResult(result, replayedResult)) {
      return tournamentReject("submit-tournament-run", "replay_mismatch", 422, cors, rejectionContext);
    }

    const entry = {
      room_id: run.room_id,
      user_id: user.id,
      account_name: labelForUser(user),
      avatar_url: avatarForUser(user) || null,
      score: result.score,
      moves_used: result.movesUsed,
      t4_color: result.colorId,
      t4_partner: result.partnerColorId,
      t4_form_key: result.formKey,
      vibe: result.vibe,
      validation_mode: abandoned ? "replay_verified_partial" : "replay_verified",
    };

    if (!run.submitted_at) {
      const { data: claimedRun, error: claimError } = await supabase
        .from("tournament_runs")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", run.id)
        .eq("user_id", user.id)
        .eq("client_session_id", clientSessionId)
        .is("submitted_at", null)
        .select("id")
        .single();
      if (claimError || !claimedRun) {
        return tournamentReject("submit-tournament-run", "run_already_submitted", 409, cors, rejectionContext);
      }
    }

    const { error: entryError } = await supabase
      .from("tournament_leaderboard_entries")
      .insert(entry);
    if (entryError) {
      if (entryError.code !== "23505") throw entryError;
      const { data: existingEntry, error: existingEntryError } = await supabase
        .from("tournament_leaderboard_entries")
        .select("*")
        .eq("room_id", run.room_id)
        .eq("user_id", user.id)
        .single();
      if (existingEntryError || !existingEntry) throw entryError;
      return json({ ok: true, entry: existingEntry, recovered: true }, 200, cors);
    }

    return json({ ok: true, entry }, 200, cors);
  } catch (error) {
    console.error("submit-tournament-run failed:", error);
    return json({ error: "submit_tournament_run_failed" }, 500, cors);
  }
});
