import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the current season's Champions Pool standings (top 10 squads ranked).
// Read-only — used by the Squad Wars UI to show live progress.
// Auth: any signed-in user.

const CHAMPIONS_POOL_PCT = 0.10;
const TOP_3_SHARES = [0.5, 0.3, 0.2];
const MIN_WARS_FOUGHT = 2;
const MIN_SQUAD_MEMBERS = 2;

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
function getCurrentSeasonId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    return `${isoYear}-S${seasonNum}`;
}

function getWeekIdsForSeason(seasonId) {
    const m = /^(\d{4})-S(\d+)$/.exec(seasonId);
    if (!m) return [];
    const year = parseInt(m[1], 10);
    const sNum = parseInt(m[2], 10);
    const startWeek = (sNum - 1) * 4 + 1;
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const wk = startWeek + i;
        if (wk > 53) break;
        weeks.push(`${year}-W${String(wk).padStart(2, '0')}`);
    }
    return weeks;
}

// End of the season = end of the last ISO week (Sunday 23:59:59.999 UTC).
function getSeasonEndIso(seasonId) {
    const m = /^(\d{4})-S(\d+)$/.exec(seasonId);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const sNum = parseInt(m[2], 10);
    const lastWeek = sNum * 4;
    // ISO week N: find its Monday by anchoring to Jan 1 then adding (N-1)*7 days from week 1's Monday.
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const jan1Day = jan1.getUTCDay() || 7; // 1..7 (Mon..Sun)
    // Monday of ISO week 1
    const week1Monday = new Date(jan1);
    week1Monday.setUTCDate(jan1.getUTCDate() - (jan1Day - 1) + (jan1Day <= 4 ? 0 : 7));
    const lastWeekMonday = new Date(week1Monday);
    lastWeekMonday.setUTCDate(week1Monday.getUTCDate() + (lastWeek - 1) * 7);
    const seasonEnd = new Date(lastWeekMonday);
    seasonEnd.setUTCDate(lastWeekMonday.getUTCDate() + 7);
    seasonEnd.setUTCMilliseconds(seasonEnd.getUTCMilliseconds() - 1);
    return seasonEnd.toISOString();
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in.' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const periodId = body.period_id || getCurrentSeasonId();

        // Look up the seasonal pool to compute current Champions Pool size
        const pools = await base44.asServiceRole.entities.TokenPool.filter({ period_id: periodId, period_type: 'seasonal' });
        const totalSpent = pools.length > 0 ? (pools[0].total_spent || 0) : 0;
        const championsPool = Math.floor(totalSpent * CHAMPIONS_POOL_PCT);

        // Aggregate squad performance for the season (resolved + in-progress wars both count for standings)
        const weekIds = getWeekIdsForSeason(periodId);
        const allWars = [];
        for (const wid of weekIds) {
            const wars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: wid });
            allWars.push(...wars);
        }

        const bySquad = new Map();
        const ensure = (id, name, tag, icon) => {
            if (!id) return null;
            if (!bySquad.has(id)) {
                bySquad.set(id, {
                    squad_id: id, squad_name: name || '', squad_tag: tag || '', squad_icon: icon || '🛡️',
                    wins: 0, losses: 0, ties: 0, byes: 0,
                    total_kills: 0, wars_fought: 0,
                });
            }
            return bySquad.get(id);
        };

        for (const war of allWars) {
            const a = ensure(war.squad_a_id, war.squad_a_name, war.squad_a_tag, war.squad_a_icon);
            const b = war.squad_b_id ? ensure(war.squad_b_id, war.squad_b_name, war.squad_b_tag, war.squad_b_icon) : null;
            if (a) { a.wars_fought++; a.total_kills += Number(war.kills_a || 0); }
            if (b) { b.wars_fought++; b.total_kills += Number(war.kills_b || 0); }
            if (!war.is_resolved) continue; // only resolved wars award points
            if (war.result_kind === 'bye' && a) a.byes++;
            else if (war.result_kind === 'tie') { if (a) a.ties++; if (b) b.ties++; }
            else if (war.result_kind === 'win_a') { if (a) a.wins++; if (b) b.losses++; }
            else if (war.result_kind === 'win_b') { if (b) b.wins++; if (a) a.losses++; }
        }

        const rows = [];
        for (const sq of bySquad.values()) {
            const points = sq.wins * 3 + sq.ties * 1 + sq.byes * 1;
            // Look up current member count for per-member projections
            let memberCount = 0;
            try {
                const fresh = await base44.asServiceRole.entities.Squad.get(sq.squad_id);
                if (fresh) memberCount = fresh.member_count || 0;
            } catch {}
            rows.push({
                ...sq,
                ranking_points: points,
                member_count: memberCount,
                eligible: sq.wars_fought >= MIN_WARS_FOUGHT && memberCount >= MIN_SQUAD_MEMBERS,
            });
        }

        rows.sort((a, b) =>
            b.ranking_points - a.ranking_points ||
            b.total_kills - a.total_kills ||
            b.wars_fought - a.wars_fought
        );

        // Project payouts for the current top 3 (estimate — actual final payout uses snapshot at distribution time)
        const eligible = rows.filter(r => r.eligible);
        const numWinners = Math.min(3, eligible.length);
        const shares = numWinners === 1 ? [1.0]
            : numWinners === 2 ? [0.65, 0.35]
            : numWinners === 3 ? TOP_3_SHARES
            : [];

        const top10 = rows.slice(0, 10).map((r, i) => {
            const isProjectedWinner = r.eligible && i < numWinners;
            const projectedShare = isProjectedWinner
                ? Math.floor(championsPool * shares[i])
                : 0;
            const projectedPerMember = isProjectedWinner && r.member_count > 0
                ? Math.floor(projectedShare / r.member_count)
                : 0;
            return {
                rank: i + 1,
                squad_id: r.squad_id,
                squad_name: r.squad_name,
                squad_tag: r.squad_tag,
                squad_icon: r.squad_icon,
                ranking_points: r.ranking_points,
                wins: r.wins, losses: r.losses, ties: r.ties, byes: r.byes,
                total_kills: r.total_kills,
                wars_fought: r.wars_fought,
                member_count: r.member_count,
                eligible: r.eligible,
                projected_squad_share_omenx: projectedShare,
                projected_per_member_omenx: projectedPerMember,
            };
        });

        return Response.json({
            success: true,
            period_id: periodId,
            pool_total_spent: totalSpent,
            champions_pool_omenx: championsPool,
            min_wars_for_eligibility: MIN_WARS_FOUGHT,
            min_squad_members: MIN_SQUAD_MEMBERS,
            season_end_iso: getSeasonEndIso(periodId),
            standings: top10,
        });
    } catch (error) {
        console.error('[getSquadChampionsStandings]', error.message);
        return Response.json({ error: 'Could not load standings.' }, { status: 500 });
    }
});