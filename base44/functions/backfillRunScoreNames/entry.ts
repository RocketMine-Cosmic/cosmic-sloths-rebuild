import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Re-syncs RunScore.player_name (and related cached fields) from PlayerSave for
// every wallet whose RunScores carry a different/legacy name. Fixes leaderboards
// showing OAuth full names ("Jay S") for users who later renamed via Profile.
//
// Auth: admin only. Idempotent — safe to run repeatedly.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { dryRun } = await req.json().catch(() => ({}));

        // Pull all PlayerSaves to build wallet → authoritative-name map.
        const allSaves = await base44.asServiceRole.entities.PlayerSave.list('-updated_at', 5000);
        const nameByWallet = new Map();
        for (const ps of allSaves) {
            const wallet = (ps.wallet_address || '').toLowerCase();
            if (!wallet) continue;
            const sd = typeof ps.save_data === 'string' ? JSON.parse(ps.save_data) : (ps.save_data || {});
            const authoritative = (sd.player_name || ps.player_name || sd.pilotName || '').trim();
            if (authoritative) nameByWallet.set(wallet, authoritative);
        }

        // Scan recent RunScores (cap at 5000 — leaderboards only ever show recent runs).
        const allRuns = await base44.asServiceRole.entities.RunScore.list('-created_date', 5000);
        const mismatches = [];
        for (const r of allRuns) {
            const wallet = (r.wallet_address || '').toLowerCase();
            if (!wallet) continue;
            const correct = nameByWallet.get(wallet);
            if (!correct) continue;
            if ((r.player_name || '').trim() !== correct) {
                mismatches.push({ id: r.id, wallet, from: r.player_name, to: correct });
            }
        }

        if (dryRun) {
            return Response.json({
                success: true,
                dryRun: true,
                totalRuns: allRuns.length,
                mismatches: mismatches.length,
                preview: mismatches.slice(0, 20),
            });
        }

        let updated = 0;
        let failed = 0;
        // Update in parallel batches of 25 to keep response fast.
        const batchSize = 25;
        for (let i = 0; i < mismatches.length; i += batchSize) {
            const batch = mismatches.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(m => base44.asServiceRole.entities.RunScore.update(m.id, { player_name: m.to }))
            );
            updated += results.filter(r => r.status === 'fulfilled').length;
            failed += results.filter(r => r.status === 'rejected').length;
        }

        console.log(`[backfillRunScoreNames] caller=${callerWallet} mismatches=${mismatches.length} updated=${updated} failed=${failed}`);
        return Response.json({
            success: true,
            totalRuns: allRuns.length,
            mismatches: mismatches.length,
            updated,
            failed,
        });
    } catch (error) {
        console.error('[backfillRunScoreNames]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});