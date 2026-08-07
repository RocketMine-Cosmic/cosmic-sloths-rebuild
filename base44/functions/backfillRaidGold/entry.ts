import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-shot admin backfill for the claimBossReward bug:
// players who claimed milestones before 2026-05-02 didn't receive their
// gold in PlayerSave.gold (only locally, where syncSave then blocked it).
//
// Computes gold owed = sum(level * 250) for each unique milestone claimed
// (per wallet, per week_id) and credits it to PlayerSave.gold.
//
// Idempotent: writes a marker `raidGoldBackfill[week_id] = true` onto
// PlayerSave.save_data so re-running won't double-credit.
//
// Admin-only. Pass { dryRun: true } to preview without writing.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

        const { dryRun = false, weekId } = (await req.json().catch(() => ({})));
        if (!weekId || typeof weekId !== 'string') {
            return Response.json({ error: 'weekId required (e.g. "2026-W18")' }, { status: 400 });
        }

        // Fetch all contributions for the week.
        const contribs = await base44.asServiceRole.entities.GlobalBossContribution.filter({ week_id: weekId }, '-created_date', 1000);

        // Aggregate unique claimed milestones per wallet
        const byWallet = new Map(); // wallet -> Set<level>
        const namesByWallet = new Map();
        for (const c of contribs) {
            const wallet = (c.user_id || '').toLowerCase();
            if (!wallet) continue;
            const claimed = Array.isArray(c.claimed_milestones) ? c.claimed_milestones : [];
            if (claimed.length === 0) continue;
            if (!byWallet.has(wallet)) byWallet.set(wallet, new Set());
            const set = byWallet.get(wallet);
            for (const lvl of claimed) {
                const n = parseInt(lvl, 10);
                if (!isNaN(n) && n >= 1) set.add(n);
            }
            if (!namesByWallet.has(wallet)) namesByWallet.set(wallet, c.player_name || wallet);
        }

        const results = [];
        let totalCredited = 0;
        let creditedPlayers = 0;
        let skipped = 0;

        for (const [wallet, levelsSet] of byWallet.entries()) {
            const levels = Array.from(levelsSet).sort((a, b) => a - b);
            const goldOwed = levels.reduce((sum, lvl) => sum + (lvl * 250), 0);
            const playerName = namesByWallet.get(wallet);

            const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: wallet });
            if (records.length === 0) {
                results.push({ wallet, playerName, levels, goldOwed, status: 'no_save' });
                skipped++;
                continue;
            }

            const record = records[0];
            const saveData = typeof record.save_data === 'string' ? JSON.parse(record.save_data) : record.save_data;

            // Idempotency check
            const marker = saveData.raidGoldBackfill || {};
            if (marker[weekId]) {
                results.push({ wallet, playerName, levels, goldOwed, status: 'already_backfilled' });
                skipped++;
                continue;
            }

            const oldGold = saveData.gold || 0;
            const newGold = oldGold + goldOwed;

            if (!dryRun) {
                saveData.gold = newGold;
                saveData.raidGoldBackfill = { ...marker, [weekId]: { creditedAt: Date.now(), levels, gold: goldOwed } };
                saveData.updated_at = Date.now();
                await base44.asServiceRole.entities.PlayerSave.update(record.id, {
                    save_data: saveData,
                    updated_at: Date.now(),
                });
            }

            results.push({ wallet, playerName, levels, goldOwed, oldGold, newGold, status: dryRun ? 'dry_run' : 'credited' });
            totalCredited += goldOwed;
            creditedPlayers++;
        }

        return Response.json({
            success: true,
            dryRun,
            weekId,
            creditedPlayers,
            totalGoldCredited: totalCredited,
            skipped,
            results,
        });
    } catch (error) {
        console.error('[backfillRaidGold]', error.message, error.stack);
        return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
});