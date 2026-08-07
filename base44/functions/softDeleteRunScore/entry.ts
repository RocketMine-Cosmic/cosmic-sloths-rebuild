import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Soft-delete one or more RunScore records by archiving them into DeletedRunScore
// (so they can be restored within 7 days), then deleting the originals.
//
// Auth: Base44 session + 'edit_players' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { scoreIds, reason, adminKey } = body;

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

        if (!Array.isArray(scoreIds) || scoreIds.length === 0) {
            return Response.json({ error: 'scoreIds (non-empty array) required' }, { status: 400 });
        }

        let succeeded = 0;
        const failures = [];

        for (const id of scoreIds) {
            try {
                const original = await base44.asServiceRole.entities.RunScore.get(id);
                if (!original) {
                    failures.push({ id, error: 'not found' });
                    continue;
                }

                // Archive into DeletedRunScore so it can be restored.
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
                    delete_reason: reason || 'manual',
                });

                await base44.asServiceRole.entities.RunScore.delete(id);
                succeeded++;
            } catch (e) {
                console.error('[softDeleteRunScore] failed for', id, ':', e.message);
                failures.push({ id, error: e.message });
            }
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: `Soft-deleted ${succeeded} run score(s)`,
                details: { scoreIds, reason: reason || 'manual', failures },
            });
        } catch (e) { console.error('[softDeleteRunScore] audit log failed:', e.message); }

        console.log(`[softDeleteRunScore] ${callerWallet} archived ${succeeded}/${scoreIds.length} scores`);
        return Response.json({ success: true, succeeded, failed: failures.length, failures });
    } catch (error) {
        console.error('[softDeleteRunScore]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});