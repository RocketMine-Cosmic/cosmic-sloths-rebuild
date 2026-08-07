import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session. Wallet: from linked User.wallet_address.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ error: 'No wallet linked to user' }, { status: 400 });

        const { squadName, squadTag, squadDesc } = await req.json();
        if (!squadName || !squadTag) return Response.json({ error: 'Missing required fields' }, { status: 400 });

        // Authoritative pilot name from PlayerSave (set via Profile). Never trust the client.
        const fallbackName = `Pilot_${walletAddress.slice(-6).toUpperCase()}`;
        let playerName = fallbackName;
        let playerTitle = '';
        try {
            const saves = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() });
            if (saves.length > 0) {
                const sd = typeof saves[0].save_data === 'string' ? JSON.parse(saves[0].save_data) : saves[0].save_data;
                const n = (sd?.player_name || saves[0].player_name || '').trim();
                if (n) playerName = n;
                const t = (sd?.player_title || '').trim();
                if (t) playerTitle = t;
            }
        } catch {}

        const tag = squadTag.toUpperCase().substring(0, 4);
        const today = new Date().toISOString().split('T')[0];
        // Canonical ISO 8601 week id (Mon-start, Sun 23:59 UTC end) — MUST mirror
        // lib/periodIds.js + saveScore + squadActions.resetPeriods. Previously stamped
        // `today` (a YYYY-MM-DD date) into current_week, which lexicographically compares
        // SMALLER than any "YYYY-Www" string — causing resetPeriods to fire the weekly-kills
        // wipe branch on every page load until something else re-stamped it. New squads
        // looked like their weekly kills were resetting day-to-day (Anubis bug 2026-05-12).
        const currentWeekId = (() => {
            const now = new Date();
            const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const dayNum = tmp.getUTCDay() || 7;
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
            const isoYear = tmp.getUTCFullYear();
            const yearStart = new Date(Date.UTC(isoYear, 0, 1));
            const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
            return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
        })();

        const [existingName, existingTag, existingMembership] = await Promise.all([
            base44.asServiceRole.entities.Squad.filter({ name: squadName }),
            base44.asServiceRole.entities.Squad.filter({ tag }),
            base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletAddress }),
        ]);

        if (existingName.length > 0) return Response.json({ error: 'A squad with that name already exists.' }, { status: 409 });
        if (existingTag.length > 0) return Response.json({ error: 'A squad with that tag already exists.' }, { status: 409 });
        if (existingMembership.length > 0) return Response.json({ error: 'You are already a member of a squad. Leave your current squad first.' }, { status: 409 });

        const squad = await base44.asServiceRole.entities.Squad.create({
            name: squadName, tag, description: squadDesc || '',
            owner_wallet: walletAddress, icon: '🛡️',
            privacy: 'open',
            weekly_kills: 0, current_week: currentWeekId,
            daily_kills: 0, current_day: today,
            member_count: 1, xp: 0, level: 1
        });

        const member = await base44.asServiceRole.entities.SquadMember.create({
            squad_id: squad.id, wallet_address: walletAddress,
            player_name: playerName, player_title: playerTitle,
            role: 'leader', last_payout_week: '', last_daily_payout_date: ''
        });

        return Response.json({ success: true, squad, member });
    } catch (error) {
        console.error('[createSquad]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});