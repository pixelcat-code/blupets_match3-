import { json } from "./http.ts";

// Expected tournament rejections are operational signals, not server crashes.
// Emit one small structured line so Logs Explorer can aggregate the exact
// reason without recording tokens, user ids, room codes, or replay payloads.
export function tournamentReject(
  scope: string,
  code: string,
  status: number,
  cors: Record<string, string>,
  context: Record<string, string | number | boolean | null> = {},
) {
  console.warn(JSON.stringify({
    event: "tournament_request_rejected",
    scope,
    code,
    status,
    ...context,
  }));
  return json({ error: code }, status, cors);
}

export function tournamentRpcErrorCode(error: any, fallback: string) {
  const message = String(error?.message ?? "").trim().toLowerCase();
  for (const code of [
    "room_not_found",
    "not_host",
    "already_started",
    "players_not_ready",
    "room_already_started",
    "host_has_no_ready_state",
    "not_registered_for_room",
    "removed_from_room",
  ]) {
    if (message.includes(code)) return code;
  }
  return fallback;
}
