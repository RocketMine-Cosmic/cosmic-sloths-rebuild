// One-shot admin tool to backfill PayoutLog rows for a partial-payout failure.
//
// Background: on 2026-05-18 the seasonal 2026-S5 payout hit a 502 mid-way.
// Tiers Rank #1, #2, #3, #4-10, #11-20 (= 20 wallets) succeeded on the OmenX
// side but NO PayoutLog rows were written (old code only wrote logs after ALL
// tiers succeeded). This function reconstructs those PayoutLog rows so the
// resume-aware retry logic in manuallyDistributeRewards can skip them.
//
// Usage from admin dashboard:
//   await base44.functions.invoke('backfillPartialPayout', {
//       period_id: '2026-S5',
//       period_type: 'seasonal',
//       paid_ranks: 20, // backfill top 20 ranks
//       tx_id: 'manual-backfill-2026-S5',
//       dry_run: true  // preview first
//   });
//
// Auth: requires 'distribute_rewards' permission (same as manuallyDistributeRewards).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MAX_PAYOUT_PER_PLAYER_CAP = 10000;

function getWeeklyRewardPercentage(rank) {
    if (rank === 1) return 0.10;
    if (rank === 2) return 0.08;
    if (rank === 3) return 0.06;
    if (rank >= 4 && rank <= 10) return 0.04;
    if (rank >= 11 && rank <= 20) return 0.03;
    if (rank >= 21 && rank <= 30) return 0.018;
    if (rank >= 31 && rank <= 45) return 0.012;
    return 0;
}

function getSeasonalRewardPercentage(rank) {
    if (rank === 1) return 0.10;
    if (rank === 2) return 0.075;
    if (rank === 3) return 0.06;
    if (rank >= 4 && rank <= 10) return 0.032;
    if (rank >= 11 && rank <= 20) return 0.022;
    if (rank >= 21 && rank <= 30) return 0.015;
    if (rank >= 31 && rank <= 40) return 0.009;
    if (rank >= 41 && rank <= 45) return 0.007;
    return 0;
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
        const adminRecords = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminRecords.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
        const perms = adminRecords[0].permissions || [];
        if (!perms.includes('distribute_rewards') && !perms.includes('owner')) {
            return Response.json({ error: "Forbidden — 'distribute_rewards' permission required" }, { status: 403 });
        }

        const body = await req.json();
        const { period_id, period_type, paid_ranks, tx_id, dry_run } = body;
        if (!period_id || !period_type) return Response.json({ error: 'period_id and period_type required' }, { status: 400 });
        const ranksToBackfill = Number(paid_ranks);
        if (!Number.isInteger(ranksToBackfill) || ranksToBackfill < 1 || ranksToBackfill > 45) {
            return Response.json({ error: 'paid_ranks must be an integer 1-45' }, { status: 400 });
        }

        // Compute exactly what manuallyDistributeRewards would have computed.
        const pools = await base44.asServiceRole.entities.TokenPool.filter({ period_id, period_type });
        if (pools.length === 0) return Response.json({ error: 'No pool found for this period' }, { status: 404 });
        const pool = pools[0];

        const filterKey = period_type === 'weekly' ? { week_id: period_id } : { season_id: period_id };
        const sortField = '-score';
        const allScores = await base44.asServiceRole.entities.RunScore.filter(filterKey, sortField, 1000);
        const scores = allScores.filter(s => s.arena_id !== 'endless');

        const rewardPool = period_type === 'weekly'
            ? Math.floor(pool.total_spent * 0.20)
            : Math.floor(pool.total_spent * 0.30);
        const pctFn = period_type === 'weekly' ? getWeeklyRewardPercentage : getSeasonalRewardPercentage;
        const allPayments = buildRankedPayments(scores, rewardPool, pctFn, 45);
        const paymentsToBackfill = allPayments.slice(0, ranksToBackfill);

        // Skip ranks that already have a PayoutLog row.
        const logType = period_type === 'weekly' ? 'weekly' : 'seasonal';
        const existing = await base44.asServiceRole.entities.PayoutLog.filter({ period_id, period_type: logType }, '-created_date', 1000);
        const existingWallets = new Set(existing.map(l => (l.wallet_address || '').toLowerCase()));

        const toCreate = paymentsToBackfill.filter(p => !existingWallets.has((p.wallet_address || '').toLowerCase()));
        const skipped = paymentsToBackfill.length - toCreate.length;

        if (dry_run) {
            return Response.json({
                dry_run: true,
                period_id, period_type,
                would_create: toCreate.length,
                already_exists: skipped,
                total_omenx: toCreate.reduce((s, p) => s + p.amount, 0),
                preview: toCreate.map(p => ({ rank: p.rank, player_name: p.player_name, wallet_address: p.wallet_address, amount: p.amount })),
            });
        }

        // Actually create the PayoutLog rows.
        const backfillTxId = tx_id || `manual-backfill-${period_id}`;
        for (const p of toCreate) {
            await base44.asServiceRole.entities.PayoutLog.create({
                period_id, period_type: logType,
                wallet_address: p.wallet_address,
                player_name: p.player_name || p.wallet_address,
                amount: p.amount, rank: p.rank, tx_id: backfillTxId,
            });
        }

        // Audit log
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: `Backfilled ${toCreate.length} PayoutLog rows for ${period_type} ${period_id} (ranks 1-${ranksToBackfill})`,
                details: { period_id, period_type, paid_ranks: ranksToBackfill, created: toCreate.length, skipped, tx_id: backfillTxId }
            });
        } catch {}

        return Response.json({
            success: true,
            created: toCreate.length,
            already_existed: skipped,
            total_omenx_backfilled: toCreate.reduce((s, p) => s + p.amount, 0),
        });
    } catch (error) {
        console.error('[backfillPartialPayout] ERROR:', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
});