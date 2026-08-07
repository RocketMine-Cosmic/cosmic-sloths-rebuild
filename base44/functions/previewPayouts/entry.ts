import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session → linked wallet → AdminWallet lookup.

// Payout config is loaded from AppConfig at request time (see distributeRewards
// for the same defaults + loader pattern).
const MAX_PAYOUT_PER_PLAYER_CAP = 10000;

// S7 pool re-split gate (2026-06-04). Periods >= S7 use AppConfig-driven pool
// %s (15% weekly + 20% seasonal + new 5% weekly kill pool). Earlier periods
// keep the legacy 20/30 / no kill pool split untouched. See docs/OMENX_POOL_RESPLIT_PLAN.md.
const NEW_POOL_SEASON = '2026-S7';
function getPeriodSeason(period_id, period_type) {
    if (period_type === 'seasonal') return period_id;
    const m = String(period_id || '').match(/^(\d{4})-W(\d{1,2})$/);
    if (!m) return null;
    const seasonNum = Math.floor((Number(m[2]) - 1) / 4) + 1;
    return m[1] + '-S' + seasonNum;
}
function isNewPoolPeriod(period_id, period_type) {
    const s = getPeriodSeason(period_id, period_type);
    if (!s) return false;
    // Numeric compare — string compare breaks at 2026-S10 vs 2026-S7 ('1' < '7').
    const m = s.match(/^(\d{4})-S(\d{1,2})$/);
    if (!m) return false;
    const year = Number(m[1]);
    const seas = Number(m[2]);
    if (year > 2026) return true;
    if (year < 2026) return false;
    return seas >= 7;
}

const DEFAULT_PAYOUT_CONFIG = {
    top_n: 20,
    weekly_pool_pct: 0.15,
    seasonal_pool_pct: 0.20,
    kill_pool_pct: 0.05,
    weekly_tiers: [
        { min: 1,  max: 1,  pct: 0.10 },
        { min: 2,  max: 2,  pct: 0.08 },
        { min: 3,  max: 3,  pct: 0.06 },
        { min: 4,  max: 10, pct: 0.04 },
        { min: 11, max: 20, pct: 0.03 },
    ],
    seasonal_tiers: [
        { min: 1,  max: 1,  pct: 0.10 },
        { min: 2,  max: 2,  pct: 0.075 },
        { min: 3,  max: 3,  pct: 0.06 },
        { min: 4,  max: 10, pct: 0.032 },
        { min: 11, max: 20, pct: 0.022 },
    ],
    weekly_kill_tiers: [
        { min: 1,  max: 1,  pct: 0.15 },
        { min: 2,  max: 2,  pct: 0.10 },
        { min: 3,  max: 3,  pct: 0.08 },
        { min: 4,  max: 10, pct: 0.05 },
        { min: 11, max: 20, pct: 0.025 },
    ],
};

function makeTierLookup(tiers) {
    return (rank) => {
        const t = tiers.find(t => rank >= t.min && rank <= t.max);
        return t ? t.pct : 0;
    };
}

