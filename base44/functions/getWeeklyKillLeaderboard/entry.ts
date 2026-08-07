import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public leaderboard read — returns top N players ranked by sector-run kills
// accumulated this ISO week. Sourced from PlayerSave.weekly_sector_kills (a
// server-authoritative counter written by saveScore, NOT from RunScore — which
// gets soft-deleted by the keep-top-scores cleanup cron and would under-count).

function getCurrentWeekId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const weekId = getCurrentWeekId();

        let body = {};
        try { body = await req.json(); } catch {}
        const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));

        // Service role so we can read across all PlayerSaves (RLS restricts
        // regular users to their own row). No auth required for the read.
        const rows = await base44.asServiceRole.entities.PlayerSave.filter(
            { weekly_sector_kills_week: weekId },
            '-weekly_sector_kills',
            limit
        );

        const players = (rows || [])
            .filter(r => (r.weekly_sector_kills || 0) > 0)
            .map(r => ({
                id: r.id,
                wallet_address: r.wallet_address,
                player_name: r.player_name || `Pilot_${String(r.wallet_address || '').slice(-8).toUpperCase()}`,
                player_title: r.player_title || '',
                pilot_icon: r.pilot_icon || '',
                kills: r.weekly_sector_kills || 0,
            }));

        return Response.json({ players, week_id: weekId });
    } catch (error) {
        console.error('[getWeeklyKillLeaderboard]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});