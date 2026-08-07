import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-shot admin backfill: scan today's surviving RunScore rows, sum kills per
// wallet, and write authoritative `dailyKills` / `dailyKillsDate` onto each
// PlayerSave. Bridges the gap until each player's next run starts writing the
// counter naturally via saveScore. Safe to re-run — it's idempotent: each run
// overwrites the field with the freshly recomputed sum.
//
// RunScore cleanup cron has already soft-deleted some of today's smaller runs,
// so this will under-count slightly for heavy farmers. That's accepted — better
// than 0 (which is what the squad page is showing right now) and self-healing
// because the next saveScore call will start accumulating correctly on top of
// whatever number this backfill writes.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me || me.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const todayUtc = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const todayStartMs = Date.parse(`${todayUtc}T00:00:00.000Z`);

        // Pull a fat window of recent RunScore rows sorted desc. Walk until we
        // cross midnight UTC. 3000 rows is plenty — even the busiest day has
        // fewer than 1000 surviving runs after the cleanup cron.
        const recentRuns = await base44.asServiceRole.entities.RunScore.list('-created_date', 3000);

        const killsByWallet = new Map();
        for (const r of recentRuns) {
            const created = r.created_date ? Date.parse(r.created_date) : 0;
            if (!created || created < todayStartMs) break; // sorted desc — rest are older
            const w = (r.wallet_address || '').toLowerCase();
            if (!w) continue;
            killsByWallet.set(w, (killsByWallet.get(w) || 0) + (Number(r.kills) || 0));
        }

        if (killsByWallet.size === 0) {
            return Response.json({ success: true, message: 'No runs found today.', updated: 0 });
        }

        // Fetch all relevant PlayerSave rows in one batch.
        const wallets = [...killsByWallet.keys()];
        const saves = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: { $in: wallets } });

        let updated = 0;
        const results = [];
        for (const rec of saves) {
            const wallet = (rec.wallet_address || '').toLowerCase();
            const sd = typeof rec.save_data === 'string' ? JSON.parse(rec.save_data) : (rec.save_data || {});
            const kills = killsByWallet.get(wallet) || 0;
            if (kills === 0) continue;
            sd.dailyKills = kills;
            sd.dailyKillsDate = todayUtc;
            await base44.asServiceRole.entities.PlayerSave.update(rec.id, {
                save_data: sd,
                updated_at: Date.now(),
            });
            updated++;
            results.push({ wallet, player_name: rec.player_name || sd.player_name || '', kills });
        }

        results.sort((a, b) => b.kills - a.kills);
        return Response.json({
            success: true,
            todayUtc,
            walletsWithRunsToday: killsByWallet.size,
            playerSavesUpdated: updated,
            top: results.slice(0, 20),
        });
    } catch (error) {
        console.error('[backfillDailyKills]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});