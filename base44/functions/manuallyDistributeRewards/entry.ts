import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.33';

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';
const MAX_PAYOUT_PER_PLAYER_CAP = 10000;

// S7 pool re-split gate (2026-06-04). Periods >= S7 use AppConfig-driven pool
// %s (15% weekly + 20% seasonal + 5% weekly kill pool); earlier periods keep
// the legacy 20/30 / no-kill split untouched. See docs/OMENX_POOL_RESPLIT_PLAN.md.
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

// Auth: Base44 session + 'distribute_rewards' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { period_id, period_type, adminKey } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('distribute_rewards') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'distribute_rewards' permission required" }, { status: 403 });
            }
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: `Manual ${period_type} payout for ${period_id}`,
                details: { period_id, period_type }
            });
        } catch {}

        if (!period_id || !period_type) {
            return Response.json({ error: 'Missing period_id or period_type' }, { status: 400 });
        }

        const apiKey = Deno.env.get('OMENX_REWARDS_API_KEY');
        const apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiKey) return Response.json({ error: 'OMENX_API_KEY not configured' }, { status: 500 });

        const sdk = new OmenXServerSDK({ apiKey, apiBaseUrl });

        const pools = await base44.asServiceRole.entities.TokenPool.filter({ period_id, period_type });
        if (pools.length === 0) return Response.json({ error: 'No pool found for this period' }, { status: 404 });

        const pool = pools[0];
        console.log(`[manuallyDistributeRewards] Distributing ${period_type} ${period_id}, pool total_spent=${pool.total_spent}`);

        // 2026-07-06: green "Distribute (Players)" button is players-only. Staff and
        // Kill pool have their own dedicated buttons (distributeStaffPayout /
        // distributeKillPool). Doing all three in one call was hitting gateway 504s
        // and confusing the resume-safety logic. Callers can still opt into the
        // legacy all-in-one behaviour by passing `includeAll: true` (e.g. cron).
        const includeStaff = body.includeAll === true;
        const includeKills = body.includeAll === true;

        let result;
        if (period_type === 'weekly') {
            result = await distributeWeekly(base44, sdk, pool, apiBaseUrl, apiKey, { includeStaff, includeKills });
        } else if (period_type === 'seasonal') {
            result = await distributeSeasonal(base44, sdk, pool, apiBaseUrl, apiKey);
        } else {
            return Response.json({ error: 'Invalid period_type' }, { status: 400 });
        }

        return Response.json({ success: true, ...result });
    } catch (error) {
        console.error('[manuallyDistributeRewards] ERROR:', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
});

// Mirrors the helper in distributeStaffPayout / distributeKillPool. Flips
// TokenPool.distributed=true only once players + staff + (S7+ kills) all have
// PayoutLog rows. Safe to call from any of the three split paths — whichever
// runs last closes the loop. Without this, "Players Only" would leave the
// pool marked pending until staff + kills also ran.
async function maybeMarkWeeklyPoolDistributed(db, period_id) {
    try {
        const pools = await db.entities.TokenPool.filter({ period_id, period_type: 'weekly' });
        const pool = pools[0];
        if (!pool) return false;
        if (pool.distributed) return true;

        const [playerLogs, staffLogs, killLogs] = await Promise.all([
            db.entities.PayoutLog.filter({ period_id, period_type: 'weekly' }, '-created_date', 1),
            db.entities.PayoutLog.filter({ period_id, period_type: 'staff_weekly' }, '-created_date', 1),
            db.entities.PayoutLog.filter({ period_id, period_type: 'weekly_kills' }, '-created_date', 1),
        ]);

        const isS7Plus = isNewPoolPeriod(period_id, 'weekly');
        const allDone = isS7Plus
            ? (playerLogs.length > 0 && staffLogs.length > 0 && killLogs.length > 0)
            : (playerLogs.length > 0 && staffLogs.length > 0);

        if (!allDone) return false;
        await db.entities.TokenPool.update(pool.id, { distributed: true });
        return true;
    } catch (err) {
        console.warn('[maybeMarkWeeklyPoolDistributed]', err?.message);
        return false;
    }
}

// Payout config loaded from AppConfig at distribution time. Defaults match
// distributeRewards.js. Admin edits via functions/leaderboardPayoutConfig.
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

async function loadPayoutConfig(base44) {
    try {
        const rows = await base44.asServiceRole.entities.AppConfig.filter({ key: 'leaderboard_payout_config' });
        return rows[0]?.value || DEFAULT_PAYOUT_CONFIG;
    } catch {
        return DEFAULT_PAYOUT_CONFIG;
    }
}

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
            payments.push({ walletAddress: uniqueScores[i].wallet_address, amount, rank: i + 1, player_name: uniqueScores[i].player_name });
        }
    }
    return payments;
}

