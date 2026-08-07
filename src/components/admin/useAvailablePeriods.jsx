import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Returns the current ISO week id (Mon-based) for UTC, e.g. "2026-W18".
// Must mirror lib/periodIds.js — proper ISO 8601, Mon-start, Sun 23:59 UTC end.
// The previous Sun-start formula was off-by-one on Sundays, which made the admin
// period dropdown show next week as "current" while the rest of the app used this week.
export function getCurrentWeekId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

// Derives the season id (4-week buckets) from a week id, e.g. "2026-W18" -> "2026-S5".
export function seasonIdFromWeekId(weekId) {
    if (!weekId || !weekId.includes('-W')) return '';
    const [year, weekPart] = weekId.split('-W');
    const week = Number(weekPart);
    if (!Number.isFinite(week)) return '';
    const seasonNum = Math.floor((week - 1) / 4) + 1;
    return `${year}-S${seasonNum}`;
}

export function getCurrentSeasonId() {
    return seasonIdFromWeekId(getCurrentWeekId());
}

/**
 * Loads available period IDs from existing TokenPools, so admin tools can
 * offer a dropdown instead of free-text input. Always includes the current
 * week and season at the top, even if no pool exists yet.
 *
 * Returns:
 *   { weeks: ['2026-W18', '2026-W17', …], seasons: ['2026-S5', '2026-S4', …], isLoading }
 */
export function useAvailablePeriods(walletAddress) {
    const { data: pools = [], isLoading } = useQuery({
        queryKey: ['adminPoolsForPeriods', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'pools' })
            .then(r => r.data?.pools || []),
        enabled: !!walletAddress,
        staleTime: 60_000,
    });

    const currentWeek = getCurrentWeekId();
    const currentSeason = getCurrentSeasonId();

    const weekSet = new Set([currentWeek]);
    const seasonSet = new Set([currentSeason]);
    pools.forEach(p => {
        if (p.period_type === 'weekly' && p.period_id) weekSet.add(p.period_id);
        if (p.period_type === 'seasonal' && p.period_id) seasonSet.add(p.period_id);
    });

    const weeks = Array.from(weekSet).sort((a, b) => b.localeCompare(a));
    const seasons = Array.from(seasonSet).sort((a, b) => b.localeCompare(a));

    return { weeks, seasons, currentWeek, currentSeason, isLoading };
}