function buildRankedPayments(scores, rewardPool, getPercentageFn, maxRank) {
    const uniqueScores = [];
    const seenWallets = new Set();
    const seenUserIds = new Set();

    for (const score of scores) {
        if (uniqueScores.length >= maxRank) break;
        const wallet = score.wallet_address;
        const userId = score.user_id;
        if (!wallet) continue;
        if (seenWallets.has(wallet)) continue;
        if (userId && seenUserIds.has(userId)) continue;
        seenWallets.add(wallet);
        if (userId) seenUserIds.add(userId);
        uniqueScores.push(score);
    }

    let totalPct = 0;
    for (let i = 0; i < uniqueScores.length; i++) totalPct += getPercentageFn(i + 1);
    if (totalPct === 0 || uniqueScores.length === 0) return [];

    const multiplier = 1 / totalPct;
    const payments = [];
    for (let i = 0; i < uniqueScores.length; i++) {
        let amount = Math.floor(rewardPool * getPercentageFn(i + 1) * multiplier);
        amount = Math.min(amount, MAX_PAYOUT_PER_PLAYER_CAP);
        if (amount >= 1) {
            payments.push({
                rank: i + 1,
                wallet_address: uniqueScores[i].wallet_address,
                player_name: uniqueScores[i].player_name,
                score: uniqueScores[i].score,
                amount,
            });
        }
    }
    return payments;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { period_id, period_type } = await req.json();
        if (!period_id || !period_type) return Response.json({ error: 'period_id and period_type required' }, { status: 400 });

        const pools = await base44.asServiceRole.entities.TokenPool.filter({ period_id, period_type });
        if (pools.length === 0) return Response.json({ error: 'No pool found for that period' }, { status: 404 });

        const pool = pools[0];
        let payments = [];
        let rewardPool = 0;
        let killPayments = [];
        let killRewardPool = 0;

        let staffPayments = [];

        // S7 gate — periods >= S7 use config-driven pool %s (15/20 + 5% kill pool);
        // earlier periods keep the legacy hardcoded split.
        const useNewPools = isNewPoolPeriod(period_id, period_type);

        // Load admin-configurable payout settings (top_n + per-rank tiers)
        let payoutCfg = DEFAULT_PAYOUT_CONFIG;
        try {
            const cfgRows = await base44.asServiceRole.entities.AppConfig.filter({ key: 'leaderboard_payout_config' });
            if (cfgRows[0]?.value) payoutCfg = cfgRows[0].value;
        } catch {}

        if (period_type === 'weekly') {
            const weeklyPoolPct = useNewPools
                ? (Number.isFinite(Number(payoutCfg.weekly_pool_pct)) ? Number(payoutCfg.weekly_pool_pct) : 0.15)
                : 0.20;
            rewardPool = Math.floor(pool.total_spent * weeklyPoolPct);
            const allScores = await base44.asServiceRole.entities.RunScore.filter({ week_id: period_id }, '-score', 1000);
            const scores = allScores.filter(s => s.arena_id !== 'endless');
            payments = buildRankedPayments(scores, rewardPool, makeTierLookup(payoutCfg.weekly_tiers), payoutCfg.top_n);

            // Mirror distributeRewards.js — only weekly payouts include staff cuts.
            // Staff % is configurable via AppConfig.staff_pct_per_wallet (default 2%),
            // with optional per-wallet override on AdminWallet.payout_pct_override.
            let STAFF_PCT_PER_WALLET = 0.02;
            try {
                const cfg = await base44.asServiceRole.entities.AppConfig.filter({ key: 'staff_pct_per_wallet' });
                const v = Number(cfg[0]?.value?.pct);
                if (isFinite(v) && v >= 0 && v <= 0.10) STAFF_PCT_PER_WALLET = v;
            } catch {}
            const adminWallets = await base44.asServiceRole.entities.AdminWallet.list();
            const resolveStaffPct = (a) => {
                const o = a.payout_pct_override;
                if (o !== null && o !== undefined && isFinite(Number(o)) && Number(o) >= 0 && Number(o) <= 0.10) {
                    return Number(o);
                }
                return STAFF_PCT_PER_WALLET;
            };
            staffPayments = adminWallets
                .filter(a => a.wallet_address)
                .map(a => ({
                    wallet_address: a.wallet_address,
                    amount: Math.floor(pool.total_spent * resolveStaffPct(a)),
                    player_name: a.admin_name || a.wallet_address,
                    pct: resolveStaffPct(a),
                }))
                .filter(p => p.amount >= 1);

            // S7+ only: weekly kill leaderboard pool. Uses WeeklyKillSnapshot
            // (frozen at week rollover) merged with the live PlayerSave counter
            // for anyone who hasn't rolled over yet. The snapshot is the source
            // of truth for any player who's already played a run in the new week
            // — their PlayerSave.weekly_sector_kills no longer holds the old
            // week's total (it gets reset on the first run of the new week).
            if (useNewPools) {
                const killPoolPct = Number.isFinite(Number(payoutCfg.kill_pool_pct)) ? Number(payoutCfg.kill_pool_pct) : 0.05;
                killRewardPool = Math.floor(pool.total_spent * killPoolPct);
                if (killRewardPool > 0) {
                    const [snapshotRows, liveRows] = await Promise.all([
                        base44.asServiceRole.entities.WeeklyKillSnapshot.filter(
                            { week_id: period_id },
                            '-kills',
                            500
                        ),
                        base44.asServiceRole.entities.PlayerSave.filter(
                            { weekly_sector_kills_week: period_id },
                            '-weekly_sector_kills',
                            500
                        ),
                    ]);

                    // Merge: snapshot wins per wallet (it's the frozen final total).
                    // Anyone still on the live counter (never rolled over yet) gets
                    // included too. Keyed by lowercase wallet to avoid case-mismatch dupes.
                    const merged = new Map();
                    for (const s of snapshotRows) {
                        const w = (s.wallet_address || '').toLowerCase();
                        if (!w || (s.kills || 0) <= 0) continue;
                        merged.set(w, {
                            wallet_address: w,
                            player_name: s.player_name || `Pilot_${w.slice(-8).toUpperCase()}`,
                            score: Number(s.kills) || 0,
                            user_id: null,
                        });
                    }
                    for (const p of liveRows) {
                        const w = (p.wallet_address || '').toLowerCase();
                        if (!w || (p.weekly_sector_kills || 0) <= 0) continue;
                        if (merged.has(w)) continue; // snapshot wins
                        merged.set(w, {
                            wallet_address: w,
                            player_name: p.player_name || `Pilot_${w.slice(-8).toUpperCase()}`,
                            score: Number(p.weekly_sector_kills) || 0,
                            user_id: null,
                        });
                    }

                    const killCandidates = [...merged.values()].sort((a, b) => b.score - a.score);
                    killPayments = buildRankedPayments(
                        killCandidates,
                        killRewardPool,
                        makeTierLookup(payoutCfg.weekly_kill_tiers || []),
                        payoutCfg.top_n
                    );
                }
            }
        } else if (period_type === 'seasonal') {
            // Pool split: pre-S7 = 30% top players, S7+ = 20% (config-driven).
            // 10% Squad Wars Champions (separate fn `distributeSquadChampions`) unchanged.
            const seasonalPoolPct = useNewPools
                ? (Number.isFinite(Number(payoutCfg.seasonal_pool_pct)) ? Number(payoutCfg.seasonal_pool_pct) : 0.20)
                : 0.30;
            rewardPool = Math.floor(pool.total_spent * seasonalPoolPct);
            const allScores = await base44.asServiceRole.entities.RunScore.filter({ season_id: period_id }, '-score', 1000);
            const scores = allScores.filter(s => s.arena_id !== 'endless');
            payments = buildRankedPayments(scores, rewardPool, makeTierLookup(payoutCfg.seasonal_tiers), payoutCfg.top_n);
        } else {
            return Response.json({ error: 'Invalid period_type' }, { status: 400 });
        }

        // RESUME-AWARE: look up existing PayoutLog rows for this period so the
        // preview can show exactly which wallets a retry would skip vs pay.
        // Mirrors the resume logic in manuallyDistributeRewards.
        const playerLogType = period_type === 'weekly' ? 'weekly' : 'seasonal';
        const existingPlayerLogs = await base44.asServiceRole.entities.PayoutLog.filter({ period_id, period_type: playerLogType }, '-created_date', 1000);
        const alreadyPaidPlayers = new Set(existingPlayerLogs.map(l => (l.wallet_address || '').toLowerCase()));

        let alreadyPaidStaff = new Set();
        let alreadyPaidKills = new Set();
        if (period_type === 'weekly') {
            const [existingStaffLogs, existingKillLogs] = await Promise.all([
                base44.asServiceRole.entities.PayoutLog.filter({ period_id, period_type: 'staff_weekly' }, '-created_date', 1000),
                base44.asServiceRole.entities.PayoutLog.filter({ period_id, period_type: 'weekly_kills' }, '-created_date', 1000),
            ]);
            alreadyPaidStaff = new Set(existingStaffLogs.map(l => (l.wallet_address || '').toLowerCase()));
            alreadyPaidKills = new Set(existingKillLogs.map(l => (l.wallet_address || '').toLowerCase()));
        }

        // Annotate each payment so the UI can show paid vs pending rows.
        const annotatedPayments = payments.map(p => ({
            ...p,
            already_paid: alreadyPaidPlayers.has((p.wallet_address || '').toLowerCase()),
        }));
        const annotatedStaff = staffPayments.map(p => ({
            ...p,
            already_paid: alreadyPaidStaff.has((p.wallet_address || '').toLowerCase()),
        }));
        const annotatedKills = killPayments.map(p => ({
            ...p,
            already_paid: alreadyPaidKills.has((p.wallet_address || '').toLowerCase()),
        }));

        const playerPayout = payments.reduce((s, p) => s + p.amount, 0);
        const staffPayout = staffPayments.reduce((s, p) => s + p.amount, 0);
        const killPayout = killPayments.reduce((s, p) => s + p.amount, 0);
        const pendingPlayerPayout = annotatedPayments.filter(p => !p.already_paid).reduce((s, p) => s + p.amount, 0);
        const pendingStaffPayout = annotatedStaff.filter(p => !p.already_paid).reduce((s, p) => s + p.amount, 0);
        const pendingKillPayout = annotatedKills.filter(p => !p.already_paid).reduce((s, p) => s + p.amount, 0);
        const paidPlayerCount = annotatedPayments.filter(p => p.already_paid).length;
        const paidStaffCount = annotatedStaff.filter(p => p.already_paid).length;
        const paidKillCount = annotatedKills.filter(p => p.already_paid).length;

        return Response.json({
            period_id, period_type,
            total_spent: pool.total_spent,
            reward_pool: rewardPool,
            kill_reward_pool: killRewardPool,
            distributed: pool.distributed,
            total_payout: playerPayout,
            staff_payout: staffPayout,
            kill_payout: killPayout,
            grand_total: playerPayout + staffPayout + killPayout,
            player_count: payments.length,
            staff_count: staffPayments.length,
            kill_count: killPayments.length,
            // New resume-aware fields
            paid_player_count: paidPlayerCount,
            paid_staff_count: paidStaffCount,
            paid_kill_count: paidKillCount,
            pending_player_count: payments.length - paidPlayerCount,
            pending_staff_count: staffPayments.length - paidStaffCount,
            pending_kill_count: killPayments.length - paidKillCount,
            pending_player_payout: pendingPlayerPayout,
            pending_staff_payout: pendingStaffPayout,
            pending_kill_payout: pendingKillPayout,
            pending_grand_total: pendingPlayerPayout + pendingStaffPayout + pendingKillPayout,
            payments: annotatedPayments,
            staff_payments: annotatedStaff,
            kill_payments: annotatedKills,
            uses_new_pools: useNewPools,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});