import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Manual cleanup for the admin UI — deletes one batch of TokenSpendLog rows
// from closed periods (anything not the current ISO week). Returns done=true
// when all old rows are gone, so the UI can loop on false / stop on true.
//
// Admin-only. Processes 50 rows per call with retry backoff.

const BATCH_SIZE = 50;
const PAGE_SIZE = 200;
const SLEEP_MS = 300;

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
            console.warn(`[cleanupOldSpendLogs] ${label} 429 — retry ${attempt + 1}/3 in ${Math.round(delay)}ms`);
            await sleep(delay);
        }
    }
    throw lastErr;
}

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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const db = base44.asServiceRole;
        const currentWeek = getCurrentWeekId();

        // Scan for old rows (not current week)
        const batch = await with429Retry(
            () => db.entities.TokenSpendLog.filter({}, 'created_date', PAGE_SIZE, 0),
            'TokenSpendLog.filter'
        );

        const toDelete = batch.filter(row => row.week_id && row.week_id !== currentWeek).slice(0, BATCH_SIZE);

        if (toDelete.length === 0) {
            return Response.json({
                deleted: 0,
                scanned: batch.length,
                currentWeek,
                done: true,
            });
        }

        let succeeded = 0;
        let failed = 0;
        for (let j = 0; j < toDelete.length; j++) {
            if (j > 0 && j % 5 === 0) await sleep(200);
            try {
                await with429Retry(() => db.entities.TokenSpendLog.delete(toDelete[j].id), 'delete');
                succeeded++;
            } catch (e) {
                console.error('[cleanupOldSpendLogs] delete failed:', e.message);
                failed++;
            }
        }

        return Response.json({
            deleted: succeeded,
            scanned: batch.length,
            currentWeek,
            done: false,
        });
    } catch (error) {
        console.error('[cleanupOldSpendLogs]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});