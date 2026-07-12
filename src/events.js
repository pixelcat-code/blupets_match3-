// Content-agnostic helpers for run-badge events. Each normal verified run adds
// one badge; ranking compares badge-rank counts from highest to lowest.

function finiteInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function normalizeRankingVector(value) {
  return Array.isArray(value) ? value.map(finiteInt) : [];
}

// Positive means `left` ranks above `right`. Vectors are already ordered by
// the backend from highest event rank to lowest event rank.
export function compareRankingVectors(left, right) {
  const a = normalizeRankingVector(left);
  const b = normalizeRankingVector(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function compareEventLeaderboardRows(left, right) {
  const vectorOrder = compareRankingVectors(right?.rankingVector, left?.rankingVector);
  if (vectorOrder !== 0) return vectorOrder;
  const leftTime = Date.parse(left?.reachedVectorAt ?? "") || Number.MAX_SAFE_INTEGER;
  const rightTime = Date.parse(right?.reachedVectorAt ?? "") || Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
}

export function sortEventLeaderboard(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    rankingVector: normalizeRankingVector(row?.rankingVector),
  })).sort(compareEventLeaderboardRows);
}

export function normalizeEventSnapshot(payload) {
  const snapshot = payload && typeof payload === "object" ? payload : null;
  if (!snapshot?.event?.id) return null;
  const progress = snapshot.progress && typeof snapshot.progress === "object" ? snapshot.progress : {};
  return {
    event: {
      ...snapshot.event,
      status: ["scheduled", "active", "results"].includes(snapshot.event.status)
        ? snapshot.event.status
        : "scheduled",
    },
    badges: Array.isArray(snapshot.badges) ? snapshot.badges.map((badge) => ({
      ...badge,
      rankOrder: finiteInt(badge?.rankOrder),
      weight: Math.max(0, Number(badge?.weight) || 0),
    })) : [],
    progress: {
      ...progress,
      badgeCounts: progress.badgeCounts && typeof progress.badgeCounts === "object" ? progress.badgeCounts : {},
      rankCounts: progress.rankCounts && typeof progress.rankCounts === "object" ? progress.rankCounts : {},
      rankingVector: normalizeRankingVector(progress.rankingVector),
      totalBadges: finiteInt(progress.totalBadges),
    },
    leaderboard: sortEventLeaderboard(snapshot.leaderboard),
    winners: sortEventLeaderboard(snapshot.winners),
  };
}

export function eventCountdownTarget(event) {
  if (!event) return null;
  if (event.status === "results") return event.resultsUntil ?? null;
  return event.endsAt ?? event.startsAt ?? null;
}
