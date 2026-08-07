import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Re-syncs GlobalBossContribution.player_name (and GlobalBossEvent message/player_name)
// from PlayerSave.player_name for the CURRENT week. Fixes the bug where the old
// submitBossDamage was anonymizing legit pilots to Pilot_XXXXXX when the client
// sent the OAuth full_name as a fallback (bug 2026-05-13).
//
// Auth: admin only. Idempotent — safe to run repeatedly. Defaults to current week
// only so we don't rewrite historical raid history.

function getCurrentPeriodIds() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return { week_id: `${isoYear}-W${String(isoWeek).padStart(2, '0')}` };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { dryRun, week_id: weekIdParam } = await req.json().catch(() => ({}));
        const week_id = weekIdParam || getCurrentPeriodIds().week_id;

        // Build wallet → authoritative-pilot-name map from PlayerSave.
        const allSaves = await base44.asServiceRole.entities.PlayerSave.list('-updated_at', 5000);
        const nameByWallet = new Map();
        for (const ps of allSaves) {
            const wallet = (ps.wallet_address || '').toLowerCase();
            if (!wallet) continue;
            const sd = typeof ps.save_data === 'string' ? JSON.parse(ps.save_data) : (ps.save_data || {});
            const authoritative = (sd.player_name || ps.player_name || sd.pilotName || '').trim();
            if (authoritative) nameByWallet.set(wallet, authoritative);
        }

        // 1. Fix GlobalBossContribution rows for the week
        const contribs = await base44.asServiceRole.entities.GlobalBossContribution.filter({ week_id }, '-created_date', 5000);
        const contribMismatches = [];
        for (const c of contribs) {
            const wallet = (c.user_id || '').toLowerCase();
            if (!wallet) continue;
            const correct = nameByWallet.get(wallet);
            if (!correct) continue;
            if ((c.player_name || '').trim() !== correct) {
                contribMismatches.push({ id: c.id, wallet, from: c.player_name, to: correct });
            }
        }

        // 2. Fix GlobalBossEvent rows for the week (live activity feed)
        // Match events to wallets via player_name lookup — events don't store user_id.
        // Build a reverse lookup: anon-name → wallet, then fix events whose player_name
        // matches a known anon pattern AND whose wallet has a real pilot name now.
        const anonToWallet = new Map();
        for (const [wallet] of nameByWallet) {
            const anon = `Pilot_${wallet.slice(-6).toUpperCase()}`;
            anonToWallet.set(anon, wallet);
        }
        const events = await base44.asServiceRole.entities.GlobalBossEvent.filter({ week_id }, '-created_date', 5000);
        const eventMismatches = [];
        for (const e of events) {
            const evName = (e.player_name || '').trim();
            const wallet = anonToWallet.get(evName);
            if (!wallet) continue;
            const correct = nameByWallet.get(wallet);
            if (!correct || correct === evName) continue;
            const newMessage = (e.message || '').split(evName).join(correct);
            eventMismatches.push({ id: e.id, wallet, from: evName, to: correct, newMessage });
        }

        if (dryRun) {
            return Response.json({
                success: true,
                dryRun: true,
                week_id,
                totalContribs: contribs.length,
                contribMismatches: contribMismatches.length,
                contribPreview: contribMismatches.slice(0, 20),
                totalEvents: events.length,
                eventMismatches: eventMismatches.length,
                eventPreview: eventMismatches.slice(0, 20),
            });
        }

        // Apply contribution fixes
        let contribUpdated = 0, contribFailed = 0;
        const batchSize = 25;
        for (let i = 0; i < contribMismatches.length; i += batchSize) {
            const batch = contribMismatches.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(m => base44.asServiceRole.entities.GlobalBossContribution.update(m.id, { player_name: m.to }))
            );
            contribUpdated += results.filter(r => r.status === 'fulfilled').length;
            contribFailed += results.filter(r => r.status === 'rejected').length;
        }

        // Apply event fixes (player_name + message)
        let eventUpdated = 0, eventFailed = 0;
        for (let i = 0; i < eventMismatches.length; i += batchSize) {
            const batch = eventMismatches.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(m => base44.asServiceRole.entities.GlobalBossEvent.update(m.id, {
                    player_name: m.to,
                    message: m.newMessage,
                }))
            );
            eventUpdated += results.filter(r => r.status === 'fulfilled').length;
            eventFailed += results.filter(r => r.status === 'rejected').length;
        }

        console.log(`[backfillRaidContributorNames] caller=${callerWallet} week=${week_id} contribs=${contribUpdated}/${contribMismatches.length} events=${eventUpdated}/${eventMismatches.length}`);
        return Response.json({
            success: true,
            week_id,
            contribMismatches: contribMismatches.length,
            contribUpdated,
            contribFailed,
            eventMismatches: eventMismatches.length,
            eventUpdated,
            eventFailed,
        });
    } catch (error) {
        console.error('[backfillRaidContributorNames]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});