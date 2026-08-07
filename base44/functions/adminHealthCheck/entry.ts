import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session → linked wallet → AdminWallet lookup.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        // Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
        const now = new Date();
        const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const isoYear = tmp.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
        const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
        const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
        const season_id = `${isoYear}-S${seasonNum}`;

        const [pools, weekScores, squads, members, bosses, contributions] = await Promise.all([
            base44.asServiceRole.entities.TokenPool.filter({ distributed: false }),
            base44.asServiceRole.entities.RunScore.filter({ week_id }),
            base44.asServiceRole.entities.Squad.list('-created_date', 500),
            base44.asServiceRole.entities.SquadMember.list('-created_date', 1000),
            base44.asServiceRole.entities.GlobalBoss.filter({ week_id }),
            base44.asServiceRole.entities.GlobalBossContribution.filter({ week_id }),
        ]);

        const walletMap = {};
        weekScores.forEach(s => {
            if (!s.wallet_address) return;
            walletMap[s.wallet_address] = (walletMap[s.wallet_address] || 0) + 1;
        });
        const duplicateCount = Object.values(walletMap).filter(c => c > 1).length;
        const squadIds = new Set(squads.map(s => s.id));
        const orphanedMembers = members.filter(m => !squadIds.has(m.squad_id)).length;
        const weeklyPool = pools.find(p => p.period_type === 'weekly' && p.period_id === week_id);
        const seasonalPool = pools.find(p => p.period_type === 'seasonal' && p.period_id === season_id);
        const boss = bosses.length > 0 ? bosses[0] : null;
        const bossHpPct = boss ? Math.round((boss.current_hp / boss.max_hp) * 100) : null;
        const allSaves = await base44.asServiceRole.entities.PlayerSave.list('-updated_at', 1000);

        return Response.json({
            week_id, season_id,
            undistributedCount: pools.length,
            weeklyPoolExists: !!weeklyPool,
            seasonalPoolExists: !!seasonalPool,
            totalPlayers: allSaves.length,
            scoresThisWeek: weekScores.length,
            duplicateCount, orphanedMembers,
            bossExists: !!boss,
            bossDefeated: boss?.is_defeated || false,
            bossHpPct,
            bossContributors: contributions.length,
        });
    } catch (error) {
        console.error('[adminHealthCheck]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});