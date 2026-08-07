import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-shot remediation: the W19 weekly distribution paid the top ~64 players
// (with maxRank misconfigured), which diluted the top 45's share. This function
// recomputes the CORRECT top-45 amounts (using the same formula as distributeRewards.js)
// and sends a top-up for the shortfall to each of those 45 players. Players paid
// beyond rank 45 keep what they got (no clawback). Idempotent: skips wallets that
// already have a 'weekly_topup' PayoutLog for the same period.
//
// Body: { period_id: '2026-W19', dryRun?: boolean, adminKey?: string }
// Auth: emergency adminKey, OR Base44 session with 'owner' permission.

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';
const MAX_PAYOUT_PER_PLAYER_CAP = 10000;
const CHUNK_SIZE = 20;

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

function buildRankedPayments(scores, rewardPool, maxRank) {
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
    for (let i = 0; i < uniqueScores.length; i++) totalPct += getWeeklyRewardPercentage(i + 1);
    if (totalPct === 0 || uniqueScores.length === 0) return [];
    const multiplier = 1 / totalPct;
    const payments = [];
    for (let i = 0; i < uniqueScores.length; i++) {
        let amount = Math.floor(rewardPool * getWeeklyRewardPercentage(i + 1) * multiplier);
        amount = Math.min(amount, MAX_PAYOUT_PER_PLAYER_CAP);
        payments.push({
            walletAddress: uniqueScores[i].wallet_address,
            amount,
            rank: i + 1,
            player_name: uniqueScores[i].player_name,
        });
    }
    return payments;
}

