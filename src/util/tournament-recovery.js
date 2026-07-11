export const TOURNAMENT_RECOVERY_LEGACY_KEY = "blupets_tournament_recovery_v1";
export const TOURNAMENT_RECOVERY_STORE_KEY = "blupets_tournament_recoveries_v2";
export const TOURNAMENT_RECOVERY_MAX_AGE_MS = 26 * 60 * 60_000;

function validRecord(value, now) {
  return Boolean(
    value && typeof value === "object" && value.runId && value.userId && value.code &&
    now - Number(value.savedAt || 0) <= TOURNAMENT_RECOVERY_MAX_AGE_MS,
  );
}

export function readTournamentRecoveries(storage, now = Date.now()) {
  if (!storage) return [];
  const records = [];
  try {
    const store = JSON.parse(storage.getItem(TOURNAMENT_RECOVERY_STORE_KEY) || "null");
    if (store?.version === 2 && Array.isArray(store.records)) records.push(...store.records);
  } catch { /* Ignore malformed browser storage. */ }
  try {
    const legacy = JSON.parse(storage.getItem(TOURNAMENT_RECOVERY_LEGACY_KEY) || "null");
    if (legacy?.version === 1) records.push(legacy);
  } catch { /* Ignore malformed legacy storage. */ }

  const byRun = new Map();
  for (const record of records) {
    if (!validRecord(record, now)) continue;
    const previous = byRun.get(record.runId);
    if (!previous || Number(record.savedAt || 0) >= Number(previous.savedAt || 0)) {
      byRun.set(record.runId, record);
    }
  }
  return [...byRun.values()].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
}

export function getTournamentRecovery(storage, { userId = "", code = "", runId = "", now = Date.now() } = {}) {
  return readTournamentRecoveries(storage, now).find((record) =>
    (!userId || record.userId === userId) &&
    (!code || record.code === code) &&
    (!runId || record.runId === runId)
  ) ?? null;
}

export function putTournamentRecovery(storage, payload, now = Date.now()) {
  if (!storage || !payload?.runId || !payload?.userId || !payload?.code) return false;
  const records = readTournamentRecoveries(storage, now)
    .filter((record) => record.runId !== payload.runId);
  records.unshift(payload);
  storage.setItem(TOURNAMENT_RECOVERY_STORE_KEY, JSON.stringify({ version: 2, records }));
  storage.removeItem(TOURNAMENT_RECOVERY_LEGACY_KEY);
  return true;
}

export function removeTournamentRecovery(storage, { runId = "", userId = "", code = "" } = {}, now = Date.now()) {
  if (!storage) return false;
  const previous = readTournamentRecoveries(storage, now);
  const records = previous.filter((record) => !(
    (!runId || record.runId === runId) &&
    (!userId || record.userId === userId) &&
    (!code || record.code === code)
  ));
  if (records.length) {
    storage.setItem(TOURNAMENT_RECOVERY_STORE_KEY, JSON.stringify({ version: 2, records }));
  } else {
    storage.removeItem(TOURNAMENT_RECOVERY_STORE_KEY);
  }
  storage.removeItem(TOURNAMENT_RECOVERY_LEGACY_KEY);
  return records.length !== previous.length;
}
