import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-shot admin cleanup: finds existing RunScore rows for raid (`world_boss_arena`)
// and squad meteor (`quantum_meteor`) arenas — which historically leaked into
// weekly/seasonal/endless leaderboards — and soft-deletes them into
// DeletedRunScore so they can be restored if needed.
//
// New raid/meteor runs no longer create RunScore (saveScore was fixed 2026-05-13),
// so this only needs to clean up the historical backlog.
//
// Auth: Base44 admin session ('edit_players' or 'owner'), OR AdminDash master key.
// Call with { dryRun: true } first to preview, then { dryRun: false } to commit.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { dryRun = true, adminKey } = body;

        // Auth — same pattern as softDeleteRunScore.
        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('edit_players') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'edit_players' permission required" }, { status: 403 });
            }
        }

        // Paginate through every raid + meteor RunScore. Two separate filter()
        // calls because Base44's filter doesn't support `$in` on arena_id.
        const collect = async (arenaId) => {
            const out = [];
            let skip = 0;
            const pageSize = 100;
            while (true) {
                const page = await base44.asServiceRole.entities.RunScore.filter(
                    { arena_id: arenaId }, '-created_date', pageSize, skip
                );
                if (!page || page.length === 0) break;
                out.push(...page);
                if (page.length < pageSize) break;
                skip += pageSize;
                if (skip > 10000) break; // safety stop — should never trigger
            }
            return out;
        };

        const raidScores = await collect('world_boss_arena');
        const meteorScores = await collect('quantum_meteor');
        const all = [...raidScores, ...meteorScores];

        const breakdown = {
            raid: raidScores.length,
            meteor: meteorScores.length,
            total: all.length,
        };

        if (dryRun) {
            console.log(`[cleanupRaidMeteorScores] DRY RUN — found ${all.length} (raid=${raidScores.length}, meteor=${meteorScores.length})`);
            return Response.json({
                success: true,
                dryRun: true,
                breakdown,
                sample: all.slice(0, 10).map(r => ({
                    id: r.id, player: r.player_name, arena: r.arena_id, score: r.score, week: r.week_id, season: r.season_id,
                })),
            });
        }

        // Live run — archive then delete.
        let succeeded = 0;
        const failures = [];
        for (const original of all) {
            try {
                await base44.asServiceRole.entities.DeletedRunScore.create({
                    original_id: original.id,
                    user_id: original.user_id,
                    wallet_address: original.wallet_address,
                    player_name: original.player_name,
                    player_title: original.player_title,
                    pilot_icon: original.pilot_icon,
                    score: original.score,
                    time_survived: original.time_survived,
                    level: original.level,
                    kills: original.kills,
                    character_id: original.character_id,
                    arena_id: original.arena_id,
                    week_id: original.week_id,
                    season_id: original.season_id,
                    original_created_date: original.created_date,
                    deleted_by: callerWallet,
                    delete_reason: 'leaderboard_cleanup_raid_meteor',
                });
                await base44.asServiceRole.entities.RunScore.delete(original.id);
                succeeded++;
            } catch (e) {
                console.error('[cleanupRaidMeteorScores] failed for', original.id, ':', e.message);
                failures.push({ id: original.id, error: e.message });
            }
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: `Cleaned up ${succeeded} raid/meteor RunScores from leaderboards`,
                details: { breakdown, succeeded, failedCount: failures.length },
            });
        } catch (e) { console.error('[cleanupRaidMeteorScores] audit log failed:', e.message); }

        console.log(`[cleanupRaidMeteorScores] ${callerWallet} archived ${succeeded}/${all.length} (raid=${raidScores.length}, meteor=${meteorScores.length})`);
        return Response.json({
            success: true,
            dryRun: false,
            breakdown,
            succeeded,
            failed: failures.length,
            failures: failures.slice(0, 20),
        });
    } catch (error) {
        console.error('[cleanupRaidMeteorScores]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});