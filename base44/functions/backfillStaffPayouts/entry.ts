import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-shot backfill: pays staff their owed weekly cuts for closed TokenPools
// where no staff_weekly PayoutLog rows exist yet. Fixes the silent bug where
// distributeRewards previously used an unauthenticated client that couldn't
// read AdminWallet (admin-only RLS), so staffPayments was always [].
//
// Body params:
//   adminKey?: string                — emergency master key (matches AdminDash secret)
//   periodIds?: string[]             — optional list of week_ids to backfill (default: all closed weekly pools without staff_weekly logs)
//   dryRun?: boolean                 — if true, computes & returns what WOULD be paid without sending OMENX
//   logsOnly?: boolean               — if true, SKIP the OmenX grant-batch and ONLY write the staff_weekly PayoutLog audit rows.
//                                      Use this when OmenX already paid the staff (e.g. distributeStaffPayout sent the tokens but
//                                      threw before writing logs) and you only need to reconcile the audit trail. tx_id is set to
//                                      'backfill-logs-only' so it's easy to spot in the log table.
//
// Auth: emergency adminKey OR Base44 session with 'owner' permission.

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';
const CHUNK_SIZE = 20;

function getCurrentWeekId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

async function grantBatchChunked(payments, apiBaseUrl, rewardsKeys, note) {
    if (payments.length === 0) return { txId: '', chunks: 0 };
    const chunks = [];
    for (let i = 0; i < payments.length; i += CHUNK_SIZE) {
        chunks.push(payments.slice(i, i + CHUNK_SIZE));
    }
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
                    payments: chunk.map(p => ({ walletAddress: p.walletAddress, amount: p.amount.toString() })),
                    gameId: GAME_ID, gameName: GAME_NAME, note: `${note} chunk ${ci + 1}/${chunks.length}`,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok) {
                txIds.push(result?.transactionId || result?.txHash || '');
                ok = true;
                break;
            }
            lastErr = `HTTP ${response.status}: ${JSON.stringify(result)}`;
            console.warn(`[backfillStaffPayouts] chunk ${ci + 1} key ${attempt + 1} failed:`, lastErr);
            if (response.status !== 429 && response.status < 500) break;
        }
        if (!ok) throw new Error(`Chunk ${ci + 1}/${chunks.length} failed: ${lastErr}`);
    }
    return { txId: txIds.join(','), chunks: chunks.length };
}

Deno.serve(async (req) => {
    try {
        const { adminKey, periodIds, dryRun = false, logsOnly = false } = await req.json();

        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole;

        // Auth: emergency master key OR Base44 session with 'owner' permission
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await db.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('owner')) {
                return Response.json({ error: "Forbidden — owner permission required for backfill" }, { status: 403 });
            }
        }

        // Staff payout pct (per wallet override or global default)
        let STAFF_PCT_PER_WALLET = 0.02;
        try {
            const cfg = await db.entities.AppConfig.filter({ key: 'staff_pct_per_wallet' });
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

        const adminWallets = await db.entities.AdminWallet.list();
        if (adminWallets.length === 0) {
            return Response.json({ error: 'No admin wallets configured' }, { status: 400 });
        }

        // Determine which weekly pools to backfill
        const currentWeekId = getCurrentWeekId();
        let pools;
        if (Array.isArray(periodIds) && periodIds.length > 0) {
            pools = [];
            for (const pid of periodIds) {
                const found = await db.entities.TokenPool.filter({ period_id: pid, period_type: 'weekly' });
                pools.push(...found);
            }
        } else {
            // All distributed weekly pools that aren't the current (open) week
            const all = await db.entities.TokenPool.filter({ period_type: 'weekly', distributed: true });
            pools = all.filter(p => p.period_id !== currentWeekId);
        }

        const apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        const rewardsKeys = [
            Deno.env.get('OMENX_REWARDS_API_KEY'),
            Deno.env.get('OMENX_REWARDS_API_KEY_2'),
            Deno.env.get('OMENX_REWARDS_API_KEY_3'),
            Deno.env.get('OMENX_REWARDS_API_KEY_4'),
        ].filter(Boolean);

        const results = [];

        for (const pool of pools) {
            // Skip if staff_weekly logs already exist for this period (idempotent)
            const existing = await db.entities.PayoutLog.filter({ period_id: pool.period_id, period_type: 'staff_weekly' });
            if (existing.length > 0) {
                results.push({ period_id: pool.period_id, skipped: 'staff already paid', existing: existing.length });
                continue;
            }

            if (!pool.total_spent || pool.total_spent <= 0) {
                results.push({ period_id: pool.period_id, skipped: 'zero spend' });
                continue;
            }

            const staffPayments = adminWallets
                .filter(a => a.wallet_address)
                .map(a => ({
                    walletAddress: a.wallet_address,
                    amount: Math.floor(pool.total_spent * resolveStaffPct(a)),
                    player_name: a.admin_name || a.wallet_address,
                }))
                .filter(p => p.amount >= 1);

            if (staffPayments.length === 0) {
                results.push({ period_id: pool.period_id, skipped: 'no eligible staff' });
                continue;
            }

            if (dryRun) {
                results.push({
                    period_id: pool.period_id,
                    pool_total: pool.total_spent,
                    staff_count: staffPayments.length,
                    total_owed: staffPayments.reduce((s, p) => s + p.amount, 0),
                    payments: staffPayments,
                    dryRun: true,
                });
                continue;
            }

            try {
                // logsOnly mode: OmenX already paid these wallets out-of-band
                // (e.g. distributeStaffPayout sent the tokens but crashed before
                // writing logs). Skip the grant-batch and just create the audit rows.
                let txId, chunks;
                if (logsOnly) {
                    txId = 'backfill-logs-only';
                    chunks = 0;
                } else {
                    const r = await grantBatchChunked(
                        staffPayments,
                        apiBaseUrl,
                        rewardsKeys,
                        `staff backfill ${pool.period_id}`
                    );
                    txId = r.txId;
                    chunks = r.chunks;
                }

                // Write staff_weekly PayoutLog rows in chunks to avoid 429 burst
                for (let i = 0; i < staffPayments.length; i += 10) {
                    const batch = staffPayments.slice(i, i + 10);
                    await Promise.all(batch.map(p => db.entities.PayoutLog.create({
                        period_id: pool.period_id,
                        period_type: 'staff_weekly',
                        wallet_address: p.walletAddress,
                        player_name: p.player_name,
                        amount: p.amount,
                        rank: 0,
                        tx_id: txId,
                    })));
                    if (i + 10 < staffPayments.length) await new Promise(r => setTimeout(r, 250));
                }

                results.push({
                    period_id: pool.period_id,
                    paid: staffPayments.length,
                    chunks,
                    total_paid: staffPayments.reduce((s, p) => s + p.amount, 0),
                    tx_id: txId,
                    logs_only: logsOnly,
                });
            } catch (err) {
                console.error(`[backfillStaffPayouts] ${pool.period_id} FAILED:`, err.message);
                results.push({ period_id: pool.period_id, error: err.message });
            }
        }

        return Response.json({ success: true, dryRun, count: pools.length, results });
    } catch (error) {
        console.error('[backfillStaffPayouts]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});