import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session + 'wipe_data' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { adminKey, confirm } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('wipe_data') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'wipe_data' permission required" }, { status: 403 });
            }
        }

        if (confirm !== 'RESET_ALL_PLAYER_DATA') {
            return Response.json({ error: 'Must pass confirm: "RESET_ALL_PLAYER_DATA"' }, { status: 400 });
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: 'FULL DATA WIPE triggered',
                details: {}
            });
        } catch {}

        const results = {};
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // Sequential deletes with small delay to avoid 429 rate limits.
        const deleteAll = async (entityName) => {
            let deleted = 0;
            let batch;
            do {
                batch = await base44.asServiceRole.entities[entityName].filter({}, null, 50);
                if (batch.length === 0) break;
                for (const r of batch) {
                    try {
                        await base44.asServiceRole.entities[entityName].delete(r.id);
                        deleted++;
                    } catch (e) {
                        if (String(e.message || '').includes('Rate limit')) {
                            await sleep(1500);
                            try { await base44.asServiceRole.entities[entityName].delete(r.id); deleted++; } catch {}
                        }
                    }
                    await sleep(40);
                }
            } while (batch.length > 0);
            return deleted;
        };

        results.RunScore                  = await deleteAll('RunScore');
        results.PlayerSave                = await deleteAll('PlayerSave');
        results.TokenPool                 = await deleteAll('TokenPool');
        results.TokenSpendLog             = await deleteAll('TokenSpendLog');
        results.PayoutLog                 = await deleteAll('PayoutLog');
        results.Squad                     = await deleteAll('Squad');
        results.SquadMember               = await deleteAll('SquadMember');
        results.SquadMessage              = await deleteAll('SquadMessage');
        results.SquadWar                  = await deleteAll('SquadWar');
        results.SquadChampionsPayoutLog   = await deleteAll('SquadChampionsPayoutLog');
        results.SquadSeasonRoster         = await deleteAll('SquadSeasonRoster');
        results.GlobalBoss                = await deleteAll('GlobalBoss');
        results.GlobalBossContribution    = await deleteAll('GlobalBossContribution');
        results.GlobalBossEvent           = await deleteAll('GlobalBossEvent');

        // Bump the wipe epoch — every client checks this on launch via loadSave
        // and clears its local save + pending queue + cached profile fields when
        // it sees a newer epoch than its stored one. Without this marker, returning
        // players' stale localStorage caches re-poison the fresh database on first
        // sync (Texxy/Hugo recurring bug — endless runs "playing up after every reset").
        //
        // CRITICAL: this is the ONLY mechanism that protects clients post-reset, so
        // we retry up to 3 times AND verify the write landed before returning success.
        const epoch = Date.now();
        let epochWritten = false;
        let epochError = null;
        for (let attempt = 0; attempt < 3 && !epochWritten; attempt++) {
            if (attempt > 0) await sleep(1500);
            try {
                const existing = await base44.asServiceRole.entities.AppConfig.filter({ key: 'wipe_epoch' });
                if (existing.length > 0) {
                    await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
                        value: { epoch },
                        updated_by: callerWallet,
                        notes: `Bumped by resetAllPlayerData @ ${new Date(epoch).toISOString()}`,
                    });
                } else {
                    await base44.asServiceRole.entities.AppConfig.create({
                        key: 'wipe_epoch',
                        value: { epoch },
                        updated_by: callerWallet,
                        notes: `Initial wipe epoch — set by resetAllPlayerData @ ${new Date(epoch).toISOString()}`,
                    });
                }
                // Verify the write actually landed at the value we just sent.
                const verify = await base44.asServiceRole.entities.AppConfig.filter({ key: 'wipe_epoch' });
                if (verify.length > 0 && Number(verify[0].value?.epoch) === epoch) {
                    epochWritten = true;
                    console.log(`[resetAllPlayerData] ✅ Bumped wipe_epoch → ${epoch} (verified, attempt ${attempt + 1})`);
                } else {
                    epochError = `Verify mismatch: cloud=${verify[0]?.value?.epoch} wanted=${epoch}`;
                }
            } catch (err) {
                epochError = err.message;
                console.warn(`[resetAllPlayerData] wipe_epoch attempt ${attempt + 1}/3 failed:`, err.message);
            }
        }
        if (!epochWritten) {
            console.error('[resetAllPlayerData] ❌ FAILED to bump wipe_epoch after 3 retries — clients WILL NOT auto-clear stale caches:', epochError);
        }

        console.log('[resetAllPlayerData] Complete:', JSON.stringify(results));
        return Response.json({
            success: true,
            deleted: results,
            wipeEpoch: epoch,
            wipeEpochWritten: epochWritten,
            wipeEpochError: epochWritten ? null : epochError,
        });

    } catch (error) {
        console.error('[resetAllPlayerData]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});