import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only probe: paginates TokenSpendLog to report:
//   - approximate total row count
//   - oldest entry date
//   - rows older than 30 / 90 / 180 days
//   - SKU breakdown (top 10) — so we can see how much is reroll/banish micro-spend
//
// Designed for LARGE tables — paginates with throttling + 429 retries and
// exits cleanly if the time budget runs out so a future bigger table doesn't
// blow up the function. If we hit the hard cap, we report it explicitly so
// you know the real number is higher.

const PAGE_SIZE = 500;
const HARD_CAP_PAGES = 200; // 100k rows ceiling — plenty of headroom, bails before timeout
const TIME_BUDGET_MS = 150_000; // exit clean ~30s before the 180s ceiling
const PACING_MS = 120;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function with429Retry(fn, label = 'sdk') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return await fn(); }
        catch (e) {
            const msg = String(e?.message || '').toLowerCase();
            const status = e?.status || e?.response?.status;
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            lastErr = e;
            if (!is429 || attempt === 3) throw e;
            const delay = 600 * Math.pow(2, attempt) + Math.random() * 400;
            console.warn(`[probeTokenSpendLogSize] ${label} 429 — retry ${attempt + 1}/3 in ${Math.round(delay)}ms`);
            await sleep(delay);
        }
    }
    throw lastErr;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const db = base44.asServiceRole;
        const startedAt = Date.now();
        const deadline = startedAt + TIME_BUDGET_MS;
        const timeLeft = () => deadline - Date.now();

        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;
        const cutoff30 = now - 30 * DAY;
        const cutoff90 = now - 90 * DAY;
        const cutoff180 = now - 180 * DAY;

        let total = 0;
        let older30 = 0;
        let older90 = 0;
        let older180 = 0;
        let oldestDate = null;
        let newestDate = null;
        const skuCounts = new Map();
        let hardCapped = false;
        let timeBudgetExhausted = false;

        for (let page = 1; page <= HARD_CAP_PAGES; page++) {
            if (timeLeft() < 8_000) {
                timeBudgetExhausted = true;
                console.warn(`[probeTokenSpendLogSize] time budget exhausted at page ${page}`);
                break;
            }
            const batch = await with429Retry(
                () => db.entities.TokenSpendLog.list('-created_date', PAGE_SIZE, page),
                `TokenSpendLog.list(page=${page})`
            );
            if (!batch || batch.length === 0) break;

            for (const row of batch) {
                total++;
                const ts = row.created_date ? new Date(row.created_date).getTime() : null;
                if (ts) {
                    if (ts < cutoff30) older30++;
                    if (ts < cutoff90) older90++;
                    if (ts < cutoff180) older180++;
                    if (!oldestDate || ts < oldestDate) oldestDate = ts;
                    if (!newestDate || ts > newestDate) newestDate = ts;
                }
                const sku = row.sku_id || 'unknown';
                skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
            }

            if (batch.length < PAGE_SIZE) break;
            if (page === HARD_CAP_PAGES) {
                hardCapped = true;
                console.warn(`[probeTokenSpendLogSize] hit hard cap of ${HARD_CAP_PAGES} pages — real total is higher`);
            }
            await sleep(PACING_MS);
        }

        const topSkus = Array.from(skuCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([sku, count]) => ({ sku, count, pct: total ? +(count / total * 100).toFixed(1) : 0 }));

        const result = {
            success: true,
            scanned: total,
            hardCapped,
            timeBudgetExhausted,
            note: hardCapped || timeBudgetExhausted
                ? 'Real total is HIGHER than scanned — increase HARD_CAP_PAGES or re-run.'
                : 'Full table scanned.',
            oldestEntry: oldestDate ? new Date(oldestDate).toISOString() : null,
            newestEntry: newestDate ? new Date(newestDate).toISOString() : null,
            ageBreakdown: {
                olderThan30Days: older30,
                olderThan90Days: older90,
                olderThan180Days: older180,
            },
            topSkus,
            durationMs: Date.now() - startedAt,
        };

        console.log('[probeTokenSpendLogSize]', JSON.stringify(result));
        return Response.json(result);
    } catch (error) {
        console.error('[probeTokenSpendLogSize]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});