import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled wrapper: prunes each player's RunScore history down to the TOP 5
// per (week_id, mode), archiving the rest into DeletedRunScore (7-day window).
//
// Runs every 2h. Each invocation has a hard time budget (120s) and processes
// ONE batch then returns — the next tick picks up the next batch. This avoids
// the 180s function timeout that was silently killing the old "drain everything
// in a single call" implementation (it had never actually run successfully —
// total_runs=0 since 2026-05-06).
//
// Why top-5 and not top-1: payouts only look at the highest score, but we keep
// a small buffer for forensics / support tickets.

const KEEP_N = 5;
const BATCH_SIZE = 100;
const TIME_BUDGET_MS = 120_000; // exit cleanly well before the 180s function ceiling
const SCAN_PAGE_SIZE = 500;
const SCAN_HARD_CAP = 50_000;

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
            console.warn(`[scheduledCleanupTopScores] ${label} 429 — retry ${attempt + 1}/3 in ${Math.round(delay)}ms`);
            await sleep(delay);
        }
    }
    throw lastErr;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const db = base44.asServiceRole;
        const startedAt = Date.now();
        const deadline = startedAt + TIME_BUDGET_MS;
        const timeLeft = () => deadline - Date.now();

        // ---- 1. Scan: page through RunScore, stop early if we're running out of time.
        const allScores = [];
        let skip = 0;
        let scanAborted = false;
        while (skip < SCAN_HARD_CAP) {
            // Reserve 30s at the end for archive work — if the scan alone burns >90s,
            // bail out early with what we have so we still make progress this tick.
            if (timeLeft() < 30_000) {
                scanAborted = true;
                console.warn(`[scheduledCleanupTopScores] scan aborted at skip=${skip} — running out of time budget`);
                break;
            }
            const page = await with429Retry(
                () => db.entities.RunScore.filter({}, '-score', SCAN_PAGE_SIZE, skip),
                `RunScore.filter(skip=${skip})`
            );
            allScores.push(...page);
            if (page.length < SCAN_PAGE_SIZE) break;
            skip += SCAN_PAGE_SIZE;
        }

        // ---- 2. Bucket by (owner, week, mode) and collect everything past top-N.
        const buckets = new Map();
        for (const s of allScores) {
            const owner = s.user_id || s.wallet_address || 'unknown';
            const mode = s.arena_id === 'endless' ? 'endless' : 'normal';
            const key = `${owner}__${s.week_id}__${mode}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(s);
        }

        const toDelete = [];
        for (const group of buckets.values()) {
            if (group.length <= KEEP_N) continue;
            group.sort((a, b) => (b.score || 0) - (a.score || 0));
            toDelete.push(...group.slice(KEEP_N));
        }

        if (toDelete.length === 0) {
            console.log(`[scheduledCleanupTopScores] nothing to clean (scanned ${allScores.length})`);
            return Response.json({
                success: true, archived: 0, scanned: allScores.length,
                queued: 0, scanAborted, message: 'already clean',
                durationMs: Date.now() - startedAt,
            });
        }

        // ---- 3. Archive ONE batch (≤100 rows). Stop early if we hit the time budget.
        const slice = toDelete.slice(0, BATCH_SIZE);
        let succeeded = 0;
        let failed = 0;
        for (let j = 0; j < slice.length; j++) {
            // Bail out cleanly if we're running out of time — leave the remaining
            // rows for the next 2-hour tick.
            if (timeLeft() < 5_000) {
                console.warn(`[scheduledCleanupTopScores] batch aborted at row ${j}/${slice.length} — time budget exhausted`);
                break;
            }
            const s = slice[j];
            // Small pause every 5 rows to spread load on the SDK rate limiter.
            if (j > 0 && j % 5 === 0) await sleep(250);
            try {
                await with429Retry(
                    () => db.entities.DeletedRunScore.create({
                        original_id: s.id,
                        user_id: s.user_id,
                        wallet_address: s.wallet_address,
                        player_name: s.player_name,
                        player_title: s.player_title,
                        pilot_icon: s.pilot_icon,
                        score: s.score,
                        time_survived: s.time_survived,
                        level: s.level,
                        kills: s.kills,
                        character_id: s.character_id,
                        arena_id: s.arena_id,
                        week_id: s.week_id,
                        season_id: s.season_id,
                        original_created_date: s.created_date,
                        deleted_by: 'SCHEDULED',
                        delete_reason: `scheduled_cleanup keep_top_${KEEP_N}`,
                    }),
                    'DeletedRunScore.create'
                );
                await with429Retry(
                    () => db.entities.RunScore.delete(s.id),
                    'RunScore.delete'
                );
                succeeded++;
            } catch (e) {
                console.error('[scheduledCleanupTopScores] failed for', s.id, ':', e.message);
                failed++;
            }
        }

        // ---- 4. Single audit-log entry summarising this tick.
        const remaining = toDelete.length - succeeded - failed;
        try {
            await db.entities.AdminChangesLog.create({
                wallet_address: 'SCHEDULED',
                action_type: 'reward_adjustment',
                description: `Scheduled cleanup: archived ${succeeded} score(s)${remaining > 0 ? ` (${remaining} still queued for next tick)` : ''}.`,
                details: {
                    archived: succeeded,
                    failed,
                    scanned: allScores.length,
                    queued: toDelete.length,
                    remainingAfterTick: remaining,
                    scanAborted,
                    keepN: KEEP_N,
                    durationMs: Date.now() - startedAt,
                },
            });
        } catch (e) { console.error('[scheduledCleanupTopScores] audit log failed:', e.message); }

        console.log(`[scheduledCleanupTopScores] archived=${succeeded} failed=${failed} scanned=${allScores.length} queued=${toDelete.length} remaining=${remaining} in ${Date.now() - startedAt}ms`);

        return Response.json({
            success: true,
            archived: succeeded,
            failed,
            scanned: allScores.length,
            queued: toDelete.length,
            remainingAfterTick: remaining,
            scanAborted,
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        console.error('[scheduledCleanupTopScores]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});