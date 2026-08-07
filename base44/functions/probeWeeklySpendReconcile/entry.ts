import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Read-only diagnostic: compares TokenPool.total_spent vs the SUMMED
// TokenSpendLog.amount (excluding excluded_from_pool) for the current week
// and the previous 3 weeks. Surfaces any drift that would cause
// reconcilePoolBeforeDistribution to silently rewrite the pool at payout time.
//
// NO writes. NO logic changes. Diagnostics only.

const PAGE_SIZE = 200;
const SLEEP_MS = 400;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function listWithRetry(entity, query, sort, limit, label) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await entity.filter(query, sort, limit);
        } catch (e) {
            const msg = e?.message || String(e);
            if (/429|rate/i.test(msg) && attempt < MAX_RETRIES - 1) {
                const delay = 800 * Math.pow(2, attempt) + Math.random() * 400;
                console.warn(`[probeWeeklySpendReconcile] ${label} 429 — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
                await sleep(delay);
                continue;
            }
            throw e;
        }
    }
    throw new Error(`${label}: exhausted retries`);
}

function getIsoWeekId(date) {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

function getRecentWeekIds(count) {
    const ids = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
        const d = new Date(now);
        d.setUTCDate(now.getUTCDate() - i * 7);
        ids.push(getIsoWeekId(d));
    }
    return ids;
}

const MAX_PAGES_PER_WEEK = 800; // 800 × 200 = 160k rows safety cap
const TIME_BUDGET_MS = 90_000;  // leave headroom under 120s isolate cap

async function sumLogsForWeek(db, week_id, deadline) {
    let total = 0;
    let totalExcluded = 0;
    let count = 0;
    let countExcluded = 0;
    let page = 1;
    let pages = 0;
    let truncated = false;
    const skuCounts = {};

    while (true) {
        if (Date.now() > deadline) { truncated = true; break; }
        if (pages >= MAX_PAGES_PER_WEEK) { truncated = true; break; }

        const batch = await listWithRetry(
            db.entities.TokenSpendLog,
            { week_id },
            '-created_date',
            PAGE_SIZE,
            `TokenSpendLog.list(week=${week_id}, page=${page})`
        );
        if (!batch || batch.length === 0) break;

        for (const log of batch) {
            const amt = Number(log.amount) || 0;
            const sku = log.sku_id || 'unknown';
            skuCounts[sku] = (skuCounts[sku] || 0) + 1;
            if (log.excluded_from_pool) {
                totalExcluded += amt;
                countExcluded += 1;
            } else {
                total += amt;
                count += 1;
            }
        }

        pages += 1;
        if (batch.length < PAGE_SIZE) break;
        page += 1;
        await sleep(SLEEP_MS);
    }

    // Top 5 SKUs by row count for context
    const topSkus = Object.entries(skuCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([sku, c]) => ({ sku, count: c }));

    return { total, totalExcluded, count, countExcluded, pages, topSkus, truncated };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const db = base44.asServiceRole;
        const admins = await db.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (admins.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const weeksToScan = Math.max(1, Math.min(4, Number(body.weeks) || 2));
        const weekIds = getRecentWeekIds(weeksToScan);
        const startedAt = Date.now();
        const deadline = startedAt + TIME_BUDGET_MS;
        const results = [];

        for (const week_id of weekIds) {
            if (Date.now() > deadline) {
                results.push({ week_id, skipped: 'time budget exhausted' });
                continue;
            }
            // Fetch pool
            const pools = await listWithRetry(
                db.entities.TokenPool,
                { period_id: week_id, period_type: 'weekly' },
                null,
                1,
                `TokenPool.filter(${week_id})`
            );
            const pool = pools[0] || null;
            const poolTotal = pool ? Number(pool.total_spent) || 0 : 0;
            const poolDistributed = pool ? !!pool.distributed : null;

            // Sum logs
            const logSum = await sumLogsForWeek(db, week_id, deadline);

            const delta = logSum.total - poolTotal; // positive: logs > pool, negative: pool > logs
            const driftPct = poolTotal > 0 ? (delta / poolTotal) * 100 : null;

            results.push({
                week_id,
                pool: {
                    exists: !!pool,
                    total_spent: poolTotal,
                    distributed: poolDistributed,
                },
                logs: {
                    sum_included: logSum.total,
                    sum_excluded: logSum.totalExcluded,
                    count_included: logSum.count,
                    count_excluded: logSum.countExcluded,
                    pages_scanned: logSum.pages,
                    truncated: logSum.truncated,
                    top_skus: logSum.topSkus,
                },
                delta_logs_minus_pool: delta,
                drift_pct: driftPct !== null ? Number(driftPct.toFixed(2)) : null,
                verdict: !pool ? 'NO_POOL'
                    : Math.abs(delta) < 0.01 ? 'MATCH'
                    : delta > 0 ? 'LOGS_HIGHER_THAN_POOL (pool dropped writes?)'
                    : 'POOL_HIGHER_THAN_LOGS (logs dropped writes? reconcile would LOWER pool)',
            });
        }

        return Response.json({
            success: true,
            generated_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            results,
        });
    } catch (error) {
        console.error('[probeWeeklySpendReconcile]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});