// Rank-tier buckets — each tier becomes its own batch (and own OmenX TX),
// so the batch-level `note` describes the exact rank or rank band being paid.
function rankTierLabel(rank) {
    if (rank === 1) return { key: 'r1',   label: 'Rank #1' };
    if (rank === 2) return { key: 'r2',   label: 'Rank #2' };
    if (rank === 3) return { key: 'r3',   label: 'Rank #3' };
    if (rank >= 4  && rank <= 10) return { key: 'r4-10',  label: 'Ranks #4–10' };
    if (rank >= 11 && rank <= 20) return { key: 'r11-20', label: 'Ranks #11–20' };
    if (rank >= 21 && rank <= 30) return { key: 'r21-30', label: 'Ranks #21–30' };
    if (rank >= 31 && rank <= 40) return { key: 'r31-40', label: 'Ranks #31–40' };
    if (rank >= 41 && rank <= 45) return { key: 'r41-45', label: 'Ranks #41–45' };
    return { key: 'other', label: `Rank #${rank}` };
}

// Group ranked payments into tier buckets and send each tier as its own
// grant-batch HTTP call so the OmenX-side note reflects the recipient's rank.
//
// IDEMPOTENCY / DOUBLE-PAY SAFETY (revised 2026-07-06):
//   Problem: the previous "log AFTER fetch success" flow lost the audit trail
//   when OmenX settled the payment on-chain but returned a 504/network error.
//   Wallets got paid, no PayoutLog written, resume-retry double-paid them.
//
//   Fix: write PayoutLog rows BEFORE the fetch (with tx_id='pending-…').
//     - Fetch succeeds  → update tx_id to real transaction hash.
//     - Fetch throws 5xx/network → LEAVE the pending log in place. On-chain
//       state is ambiguous; assume paid so retry skips (safer to under-pay
//       one wallet — admin can top up manually — than to double-pay).
//     - Fetch returns explicit 4xx (definitively rejected, not settled) →
//       DELETE the pending log so retry re-attempts.
//
//   Caller passes alreadyPaidWallets (set of already-logged wallets from ANY
//   status — 'pending-…' or real txId) so we skip them entirely.
async function postTieredBatches(base44, period_id, period_type, payments, apiBaseUrl, apiKey, baseNote, alreadyPaidWallets) {
    if (payments.length === 0) return { txId: '', tiersPaid: 0, tiersSkipped: 0 };
    const tiers = new Map();
    for (const p of payments) {
        if (alreadyPaidWallets && alreadyPaidWallets.has(p.walletAddress.toLowerCase())) continue;
        const { key, label } = rankTierLabel(p.rank);
        if (!tiers.has(key)) tiers.set(key, { label, payments: [] });
        tiers.get(key).payments.push(p);
    }
    const order = ['r1', 'r2', 'r3', 'r4-10', 'r11-20', 'r21-30', 'r31-40', 'r41-45', 'other'];
    const txIds = [];
    let tiersPaid = 0;
    for (const key of order) {
        const tier = tiers.get(key);
        if (!tier || tier.payments.length === 0) continue;
        // 1) Write pending PayoutLog rows FIRST — if fetch never returns cleanly,
        //    these stay in place and resume-retry skips them (avoids double-pay).
        const pendingMarker = `pending-${period_id}-${Date.now()}-${key}`;
        const createdLogIds = [];
        for (const p of tier.payments) {
            const row = await base44.asServiceRole.entities.PayoutLog.create({
                period_id, period_type,
                wallet_address: p.walletAddress, player_name: p.player_name || p.walletAddress,
                amount: p.amount, rank: p.rank, tx_id: pendingMarker,
            });
            createdLogIds.push(row.id);
        }
        // 2) Fire the actual OmenX batch.
        let response;
        try {
            response = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    payments: tier.payments.map(p => ({ walletAddress: p.walletAddress, amount: p.amount })),
                    gameId: GAME_ID, gameName: GAME_NAME, note: `${baseNote} — ${tier.label}`,
                }),
            });
        } catch (netErr) {
            // Network error / gateway timeout — outcome ambiguous. LEAVE pending
            // logs in place so a resume skips these wallets. Admin can inspect
            // the 'pending-…' tx_ids in PayoutLog and top-up manually if needed.
            throw new Error(`Tier ${tier.label} network error (pending logs retained for safety): ${netErr?.message || netErr}`);
        }
        const batchResult = await response.json().catch(() => ({}));
        if (!response.ok) {
            // 4xx = definitive rejection (not settled on-chain) → safe to delete
            //       pending logs so retry re-attempts.
            // 5xx = ambiguous → keep pending logs (safer to skip on retry).
            if (response.status >= 400 && response.status < 500) {
                for (const id of createdLogIds) {
                    try { await base44.asServiceRole.entities.PayoutLog.delete(id); } catch {}
                }
            }
            throw new Error(`Tier ${tier.label} failed — HTTP ${response.status}: ${JSON.stringify(batchResult)}`);
        }
        // 3) Success — patch tx_id from 'pending-…' to the real transaction hash.
        const txId = batchResult?.transactionId || batchResult?.txHash || '';
        if (txId) txIds.push(txId);
        for (const id of createdLogIds) {
            try { await base44.asServiceRole.entities.PayoutLog.update(id, { tx_id: txId }); } catch {}
        }
        tiersPaid++;
    }
    return { txId: txIds.join(','), tiersPaid, tiersSkipped: 0 };
}

