import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only one-shot backfill: sums sector-run kills from RunScore for the
// CURRENT ISO week, groups by wallet, and writes the totals to
// PlayerSave.weekly_sector_kills + weekly_sector_kills_week.
//
// Useful right after the feature launches so the leaderboard isn't empty.
// After this runs once, saveScore keeps the counter live going forward.
// Re-running it later in the same week will overwrite with a fresh sum
// (idempotent for the current week).
//
// Notes on filtering:
//  - Skips raid (world_boss_arena), meteor (quantum_meteor), endless arenas.
//  - run_type='sector' is preferred; legacy rows without run_type fall back
//    to the arena-id exclusion check above.
//  - RunScore that has been soft-deleted by cleanupKeepTopScoresPerPlayer will
//    NOT be included (we only count what's still in the live table). The
//    keep-top-N cron only runs at week-end so during the live week this is
//    accurate.

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

const EXCLUDED_ARENAS = new Set(['endless', 'world_boss_arena', 'quantum_meteor']);
const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const weekId = getCurrentWeekId();

        // Page through RunScore for the current week using created_date as cursor.
        const killsByWallet = new Map();
        let lastDate = null;
        let pages = 0;
        let rowsScanned = 0;

        while (pages < 100) { // hard ceiling (~100k rows) — safety
            const query = { week_id: weekId };
            if (lastDate) query.created_date = { $lt: lastDate };
            const batch = await base44.asServiceRole.entities.RunScore.filter(
                query,
                '-created_date',
                PAGE_SIZE
            );
            if (!batch || batch.length === 0) break;
            rowsScanned += batch.length;
            for (const r of batch) {
                const wallet = (r.wallet_address || '').toLowerCase();
                if (!wallet) continue;
                // Filter to sector runs only.
                if (r.run_type) {
                    if (r.run_type !== 'sector') continue;
                } else if (EXCLUDED_ARENAS.has(r.arena_id)) {
                    continue;
                }
                killsByWallet.set(wallet, (killsByWallet.get(wallet) || 0) + (Number(r.kills) || 0));
            }
            if (batch.length < PAGE_SIZE) break;
            lastDate = batch[batch.length - 1].created_date;
            pages++;
        }

        // Write totals back to PlayerSave (top-level fields).
        let updated = 0, failed = 0, missing = 0;
        for (const [wallet, kills] of killsByWallet.entries()) {
            try {
                const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: wallet });
                if (!records || records.length === 0) {
                    missing++;
                    continue;
                }
                await base44.asServiceRole.entities.PlayerSave.update(records[0].id, {
                    weekly_sector_kills: kills,
                    weekly_sector_kills_week: weekId,
                });
                updated++;
            } catch (err) {
                failed++;
                console.error(`[backfillWeeklySectorKills] ${wallet} failed:`, err.message);
            }
        }

        const summary = {
            success: true,
            week_id: weekId,
            run_score_rows_scanned: rowsScanned,
            unique_players: killsByWallet.size,
            player_saves_updated: updated,
            player_saves_missing: missing,
            failed,
        };
        console.log('[backfillWeeklySectorKills]', summary);
        return Response.json(summary);
    } catch (error) {
        console.error('[backfillWeeklySectorKills]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});