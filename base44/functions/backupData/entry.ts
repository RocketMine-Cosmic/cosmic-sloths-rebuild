import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: automated bypass, OR Base44 session + 'manage_backups' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { adminKey, backup_notes, is_automated } = body;

        let callerWallet = is_automated ? 'AUTOMATION' : 'EMERGENCY_KEY';
        if (!is_automated && !(adminKey && adminKey === Deno.env.get('AdminDash'))) {
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

        console.log('[backupData] Starting backup...');

        const [
            playerSaves, runScores, squads, squadMembers, squadMessages,
            tokenPools, tokenSpendLogs, payoutLogs,
            globalBosses, globalBossContributions, globalBossEvents,
            squadWars, squadChampionsPayoutLogs, squadSeasonRosters
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

        const snapshot_data = {
            playerSaves,
            runScores,
            squads,
            squadMembers,
            squadMessages,
            tokenPools,
            tokenSpendLogs,
            payoutLogs,
            globalBosses,
            globalBossContributions,
            globalBossEvents,
            squadWars,
            squadChampionsPayoutLogs,
            squadSeasonRosters,
            backup_timestamp: new Date().toISOString(),
        };

        const entity_counts = {
            PlayerSave: playerSaves.length,
            RunScore: runScores.length,
            Squad: squads.length,
            SquadMember: squadMembers.length,
            SquadMessage: squadMessages.length,
            TokenPool: tokenPools.length,
            TokenSpendLog: tokenSpendLogs.length,
            PayoutLog: payoutLogs.length,
            GlobalBoss: globalBosses.length,
            GlobalBossContribution: globalBossContributions.length,
            GlobalBossEvent: globalBossEvents.length,
            SquadWar: squadWars.length,
            SquadChampionsPayoutLog: squadChampionsPayoutLogs.length,
            SquadSeasonRoster: squadSeasonRosters.length,
        };

        const backup_name = `backup-${new Date().toISOString().split('T')[0]}-${Math.random().toString(36).substring(7)}`;

        const backup = await base44.asServiceRole.entities.DataBackup.create({
            backup_name,
            backup_type: is_automated ? 'automated' : 'manual',
            snapshot_data,
            entity_counts,
            restore_available: true,
            notes: backup_notes || '',
        });

        const totalRecords = Object.values(entity_counts).reduce((a, b) => a + b, 0);
        console.log(`[backupData] Backup complete: ${backup_name} with ${totalRecords} total records`);

        // Capture id before nulling the response, then drop EVERY large object we
        // accumulated during the backup phase. Without this, the isolate is still
        // holding ~13k PlayerSaves + ~13k RunScores in `playerSaves`/`runScores`
        // closure vars AND the freshly-created `backup` (which echoes back the
        // entire snapshot_data blob it just wrote). The prune step then loads
        // more rows on top — instant OOM.
        const newBackupId = backup.id;
        playerSaves.length = 0; runScores.length = 0; squads.length = 0;
        squadMembers.length = 0; squadMessages.length = 0; tokenPools.length = 0;
        tokenSpendLogs.length = 0; payoutLogs.length = 0; globalBosses.length = 0;
        globalBossContributions.length = 0; globalBossEvents.length = 0;
        squadWars.length = 0; squadChampionsPayoutLogs.length = 0;
        squadSeasonRosters.length = 0;
        for (const k of Object.keys(snapshot_data)) delete snapshot_data[k];
        for (const k of Object.keys(backup)) delete backup[k];

        // Retention: prune AUTOMATED backups older than 14 days. Manual backups are kept indefinitely.
        // CRITICAL: DataBackup.filter returns the full snapshot_data blob (~50-100MB
        // per row). Loading 20 of those at once = 1-2GB which OOMs even on a fresh
        // isolate. We page ONE row at a time (skip-based oldest-first), check the
        // date, delete or stop, then drop the reference. Memory stays bounded.
        let pruned = 0;
        if (is_automated) {
            try {
                const cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
                const MAX_ITERS = 500; // hard safety stop
                for (let i = 0; i < MAX_ITERS; i++) {
                    const batch = await base44.asServiceRole.entities.DataBackup.filter(
                        { backup_type: 'automated' }, 'created_date', 1
                    );
                    if (!batch.length) break;
                    const old = batch[0];
                    const oldId = old.id;
                    const oldDate = old.created_date;
                    // Free the snapshot_data blob immediately — we only needed id + date.
                    for (const k of Object.keys(old)) delete old[k];
                    batch.length = 0;
                    if (new Date(oldDate).getTime() >= cutoffMs) break;
                    if (oldId === newBackupId) break; // never prune the one we just made
                    try { await base44.asServiceRole.entities.DataBackup.delete(oldId); pruned++; } catch {}
                }
                if (pruned > 0) console.log(`[backupData] Pruned ${pruned} automated backup(s) older than 14 days`);
            } catch (e) {
                console.error('[backupData] Retention prune failed:', e.message);
            }
        }

        return Response.json({
            success: true,
            backup_id: backup.id,
            backup_name,
            entity_counts,
            pruned,
        });
    } catch (error) {
        console.error('[backupData] Error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});