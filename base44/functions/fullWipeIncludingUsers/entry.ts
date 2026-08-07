import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// FULL NUKE: wipes all player data + deletes every Base44 User except admins.
// Auth: requires 'wipe_data' or 'owner' permission, OR the emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { adminKey, confirm } = body;

        let callerWallet = 'EMERGENCY_KEY';
        let callerEmail = null;
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            callerEmail = me.email;
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('wipe_data') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'wipe_data' permission required" }, { status: 403 });
            }
        }

        if (confirm !== 'NUKE_EVERYTHING_INCLUDING_USERS') {
            return Response.json({ error: 'Must pass confirm: "NUKE_EVERYTHING_INCLUDING_USERS"' }, { status: 400 });
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: 'FULL NUKE triggered (data + Base44 users)',
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

        // 1) Wipe all gameplay data
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

        // 2) Build admin wallet whitelist — never delete those Base44 users.
        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({}, null, 500);
        const adminWalletSet = new Set((adminWallets || []).map(a => a.wallet_address?.toLowerCase()).filter(Boolean));

        // 3) Fetch ALL Base44 Users once (paginated), filter out admins, then delete the rest.
        const allUsers = [];
        let page = 1;
        const PAGE = 100;
        while (true) {
            const batch = await base44.asServiceRole.entities.User.filter({}, '-created_date', PAGE, page);
            if (!batch || batch.length === 0) break;
            allUsers.push(...batch);
            if (batch.length < PAGE) break;
            page++;
            if (page > 100) break; // safety cap (10k users)
        }

        let userDeleted = 0;
        let userSkipped = 0;
        for (const u of allUsers) {
            const w = u.wallet_address?.toLowerCase();
            const isAdminRole = u.role === 'admin';
            const isWhitelisted = w && adminWalletSet.has(w);
            const isCaller = callerEmail && u.email === callerEmail;
            if (isAdminRole || isWhitelisted || isCaller) {
                userSkipped++;
                continue;
            }
            try {
                await base44.asServiceRole.entities.User.delete(u.id);
                userDeleted++;
            } catch (e) {
                if (String(e.message || '').includes('Rate limit')) {
                    await sleep(1500);
                    try { await base44.asServiceRole.entities.User.delete(u.id); userDeleted++; } catch {}
                } else {
                    console.error('[fullWipeIncludingUsers] failed to delete user', u.id, e.message);
                }
            }
            await sleep(40);
        }

        results.User_deleted = userDeleted;
        results.User_skipped_admins = userSkipped;

        // Bump wipe epoch — clients use this to detect "the cloud was reset since
        // I last loaded" and clear their stale localStorage / pending queues.
        // Retried + verified — see resetAllPlayerData for rationale.
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
                        notes: `Bumped by fullWipeIncludingUsers @ ${new Date(epoch).toISOString()}`,
                    });
                } else {
                    await base44.asServiceRole.entities.AppConfig.create({
                        key: 'wipe_epoch',
                        value: { epoch },
                        updated_by: callerWallet,
                        notes: `Initial wipe epoch — set by fullWipeIncludingUsers @ ${new Date(epoch).toISOString()}`,
                    });
                }
                const verify = await base44.asServiceRole.entities.AppConfig.filter({ key: 'wipe_epoch' });
                if (verify.length > 0 && Number(verify[0].value?.epoch) === epoch) {
                    epochWritten = true;
                    console.log(`[fullWipeIncludingUsers] ✅ Bumped wipe_epoch → ${epoch} (verified, attempt ${attempt + 1})`);
                } else {
                    epochError = `Verify mismatch: cloud=${verify[0]?.value?.epoch} wanted=${epoch}`;
                }
            } catch (err) {
                epochError = err.message;
                console.warn(`[fullWipeIncludingUsers] wipe_epoch attempt ${attempt + 1}/3 failed:`, err.message);
            }
        }
        if (!epochWritten) {
            console.error('[fullWipeIncludingUsers] ❌ FAILED to bump wipe_epoch after 3 retries — clients WILL NOT auto-clear stale caches:', epochError);
        }

        console.log('[fullWipeIncludingUsers] Complete:', JSON.stringify(results));
        return Response.json({
            success: true,
            deleted: results,
            wipeEpoch: epoch,
            wipeEpochWritten: epochWritten,
            wipeEpochError: epochWritten ? null : epochError,
        });

    } catch (error) {
        console.error('[fullWipeIncludingUsers]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});