import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled weekly cleanup — deletes TokenSpendLog rows older than KEEP_WEEKS
// ISO weeks. Pool totals on TokenPool are untouched (payouts already done).
//
// Runs every Monday 03:00 UTC, AFTER weekly payouts (which fire at the week
// rollover). Time-budgeted to 90s per tick; if more rows remain, the next
// week's tick picks up the rest. In steady state there should only be ~1
// week of expired rows to delete each tick, well under the budget.

const KEEP_WEEKS = 6;
const PAGE_SIZE = 200;
const DELETE_BATCH = 50;
const TIME_BUDGET_MS = 90_000;
const SLEEP_MS = 300;
const MAX_PAGES_PER_TICK = 200; // safety: 200 * 200 = 40k row scan ceiling per tick

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
            console.warn(`[scheduledPurgeOldSpendLogs] ${label} 429 — retry ${attempt + 1}/3 in ${Math.round(delay)}ms`);
            await sleep(delay);
        }
    }
    throw lastErr;
}

// Builds a Set of week_ids we want to keep: the current ISO week + the
// previous (KEEP_WEEKS - 1) weeks. Anything outside this set gets deleted.
function getKeepWeekIds() {
    const ids = new Set();
    const now = new Date();
    for (let i = 0; i < KEEP_WEEKS; i++) {
        const d = new Date(now);
        d.setUTCDate(now.getUTCDate() - i * 7);
        const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const isoYear = tmp.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
        ids.add(`${isoYear}-W${String(isoWeek).padStart(2, '0')}`);
    }
    return ids;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole;
        const startedAt = Date.now();
        const deadline = startedAt + TIME_BUDGET_MS;
        const timeLeft = () => deadline - Date.now();

        const keepWeeks = getKeepWeekIds();

        // Page back from the OLDEST rows (created_date ASC) — that's where the
        // bulk of expired data lives, so we delete the most rows per tick.
        const toDelete = [];
        let scanned = 0;
        let page = 1;
        while (toDelete.length < DELETE_BATCH * 4 && timeLeft() > 30_000 && page <= MAX_PAGES_PER_TICK) {
            const batch = await with429Retry(
                () => db.entities.TokenSpendLog.list('created_date', PAGE_SIZE, (page - 1) * PAGE_SIZE),
                `TokenSpendLog.list(page=${page})`
            );
            if (!batch || batch.length === 0) break;
            scanned += batch.length;
            for (const row of batch) {
                if (row.week_id && !keepWeeks.has(row.week_id)) toDelete.push(row.id);
            }
            if (batch.length < PAGE_SIZE) break;
            page++;
            await sleep(SLEEP_MS);
        }

        if (toDelete.length === 0) {
            console.log(`[scheduledPurgeOldSpendLogs] nothing to delete (scanned ${scanned})`);
            return Response.json({
                success: true, deleted: 0, scanned, keepWeeks: [...keepWeeks],
                durationMs: Date.now() - startedAt,
            });
        }

        const slice = toDelete.slice(0, DELETE_BATCH);
        let succeeded = 0;
        let failed = 0;
        for (let j = 0; j < slice.length; j++) {
            if (timeLeft() < 5_000) break;
            if (j > 0 && j % 5 === 0) await sleep(200);
            try {
                await with429Retry(() => db.entities.TokenSpendLog.delete(slice[j]), 'TokenSpendLog.delete');
                succeeded++;
            } catch (e) {
                console.error('[scheduledPurgeOldSpendLogs] delete failed for', slice[j], ':', e.message);
                failed++;
            }
        }

        try {
            await db.entities.AdminChangesLog.create({
                wallet_address: 'SCHEDULED',
                action_type: 'reward_adjustment',
                description: `Scheduled purge: deleted ${succeeded} TokenSpendLog row(s) older than ${KEEP_WEEKS} weeks.`,
                details: {
                    deleted: succeeded, failed, scanned,
                    keepWeeks: [...keepWeeks],
                    queuedRemaining: toDelete.length - succeeded - failed,
                    durationMs: Date.now() - startedAt,
                },
            });
        } catch {}

        console.log(`[scheduledPurgeOldSpendLogs] deleted=${succeeded} failed=${failed} scanned=${scanned} in ${Date.now() - startedAt}ms`);

        return Response.json({
            success: true,
            deleted: succeeded,
            failed,
            scanned,
            keepWeeks: [...keepWeeks],
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        console.error('[scheduledPurgeOldSpendLogs]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});