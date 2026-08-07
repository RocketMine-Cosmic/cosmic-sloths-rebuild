import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session + 'manage_backups' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { adminKey, backup_id, confirm_restore } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('manage_backups') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'manage_backups' permission required" }, { status: 403 });
            }
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: `Restored backup ${backup_id}`,
                details: { backup_id }
            });
        } catch {}

        if (!backup_id) {
            return Response.json({ error: 'backup_id required' }, { status: 400 });
        }

        if (!confirm_restore) {
            return Response.json({ error: 'Restore must be confirmed with confirm_restore: true' }, { status: 400 });
        }

        console.log('[restoreDataBackup] Fetching backup...');
        const backup = await base44.asServiceRole.entities.DataBackup.get(backup_id);
        if (!backup || !backup.restore_available) {
            return Response.json({ error: 'Backup not available' }, { status: 404 });
        }

        const { snapshot_data } = backup;

        console.log('[restoreDataBackup] Clearing existing data and restoring...');

        const [
            existingPlayerSaves, existingRunScores, existingSquads, existingSquadMembers, existingSquadMessages,
            existingTokenPools, existingTokenSpendLogs, existingPayoutLogs,
            existingGlobalBosses, existingGlobalBossContributions, existingGlobalBossEvents,
            existingSquadWars, existingSquadChampionsPayoutLogs, existingSquadSeasonRosters
        ] = await Promise.all([
            base44.asServiceRole.entities.PlayerSave.list('', 10000),
            base44.asServiceRole.entities.RunScore.list('', 10000),
            base44.asServiceRole.entities.Squad.list('', 10000),
            base44.asServiceRole.entities.SquadMember.list('', 10000),
            base44.asServiceRole.entities.SquadMessage.list('', 10000),
            base44.asServiceRole.entities.TokenPool.list('', 10000),
            base44.asServiceRole.entities.TokenSpendLog.list('', 10000),
            base44.asServiceRole.entities.PayoutLog.list('', 10000),
            base44.asServiceRole.entities.GlobalBoss.list('', 10000),
            base44.asServiceRole.entities.GlobalBossContribution.list('', 10000),
            base44.asServiceRole.entities.GlobalBossEvent.list('', 10000),
            base44.asServiceRole.entities.SquadWar.list('', 10000),
            base44.asServiceRole.entities.SquadChampionsPayoutLog.list('', 10000),
            base44.asServiceRole.entities.SquadSeasonRoster.list('', 10000),
        ]);

        await Promise.all([
            ...existingPlayerSaves.map(e => base44.asServiceRole.entities.PlayerSave.delete(e.id)),
            ...existingRunScores.map(e => base44.asServiceRole.entities.RunScore.delete(e.id)),
            ...existingSquads.map(e => base44.asServiceRole.entities.Squad.delete(e.id)),
            ...existingSquadMembers.map(e => base44.asServiceRole.entities.SquadMember.delete(e.id)),
            ...existingSquadMessages.map(e => base44.asServiceRole.entities.SquadMessage.delete(e.id)),
            ...existingTokenPools.map(e => base44.asServiceRole.entities.TokenPool.delete(e.id)),
            ...existingTokenSpendLogs.map(e => base44.asServiceRole.entities.TokenSpendLog.delete(e.id)),
            ...existingPayoutLogs.map(e => base44.asServiceRole.entities.PayoutLog.delete(e.id)),
            ...existingGlobalBosses.map(e => base44.asServiceRole.entities.GlobalBoss.delete(e.id)),
            ...existingGlobalBossContributions.map(e => base44.asServiceRole.entities.GlobalBossContribution.delete(e.id)),
            ...existingGlobalBossEvents.map(e => base44.asServiceRole.entities.GlobalBossEvent.delete(e.id)),
            ...existingSquadWars.map(e => base44.asServiceRole.entities.SquadWar.delete(e.id)),
            ...existingSquadChampionsPayoutLogs.map(e => base44.asServiceRole.entities.SquadChampionsPayoutLog.delete(e.id)),
            ...existingSquadSeasonRosters.map(e => base44.asServiceRole.entities.SquadSeasonRoster.delete(e.id)),
        ]);

        console.log('[restoreDataBackup] Restoring from snapshot...');

        const restoreTasks = [];
        const stripFields = (e) => {
            const { id, created_date, updated_date, created_by, ...data } = e;
            return data;
        };

        if (snapshot_data.playerSaves?.length > 0) {
            restoreTasks.push(...snapshot_data.playerSaves.map(e => base44.asServiceRole.entities.PlayerSave.create(stripFields(e))));
        }
        if (snapshot_data.runScores?.length > 0) {
            restoreTasks.push(...snapshot_data.runScores.map(e => base44.asServiceRole.entities.RunScore.create(stripFields(e))));
        }
        if (snapshot_data.squads?.length > 0) {
            restoreTasks.push(...snapshot_data.squads.map(e => base44.asServiceRole.entities.Squad.create(stripFields(e))));
        }
        if (snapshot_data.squadMembers?.length > 0) {
            restoreTasks.push(...snapshot_data.squadMembers.map(e => base44.asServiceRole.entities.SquadMember.create(stripFields(e))));
        }
        if (snapshot_data.tokenPools?.length > 0) {
            restoreTasks.push(...snapshot_data.tokenPools.map(e => base44.asServiceRole.entities.TokenPool.create(stripFields(e))));
        }
        if (snapshot_data.payoutLogs?.length > 0) {
            restoreTasks.push(...snapshot_data.payoutLogs.map(e => base44.asServiceRole.entities.PayoutLog.create(stripFields(e))));
        }
        if (snapshot_data.globalBosses?.length > 0) {
            restoreTasks.push(...snapshot_data.globalBosses.map(e => base44.asServiceRole.entities.GlobalBoss.create(stripFields(e))));
        }
        if (snapshot_data.squadMessages?.length > 0) {
            restoreTasks.push(...snapshot_data.squadMessages.map(e => base44.asServiceRole.entities.SquadMessage.create(stripFields(e))));
        }
        if (snapshot_data.tokenSpendLogs?.length > 0) {
            restoreTasks.push(...snapshot_data.tokenSpendLogs.map(e => base44.asServiceRole.entities.TokenSpendLog.create(stripFields(e))));
        }
        if (snapshot_data.globalBossContributions?.length > 0) {
            restoreTasks.push(...snapshot_data.globalBossContributions.map(e => base44.asServiceRole.entities.GlobalBossContribution.create(stripFields(e))));
        }
        if (snapshot_data.globalBossEvents?.length > 0) {
            restoreTasks.push(...snapshot_data.globalBossEvents.map(e => base44.asServiceRole.entities.GlobalBossEvent.create(stripFields(e))));
        }
        if (snapshot_data.squadWars?.length > 0) {
            restoreTasks.push(...snapshot_data.squadWars.map(e => base44.asServiceRole.entities.SquadWar.create(stripFields(e))));
        }
        if (snapshot_data.squadChampionsPayoutLogs?.length > 0) {
            restoreTasks.push(...snapshot_data.squadChampionsPayoutLogs.map(e => base44.asServiceRole.entities.SquadChampionsPayoutLog.create(stripFields(e))));
        }
        if (snapshot_data.squadSeasonRosters?.length > 0) {
            restoreTasks.push(...snapshot_data.squadSeasonRosters.map(e => base44.asServiceRole.entities.SquadSeasonRoster.create(stripFields(e))));
        }

        await Promise.all(restoreTasks);

        console.log(`[restoreDataBackup] Restore complete: ${restoreTasks.length} records restored`);

        return Response.json({
            success: true,
            backup_name: backup.backup_name,
            records_restored: restoreTasks.length,
        });
    } catch (error) {
        console.error('[restoreDataBackup] Error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});