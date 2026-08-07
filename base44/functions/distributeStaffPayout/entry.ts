import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Standalone weekly STAFF payout. Split out from manuallyDistributeRewards
// (2026-06-22) for the same reason as distributeKillPool: doing all three
// pools (players + staff + kills) in one HTTP call hit the gateway 504.
// Mirrors the staff block EXACTLY:
//   - Pulls all AdminWallet rows
//   - Pct = AdminWallet.payout_pct_override || AppConfig.staff_pct_per_wallet || 0.02
//   - Resume-safe via 'staff_weekly' PayoutLog
//   - Single grant-batch call (staff isn't ranked)

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';

// S7+ gate — must match the version in distributeKillPool / distributeRewards.
function isNewPoolPeriod(period_id) {
    const m = String(period_id || '').match(/^(\d{4})-W(\d{1,2})$/);
    if (!m) return false;
    const year = Number(m[1]);
    const seasonNum = Math.floor((Number(m[2]) - 1) / 4) + 1;
    if (year > 2026) return true;
    if (year < 2026) return false;
    return seasonNum >= 7;
}

// Mirror of the helper in distributeKillPool — see comment there.
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

        const isS7Plus = isNewPoolPeriod(period_id);
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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { period_id, adminKey } = body;

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

        if (!period_id) return Response.json({ error: 'Missing period_id' }, { status: 400 });

        const apiKey = Deno.env.get('OMENX_REWARDS_API_KEY');
        const apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiKey) return Response.json({ error: 'OMENX_REWARDS_API_KEY not configured' }, { status: 500 });

        const pools = await base44.asServiceRole.entities.TokenPool.filter({ period_id, period_type: 'weekly' });
        if (pools.length === 0) return Response.json({ error: 'No weekly pool found for this period' }, { status: 404 });
        const pool = pools[0];

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
        const staffPayments = adminWallets
            .filter(a => a.wallet_address)
            .map(a => ({
                walletAddress: a.wallet_address,
                amount: Math.floor(pool.total_spent * resolveStaffPct(a)),
                player_name: a.admin_name || a.wallet_address,
            }))
            .filter(p => p.amount >= 1);

        if (staffPayments.length === 0) {
            return Response.json({ success: true, paid: 0, skipped: 'no staff wallets' });
        }

        // Resume-safe
        const existingStaffLogs = await base44.asServiceRole.entities.PayoutLog.filter(
            { period_id, period_type: 'staff_weekly' }, '-created_date', 1000
        );
        const alreadyPaid = new Set(existingStaffLogs.map(l => (l.wallet_address || '').toLowerCase()));
        const remaining = staffPayments.filter(p => !alreadyPaid.has(p.walletAddress.toLowerCase()));

        if (remaining.length === 0) {
            return Response.json({ success: true, paid: 0, skipped_already_paid: alreadyPaid.size, skipped: 'all staff already paid' });
        }

        // Log-first double-pay guard (2026-07-06). Write pending PayoutLog rows
        // BEFORE the fetch — if the OmenX call settles on-chain but the response
        // is lost (504/network), the pending log stays so resume-retry skips
        // these wallets (safer to skip than to double-pay). See manuallyDistributeRewards.
        const pendingMarker = `pending-${period_id}-${Date.now()}-staff`;
        const createdLogIds = [];
        for (const p of remaining) {
            const row = await base44.asServiceRole.entities.PayoutLog.create({
                period_id, period_type: 'staff_weekly',
                wallet_address: p.walletAddress, player_name: p.player_name,
                amount: p.amount, rank: 0, tx_id: pendingMarker,
            });
            createdLogIds.push(row.id);
        }

        let response;
        try {
            response = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    payments: remaining.map(p => ({ walletAddress: p.walletAddress, amount: p.amount })),
                    gameId: GAME_ID, gameName: GAME_NAME,
                    note: `Cosmic Sloths weekly payout ${period_id} — Staff share`,
                }),
            });
        } catch (netErr) {
            // Ambiguous outcome — leave pending logs in place.
            throw new Error(`Staff batch network error (pending logs retained for safety): ${netErr?.message || netErr}`);
        }
        const batchResult = await response.json().catch(() => ({}));
        if (!response.ok) {
            // Only rollback pending logs on definitive 4xx rejection.
            if (response.status >= 400 && response.status < 500) {
                for (const id of createdLogIds) {
                    try { await base44.asServiceRole.entities.PayoutLog.delete(id); } catch {}
                }
            }
            throw new Error(`Staff batch failed — HTTP ${response.status}: ${JSON.stringify(batchResult)}`);
        }
        const txId = batchResult?.transactionId || batchResult?.txHash || '';

        // Patch pending logs with the real tx_id.
        for (const id of createdLogIds) {
            try { await base44.asServiceRole.entities.PayoutLog.update(id, { tx_id: txId }); } catch {}
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: `Manual weekly STAFF payout for ${period_id}`,
                details: { period_id, paid: remaining.length, totalOmenx: remaining.reduce((s, p) => s + p.amount, 0) },
            });
        } catch {}

        // Close the pool if players + staff (+ kills on S7+) all have logs now.
        const poolDistributed = await maybeMarkWeeklyPoolDistributed(base44.asServiceRole, period_id);

        return Response.json({
            success: true,
            period_id,
            paid: remaining.length,
            skipped_already_paid: alreadyPaid.size,
            totalOmenx: remaining.reduce((s, p) => s + p.amount, 0),
            tx_id: txId,
            pool_marked_distributed: poolDistributed,
        });
    } catch (error) {
        console.error('[distributeStaffPayout]', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
});