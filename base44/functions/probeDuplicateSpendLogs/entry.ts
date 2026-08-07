import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Read-only diagnostic. Hypothesis: TokenSpendLog has duplicate rows from
// purchaseSku retries — after a successful OmenX charge, if the function
// times out before responding, the client retries; OmenX idempotency returns
// the cached success but our TokenSpendLog.create runs again, writing a
// second row for the same on-chain charge.
//
// Detects dupes by clustering rows with the SAME (wallet_address, sku_id,
// amount) created within DUPE_WINDOW_MS of each other. Reports per-SKU
// duplicate counts and the inflated OMENX total.
//
// NO writes. Diagnostics only.

const PAGE_SIZE = 200;
const SLEEP_MS = 400;
const MAX_RETRIES = 5;
const MAX_PAGES = 600;          // ~120k rows safety cap
const TIME_BUDGET_MS = 90_000;
const DUPE_WINDOW_MS = 30_000;  // 30s window — wide enough to catch retries, narrow enough to avoid legit re-purchases

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function listWithRetry(entity, query, sort, limit, label) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await entity.filter(query, sort, limit);
        } catch (e) {
            const msg = e?.message || String(e);
            if (/429|rate/i.test(msg) && attempt < MAX_RETRIES - 1) {
                const delay = 800 * Math.pow(2, attempt) + Math.random() * 400;
                await sleep(delay);
                continue;
            }
            throw e;
        }
    }
    throw new Error(`${label}: exhausted retries`);
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
        const week_id = body.week_id || null;
        if (!week_id) return Response.json({ error: 'week_id required (e.g. "2026-W21")' }, { status: 400 });

        const startedAt = Date.now();
        const deadline = startedAt + TIME_BUDGET_MS;

        // Group by (wallet|sku|amount) → array of created_date timestamps
        const groups = new Map();
        let totalRows = 0;
        let totalAmount = 0;
        let pages = 0;
        let truncated = false;

        while (true) {
            if (Date.now() > deadline) { truncated = true; break; }
            if (pages >= MAX_PAGES) { truncated = true; break; }

            const batch = await listWithRetry(
                db.entities.TokenSpendLog,
                { week_id },
                '-created_date',
                PAGE_SIZE,
                `TokenSpendLog.list(page=${pages + 1})`
            );
            if (!batch || batch.length === 0) break;

            for (const log of batch) {
                if (log.excluded_from_pool) continue; // only count pool-affecting rows
                totalRows += 1;
                totalAmount += Number(log.amount) || 0;
                const key = `${(log.wallet_address || '').toLowerCase()}|${log.sku_id || ''}|${Number(log.amount) || 0}`;
                const ts = new Date(log.created_date).getTime();
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(ts);
            }

            pages += 1;
            if (batch.length < PAGE_SIZE) break;
            await sleep(SLEEP_MS);
        }

        // For each group, sort timestamps and count duplicates within DUPE_WINDOW_MS.
        // A "dupe" = a row that comes within window of a previous row in the same group.
        let totalDupeRows = 0;
        let totalDupeAmount = 0;
        const dupesBySku = {};
        const exampleClusters = [];

        for (const [key, timestamps] of groups.entries()) {
            if (timestamps.length < 2) continue;
            timestamps.sort((a, b) => a - b);
            const [wallet, sku, amountStr] = key.split('|');
            const amount = Number(amountStr) || 0;
            let dupesInGroup = 0;
            for (let i = 1; i < timestamps.length; i++) {
                if (timestamps[i] - timestamps[i - 1] <= DUPE_WINDOW_MS) {
                    dupesInGroup += 1;
                }
            }
            if (dupesInGroup > 0) {
                totalDupeRows += dupesInGroup;
                totalDupeAmount += dupesInGroup * amount;
                dupesBySku[sku] = dupesBySku[sku] || { count: 0, omenx: 0, walletsAffected: new Set() };
                dupesBySku[sku].count += dupesInGroup;
                dupesBySku[sku].omenx += dupesInGroup * amount;
                dupesBySku[sku].walletsAffected.add(wallet);
                if (exampleClusters.length < 10) {
                    exampleClusters.push({
                        wallet, sku, amount,
                        rows: timestamps.length,
                        dupes: dupesInGroup,
                        first: new Date(timestamps[0]).toISOString(),
                        last: new Date(timestamps[timestamps.length - 1]).toISOString(),
                    });
                }
            }
        }

        const skuBreakdown = Object.entries(dupesBySku)
            .map(([sku, d]) => ({
                sku,
                duplicate_rows: d.count,
                inflated_omenx: d.omenx,
                wallets_affected: d.walletsAffected.size,
            }))
            .sort((a, b) => b.inflated_omenx - a.inflated_omenx);

        return Response.json({
            success: true,
            week_id,
            generated_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            scanned: {
                pages,
                total_rows: totalRows,
                total_omenx_in_logs: totalAmount,
                truncated,
            },
            dupe_window_ms: DUPE_WINDOW_MS,
            duplicates: {
                duplicate_rows: totalDupeRows,
                inflated_omenx: totalDupeAmount,
                pct_of_logged_omenx: totalAmount > 0 ? Number(((totalDupeAmount / totalAmount) * 100).toFixed(2)) : null,
                pct_of_logged_rows: totalRows > 0 ? Number(((totalDupeRows / totalRows) * 100).toFixed(2)) : null,
                estimated_true_omenx: totalAmount - totalDupeAmount,
            },
            by_sku: skuBreakdown,
            example_clusters: exampleClusters,
        });
    } catch (error) {
        console.error('[probeDuplicateSpendLogs]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});