async function distributeWeekly(base44, sdk, pool, apiBaseUrl, apiKey, opts = { includeStaff: true, includeKills: true }) {
    // S7 gate — periods >= S7 use config-driven pool % (15%); earlier use 20%.
    const useNewPools = isNewPoolPeriod(pool.period_id, 'weekly');
    const cfg = await loadPayoutConfig(base44);
    const weeklyPoolPct = useNewPools
        ? (Number.isFinite(Number(cfg.weekly_pool_pct)) ? Number(cfg.weekly_pool_pct) : 0.15)
        : 0.20;
    const rewardPool = Math.floor(pool.total_spent * weeklyPoolPct);
    const allScores = await base44.asServiceRole.entities.RunScore.filter({ week_id: pool.period_id }, '-score', 1000);
    const scores = allScores.filter(s => s.arena_id !== 'endless');
    const payments = buildRankedPayments(scores, rewardPool, makeTierLookup(cfg.weekly_tiers), cfg.top_n);

    // RESUME-SAFE: if a previous attempt partially paid this period, skip wallets
    // that already have a PayoutLog row so we don't double-pay. Three buckets:
    // weekly (score), staff_weekly, and weekly_kills (S7+ only).
    const [existingLogs, existingStaffLogs, existingKillLogs] = await Promise.all([
        base44.asServiceRole.entities.PayoutLog.filter({ period_id: pool.period_id, period_type: 'weekly' }, '-created_date', 1000),
        base44.asServiceRole.entities.PayoutLog.filter({ period_id: pool.period_id, period_type: 'staff_weekly' }, '-created_date', 1000),
        base44.asServiceRole.entities.PayoutLog.filter({ period_id: pool.period_id, period_type: 'weekly_kills' }, '-created_date', 1000),
    ]);
    const alreadyPaidWallets = new Set(existingLogs.map(l => (l.wallet_address || '').toLowerCase()));
    const alreadyPaidStaff = new Set(existingStaffLogs.map(l => (l.wallet_address || '').toLowerCase()));
    const alreadyPaidKills = new Set(existingKillLogs.map(l => (l.wallet_address || '').toLowerCase()));

    // Staff payments — mirrors distributeRewards. Global default via AppConfig
    // (staff_pct_per_wallet), with per-wallet AdminWallet.payout_pct_override taking priority.
    const adminWallets = await base44.asServiceRole.entities.AdminWallet.list();
    let STAFF_PCT_PER_WALLET = 0.02;
    try {
        const cfg = await base44.asServiceRole.entities.AppConfig.filter({ key: 'staff_pct_per_wallet' });
        const v = Number(cfg[0]?.value?.pct);
        if (isFinite(v) && v >= 0 && v <= 0.10) STAFF_PCT_PER_WALLET = v;
    } catch {}
    const resolveStaffPct = (a) => {
        const o = a.payout_pct_override;
        if (o !== null && o !== undefined && isFinite(Number(o)) && Number(o) >= 0 && Number(o) <= 0.10) {
            return Number(o);
        }
        return STAFF_PCT_PER_WALLET;
    };
    const staffPayments = adminWallets
        .filter(a => a.wallet_address)
        .map(a => ({ walletAddress: a.wallet_address, amount: Math.floor(pool.total_spent * resolveStaffPct(a)), player_name: a.admin_name || a.wallet_address, isStaff: true }))
        .filter(p => p.amount >= 1);

    // S7+ weekly kill leaderboard pool — built here so the early-return below
    // also accounts for empty kill pools (rare but possible if no one ran sectors).
    // MUST mirror previewPayouts + distributeRewards: merge WeeklyKillSnapshot
    // (frozen at week rollover) with the live PlayerSave counter. Snapshot wins
    // per wallet — it's the authoritative final total for anyone who already
    // played a run in the new week (their PlayerSave.weekly_sector_kills got
    // reset on that first new-week run). Without the snapshot, manual payout
    // silently drops those players even though preview shows them.
    let killPayments = [];
    if (useNewPools) {
        const killPoolPct = Number.isFinite(Number(cfg.kill_pool_pct)) ? Number(cfg.kill_pool_pct) : 0.05;
        const killRewardPool = Math.floor(pool.total_spent * killPoolPct);
        if (killRewardPool > 0) {
            const [snapshotRows, liveRows] = await Promise.all([
                base44.asServiceRole.entities.WeeklyKillSnapshot.filter(
                    { week_id: pool.period_id },
                    '-kills',
                    500
                ),
                base44.asServiceRole.entities.PlayerSave.filter(
                    { weekly_sector_kills_week: pool.period_id },
                    '-weekly_sector_kills',
                    500
                ),
            ]);
            const merged = new Map();
            for (const s of snapshotRows) {
                const w = (s.wallet_address || '').toLowerCase();
                if (!w || (s.kills || 0) <= 0) continue;
                merged.set(w, {
                    wallet_address: w,
                    player_name: s.player_name || w,
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
                    player_name: p.player_name || w,
                    score: Number(p.weekly_sector_kills) || 0,
                    user_id: null,
                });
            }
            const killCandidates = [...merged.values()].sort((a, b) => b.score - a.score);
            killPayments = buildRankedPayments(
                killCandidates,
                killRewardPool,
                makeTierLookup(cfg.weekly_kill_tiers || []),
                cfg.top_n
            );
        }
    }

    if (payments.length === 0 && staffPayments.length === 0 && killPayments.length === 0) {
        await base44.asServiceRole.entities.TokenPool.update(pool.id, { distributed: true });
        return { paid: 0, skipped: 'no eligible wallets' };
    }

    // Players: one batch per rank tier so OmenX TX history shows exact rank/band.
    // Log-first pattern (see postTieredBatches) — pending log written BEFORE the
    // fetch so ambiguous errors don't leave silently-paid wallets untracked.
    const playerBase = `Cosmic Sloths weekly payout ${pool.period_id}`;
    const { txId: playerTxId } = await postTieredBatches(base44, pool.period_id, 'weekly', payments, apiBaseUrl, apiKey, playerBase, alreadyPaidWallets);

    // Staff: single batch, log-first (same rationale). Gated by opts.includeStaff
    // — the green "Distribute (Players)" button skips this; use the "Staff Only"
    // button (distributeStaffPayout) instead.
    const remainingStaff = staffPayments.filter(p => !alreadyPaidStaff.has(p.walletAddress.toLowerCase()));
    let staffTxId = '';
    if (opts.includeStaff && remainingStaff.length > 0) {
        const pendingMarker = `pending-${pool.period_id}-${Date.now()}-staff`;
        const createdLogIds = [];
        for (const p of remainingStaff) {
            const row = await base44.asServiceRole.entities.PayoutLog.create({
                period_id: pool.period_id, period_type: 'staff_weekly',
                wallet_address: p.walletAddress, player_name: p.player_name,
                amount: p.amount, rank: 0, tx_id: pendingMarker,
            });
            createdLogIds.push(row.id);
        }
        let staffResponse;
        try {
            staffResponse = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    payments: remainingStaff.map(p => ({ walletAddress: p.walletAddress, amount: p.amount })),
                    gameId: GAME_ID, gameName: GAME_NAME, note: `${playerBase} — Staff share`,
                }),
            });
        } catch (netErr) {
            throw new Error(`Staff batch network error (pending logs retained for safety): ${netErr?.message || netErr}`);
        }
        const staffResult = await staffResponse.json().catch(() => ({}));
        if (!staffResponse.ok) {
            if (staffResponse.status >= 400 && staffResponse.status < 500) {
                for (const id of createdLogIds) {
                    try { await base44.asServiceRole.entities.PayoutLog.delete(id); } catch {}
                }
            }
            throw new Error(`Staff batch failed — HTTP ${staffResponse.status}: ${JSON.stringify(staffResult)}`);
        }
        staffTxId = staffResult?.transactionId || staffResult?.txHash || '';
        for (const id of createdLogIds) {
            try { await base44.asServiceRole.entities.PayoutLog.update(id, { tx_id: staffTxId }); } catch {}
        }
    }

    // S7+ kill leaderboard payout — same log-first pattern via postTieredBatches.
    // Gated by opts.includeKills — the green button skips this; use the "Kill
    // Pool Only" button (distributeKillPool) instead.
    let killTxId = '';
    if (opts.includeKills && killPayments.length > 0) {
        const killBase = `Cosmic Sloths weekly KILL payout ${pool.period_id}`;
        const r = await postTieredBatches(base44, pool.period_id, 'weekly_kills', killPayments, apiBaseUrl, apiKey, killBase, alreadyPaidKills);
        killTxId = r.txId;
    }
    const remainingKills = killPayments.filter(p => !alreadyPaidKills.has(p.walletAddress.toLowerCase()));

    // Only auto-flip `distributed: true` when the run covered every bucket
    // (legacy cron path with includeAll=true). For the split "Players Only"
    // button, defer to the other two split fns — whichever runs last closes
    // the pool via maybeMarkWeeklyPoolDistributed. Otherwise clicking Players
    // Only would mark the pool distributed while staff+kills are still owed.
    if (opts.includeStaff && opts.includeKills) {
        await base44.asServiceRole.entities.TokenPool.update(pool.id, { distributed: true });
    } else {
        await maybeMarkWeeklyPoolDistributed(base44.asServiceRole, pool.period_id);
    }
    return {
        paid: payments.length - alreadyPaidWallets.size,
        skipped_already_paid: alreadyPaidWallets.size,
        staff_paid: remainingStaff.length,
        staff_skipped_already_paid: staffPayments.length - remainingStaff.length,
        kill_paid: remainingKills.length,
        kill_skipped_already_paid: killPayments.length - remainingKills.length,
        totalOmenx: payments.filter(p => !alreadyPaidWallets.has(p.walletAddress.toLowerCase())).reduce((s, p) => s + p.amount, 0),
        staffOmenx: remainingStaff.reduce((s, p) => s + p.amount, 0),
        killOmenx: remainingKills.reduce((s, p) => s + p.amount, 0),
        kill_tx_id: killTxId,
    };
}