async function grantBatchChunked(payments, apiBaseUrl, rewardsKeys, note) {
    if (payments.length === 0) return { txId: '', chunks: 0 };
    const chunks = [];
    for (let i = 0; i < payments.length; i += CHUNK_SIZE) chunks.push(payments.slice(i, i + CHUNK_SIZE));
    const txIds = [];
    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const startIdx = ci % rewardsKeys.length;
        let lastErr = null;
        let ok = false;
        for (let attempt = 0; attempt < rewardsKeys.length; attempt++) {
            const key = rewardsKeys[(startIdx + attempt) % rewardsKeys.length];
            const response = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({
                    payments: chunk.map(p => ({ walletAddress: p.walletAddress, amount: p.amount })),
                    gameId: GAME_ID, gameName: GAME_NAME, note: `${note} chunk ${ci + 1}/${chunks.length}`,
                }),
            });
            const batchResult = await response.json().catch(() => ({}));
            if (response.ok) {
                txIds.push(batchResult?.transactionId || batchResult?.txHash || '');
                ok = true;
                break;
            }
            lastErr = `HTTP ${response.status}: ${JSON.stringify(batchResult)}`;
            console.warn(`[topupWeeklyPayout] chunk ${ci + 1} key ${attempt + 1} failed:`, lastErr);
            if (response.status !== 429 && response.status < 500) break;
        }
        if (!ok) throw new Error(`Chunk ${ci + 1}/${chunks.length} failed: ${lastErr}`);
    }
    return { txId: txIds.join(','), chunks: chunks.length };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole;
        const body = await req.json();
        const { period_id, dryRun = true, adminKey } = body;

        if (!period_id) return Response.json({ error: 'period_id required' }, { status: 400 });

        // Auth
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await db.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'owner' permission required" }, { status: 403 });
            }
        }

        // Load pool
        const pools = await db.entities.TokenPool.filter({ period_id, period_type: 'weekly' });
        if (pools.length === 0) return Response.json({ error: 'No weekly pool for that period' }, { status: 404 });
        const pool = pools[0];

        // Recompute correct top-45 amounts
        const rewardPool = Math.floor(pool.total_spent * 0.20);
        // Cap at top 500 — way more than enough for top-45 dedup after wallet/userId collapse.
        const allScores = await db.entities.RunScore.filter({ week_id: period_id }, '-score', 500);
        const scores = allScores.filter(s => s.arena_id !== 'endless');
        const correctPayments = buildRankedPayments(scores, rewardPool, 45);

        // Load actual payouts that already went out (period_type: 'weekly')
        const existingLogs = await db.entities.PayoutLog.filter({ period_id, period_type: 'weekly' });
        const paidByWallet = new Map();
        for (const log of existingLogs) {
            const w = (log.wallet_address || '').toLowerCase();
            paidByWallet.set(w, (paidByWallet.get(w) || 0) + (log.amount || 0));
        }

        // Skip wallets that already received a top-up for this period (idempotency)
        const existingTopups = await db.entities.PayoutLog.filter({ period_id, period_type: 'weekly_topup' });
        const alreadyToppedUp = new Set(existingTopups.map(l => (l.wallet_address || '').toLowerCase()));

        // Build top-up list: correct_amount - actual_paid (only positive deltas)
        const topups = [];
        const breakdown = [];
        for (const p of correctPayments) {
            const wallet = (p.walletAddress || '').toLowerCase();
            const paid = paidByWallet.get(wallet) || 0;
            const shortfall = p.amount - paid;
            const skip = alreadyToppedUp.has(wallet);
            breakdown.push({
                rank: p.rank,
                wallet: p.walletAddress,
                player_name: p.player_name,
                correct_amount: p.amount,
                already_paid: paid,
                shortfall,
                will_topup: !skip && shortfall >= 1,
                skipped_reason: skip ? 'already_topped_up' : (shortfall < 1 ? 'no_shortfall' : null),
            });
            if (!skip && shortfall >= 1) {
                topups.push({
                    walletAddress: p.walletAddress,
                    amount: shortfall,
                    rank: p.rank,
                    player_name: p.player_name,
                    correct_amount: p.amount,
                    already_paid: paid,
                });
            }
        }

        const totalTopupAmount = topups.reduce((s, t) => s + t.amount, 0);

        if (dryRun) {
            return Response.json({
                dryRun: true,
                period_id,
                pool_total_spent: pool.total_spent,
                reward_pool: rewardPool,
                correct_top45_total: correctPayments.reduce((s, p) => s + p.amount, 0),
                topup_count: topups.length,
                topup_total: totalTopupAmount,
                topups,
                breakdown,
            });
        }

        // EXECUTE
        const apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        const rewardsKeys = [
            Deno.env.get('OMENX_REWARDS_API_KEY'),
            Deno.env.get('OMENX_REWARDS_API_KEY_2'),
            Deno.env.get('OMENX_REWARDS_API_KEY_3'),
            Deno.env.get('OMENX_REWARDS_API_KEY_4'),
        ].filter(Boolean);

        // Resumable: process chunks per invocation, log immediately after each
        // successful chunk so a timeout mid-run doesn't lose data. The caller
        // (or us) just re-runs the function until remaining_after_run === 0.
        //
        // Each chunk's note describes the rank tier of its payments so the
        // OmenX-side transaction history reflects which rank/band was paid.
        // We sort topups by rank ascending and chunk normally — chunks that
        // straddle a tier boundary get a "Ranks #X–Y" note covering the span.
        const maxChunks = Number(body.maxChunks) || 1;
        const sortedTopups = [...topups].sort((a, b) => a.rank - b.rank);
        const allChunks = [];
        for (let i = 0; i < sortedTopups.length; i += CHUNK_SIZE) allChunks.push(sortedTopups.slice(i, i + CHUNK_SIZE));
        const chunksToRun = allChunks.slice(0, maxChunks);

        const chunkNote = (chunk) => {
            const minRank = chunk[0].rank;
            const maxRank = chunk[chunk.length - 1].rank;
            const rankPart = minRank === maxRank ? `Rank #${minRank}` : `Ranks #${minRank}–${maxRank}`;
            return `Cosmic Sloths weekly top-up ${period_id} — ${rankPart}`;
        };

        let totalLogged = 0;
        let lastTxId = '';
        for (let ci = 0; ci < chunksToRun.length; ci++) {
            const chunk = chunksToRun[ci];
            const { txId } = await grantBatchChunked(chunk, apiBaseUrl, rewardsKeys, chunkNote(chunk));
            lastTxId = txId;
            // Log immediately so re-runs skip these wallets
            await Promise.all(chunk.map(t => db.entities.PayoutLog.create({
                period_id,
                period_type: 'weekly_topup',
                wallet_address: t.walletAddress,
                player_name: t.player_name || t.walletAddress,
                amount: t.amount,
                rank: t.rank,
                tx_id: txId,
            })));
            totalLogged += chunk.length;
        }
        const remaining = sortedTopups.length - totalLogged;

        try {
            await db.entities.AdminChangesLog.create({
                wallet_address: 'system',
                action_type: 'reward_adjustment',
                description: `Weekly top-up for ${period_id} — paid ${totalLogged} this run (${remaining} remaining) to fix top-45 dilution`,
                details: { period_id, paid_this_run: totalLogged, remaining_after_run: remaining, last_tx_id: lastTxId },
            });
        } catch {}

        return Response.json({
            success: true,
            period_id,
            paid_this_run: totalLogged,
            remaining_after_run: remaining,
            topup_total: totalTopupAmount,
            last_tx_id: lastTxId,
        });
    } catch (error) {
        console.error('[topupWeeklyPayout] ERROR:', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
});