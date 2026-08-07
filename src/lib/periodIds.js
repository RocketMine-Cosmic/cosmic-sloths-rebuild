/**
 * Canonical period ID computation — proper ISO 8601 week (Mon-start, Sun-end UTC).
 *
 * Bug history (Hugo 2026-05-03): the old formula used `getUTCDay() - 0 + 1` which
 * treated Sunday as the START of a new week, so `week_id` rolled over a full
 * day early at Sun 00:00 UTC instead of Mon 00:00 UTC. That meant W18 ended
 * 24h early and players started accumulating W19 scores before the leaderboard
 * timer (which correctly counts down to Sun 23:59 UTC) had elapsed. Fixed by
 * using the standard ISO 8601 algorithm.
 *
 * MUST be mirrored by every backend function that derives week_id / season_id
 * (saveScore, purchaseSku, spendGold, distributeRewards, alertLeaderboardTakeover,
 * checkpointRun, claimBounty, claimDailyLogin, etc.).
 */
export function getCurrentPeriodIds(date) {
    const now = date ? new Date(date) : new Date();

    // ISO 8601: weeks start Monday. The week that contains the year's first
    // Thursday is week 1. Algorithm: take the Thursday of the current week,
    // then count weeks from the Thursday of week 1.
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // Shift to Thursday of current ISO week (Mon=1..Sun=7 → Thu offset).
    const dayNum = tmp.getUTCDay() || 7; // 1..7 with Sun=7
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);

    const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    const season_id = `${isoYear}-S${seasonNum}`;
    return { week_id, season_id, isoWeek, year: isoYear };
}