async function distributeSeasonal(base44, sdk, pool, apiBaseUrl, apiKey) {
    // Seasonal pool split: pre-S7 = 30% top players, S7+ = 20% (config-driven).
    // 10% Squad Wars Champions (separate fn) unchanged regardless of season.
    const useNewPools = isNewPoolPeriod(pool.period_id, 'seasonal');
    const cfg = await loadPayoutConfig(base44);
    const seasonalPoolPct = useNewPools
        ? (Number.isFinite(Number(cfg.seasonal_pool_pct)) ? Number(cfg.seasonal_pool_pct) : 0.20)
        : 0.30;
    const rewardPool = Math.floor(pool.total_spent * seasonalPoolPct);
    const allScores = await base44.asServiceRole.entities.RunScore.filter({ season_id: pool.period_id }, '-score', 1000);
    const scores = allScores.filter(s => s.arena_id !== 'endless');
    const payments = buildRankedPayments(scores, rewardPool, makeTierLookup(cfg.seasonal_tiers), cfg.top_n);

    if (payments.length === 0) {
        await base44.asServiceRole.entities.TokenPool.update(pool.id, { distributed: true });
        return { paid: 0, skipped: 'no eligible wallets' };
    }

    // RESUME-SAFE: skip wallets that already have a PayoutLog for this period.
    const existingLogs = await base44.asServiceRole.entities.PayoutLog.filter({ period_id: pool.period_id, period_type: 'seasonal' }, '-created_date', 1000);
    const alreadyPaidWallets = new Set(existingLogs.map(l => (l.wallet_address || '').toLowerCase()));

    // Log-first pattern (see postTieredBatches) — pending log written BEFORE
    // the fetch so ambiguous errors don't leave silently-paid wallets untracked.
    const { txId, tiersPaid } = await postTieredBatches(
        base44, pool.period_id, 'seasonal',
        payments, apiBaseUrl, apiKey,
        `Cosmic Sloths seasonal payout ${pool.period_id}`,
        alreadyPaidWallets
    );

    await base44.asServiceRole.entities.TokenPool.update(pool.id, { distributed: true });
    const newlyPaid = payments.filter(p => !alreadyPaidWallets.has(p.walletAddress.toLowerCase()));
    return {
        paid: newlyPaid.length,
        skipped_already_paid: alreadyPaidWallets.size,
        tiersPaid,
        totalOmenx: newlyPaid.reduce((s, p) => s + p.amount, 0),
        payments: newlyPaid,
    };
}