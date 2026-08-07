import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function postDiscord(envName, color, payload) {
    const url = Deno.env.get(envName);
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{ ...payload, color, timestamp: new Date().toISOString() }] }),
        });
    } catch {}
}

// Admin-only audit tool for investigating gold loss complaints.
// Returns:
//   - currentCloudGold: what's on PlayerSave right now
//   - totalEarnedFromRuns: sum of gold credited by saveScore (re-derived from RunScore)
//   - totalSpent: from TokenSpendLog (OmenX, not gold) + computed gold sinks
//   - blockedSyncs: every SyncBlockLog row for this wallet (so we see exactly what
//     was rejected and when — usually the smoking gun)
//   - lastSync: cloud updated_at, useful for correlating with client logs
//   - suggestedRefund: simple delta = max(blockedGold) if positive, for quick triage

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { walletAddress, adminKey } = body;

        // Auth: emergency key, OR Base44 admin with view_data/owner perms
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('view_data') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'view_data' permission required" }, { status: 403 });
            }
        }

        if (!walletAddress) return Response.json({ error: 'walletAddress required' }, { status: 400 });
        const walletLower = walletAddress.toLowerCase();

        const [saves, blocks, scores, spends] = await Promise.all([
            base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            base44.asServiceRole.entities.SyncBlockLog.filter({ wallet_address: walletLower }, '-created_date', 100),
            base44.asServiceRole.entities.RunScore.filter({ wallet_address: walletLower }, '-created_date', 200),
            base44.asServiceRole.entities.TokenSpendLog.filter({ wallet_address: walletLower }, '-created_date', 100),
        ]);

        const save = saves[0] || null;
        const saveData = save
            ? (typeof save.save_data === 'string' ? JSON.parse(save.save_data) : save.save_data)
            : null;

        // Sum gold from blocked sync attempts (likely the lost amount).
        // EXCLUDE stale-client blocks — those are sync races where the cloud
        // already has the player's gold (client was sending an outdated value),
        // not actual losses. Only fresh-client blocks indicate the client tried
        // to push gold the cloud doesn't know about, which IS a real loss signal.
        const goldBlocks = blocks.filter(b => b.field === 'gold' && !b.client_was_stale);
        const maxBlockedGold = goldBlocks.reduce((max, b) => {
            const delta = (Number(b.client_value) || 0) - (Number(b.cloud_value) || 0);
            return delta > max ? delta : max;
        }, 0);

        // Gold-loss Discord alert disabled per request — was too noisy.
        // The suggestedGoldRefund is still returned in the response for admin triage.

        return Response.json({
            wallet: walletLower,
            currentCloudGold: Number(saveData?.gold || 0),
            currentTotalKills: Number(saveData?.totalKills || 0),
            currentTotalGoldEarned: Number(saveData?.totalGoldEarned || 0),
            lastSync: save?.updated_at || saveData?.updated_at || null,
            playerName: save?.player_name || saveData?.player_name || saveData?.pilotName || null,
            recentRuns: scores.slice(0, 20).map(s => ({
                created: s.created_date, score: s.score, kills: s.kills,
                level: s.level, time: s.time_survived, arena: s.arena_id,
                gold_earned: s.gold_earned ?? null,
                gold_credited: s.gold_credited ?? null,
            })),
            recentOmenxSpends: spends.slice(0, 20).map(s => ({
                created: s.created_date, amount: s.amount, week: s.week_id
            })),
            blockedSyncs: blocks.map(b => ({
                created: b.created_date,
                field: b.field,
                client_value: b.client_value,
                cloud_value: b.cloud_value,
                delta: (Number(b.client_value) || 0) - (Number(b.cloud_value) || 0),
                client_was_stale: b.client_was_stale,
                notes: b.notes
            })),
            suggestedGoldRefund: maxBlockedGold,
        });
    } catch (error) {
        console.error('[auditPlayerGold]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});