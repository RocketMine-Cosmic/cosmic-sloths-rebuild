import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the per-member kill contribution toward the CURRENT week's Squad War,
// for the caller's own squad only.
//
// IMPORTANT: must mirror the kill-credit rule in functions/saveScore:
//   - Endless runs (arena_id = 'endless')        → NOT credited to wars
//   - Raid runs (arena_id = 'world_boss_arena')  → NOT credited to wars
//   - Meteor runs (arena_id = 'quantum_meteor')  → NOT credited to wars
// Anything else (sector runs) counts. Sum kills per wallet → sorted desc.
//
// S6+ feature. Public read on Squad/SquadMember/RunScore — no admin scope needed.

const NON_WAR_ARENAS = new Set(['endless', 'world_boss_arena', 'quantum_meteor']);

// 30s in-memory cache per squad — same shape as getSquadProfile. Stops the panel
// from hammering RunScore when multiple members open the tab at once.
const CACHE_TTL_MS = 30_000;
const cache = new Map();

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
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in.' }, { status: 401 });

        const { squadId } = await req.json();
        if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });

        // Authorization: caller must be a member of this squad. War contributions
        // are squad-internal stats — don't leak per-member breakdowns to rivals.
        const callerWallet = (me.wallet_address || '').toLowerCase();
        if (!callerWallet) return Response.json({ error: 'Wallet not linked.' }, { status: 400 });
        const callerMembership = await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: callerWallet, squad_id: squadId });
        if (!callerMembership || callerMembership.length === 0) {
            return Response.json({ error: 'You must be in this squad to view its war contributions.' }, { status: 403 });
        }

        const weekId = getCurrentWeekId();
        const cacheKey = `${squadId}:${weekId}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return Response.json(cached.payload);
        }

        // PRIMARY SOURCE: SquadWarMemberKill (incrementally written by saveScore).
        // Survives RunScore cleanup, so finished wars keep accurate per-member splits.
        // Find the current active war for this squad, then load its per-member rows.
        // Falls back to RunScore aggregation below if no war / no rows exist (legacy).
        const members = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
        const wallets = members.map(m => (m.wallet_address || '').toLowerCase()).filter(Boolean);

        let primaryRows = [];
        try {
            const activeWars = await base44.asServiceRole.entities.SquadWar.filter({
                week_id: weekId,
                is_resolved: false,
            });
            const myWar = activeWars.find(w => w.squad_a_id === squadId || w.squad_b_id === squadId);
            if (myWar) {
                primaryRows = await base44.asServiceRole.entities.SquadWarMemberKill.filter({ war_id: myWar.id }, '-kills', 100);
            }
        } catch (e) {
            console.warn('[getSquadWarMemberContributions] primary source lookup failed, falling back:', e.message);
        }

        if (primaryRows && primaryRows.length > 0) {
            const killsMap = new Map();
            for (const r of primaryRows) {
                killsMap.set((r.wallet_address || '').toLowerCase(), Number(r.kills) || 0);
            }
            const contributions = members.map(m => {
                const w = (m.wallet_address || '').toLowerCase();
                return {
                    wallet_address: w,
                    player_name: m.player_name || `Pilot_${w.slice(-6).toUpperCase()}`,
                    player_title: m.player_title || '',
                    role: m.role || 'member',
                    war_kills: killsMap.get(w) || 0,
                };
            }).sort((a, b) => b.war_kills - a.war_kills);
            const payload = { success: true, weekId, contributions, source: 'squad_war_member_kill' };
            cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
            return Response.json(payload);
        }

        // FALLBACK: legacy RunScore + DeletedRunScore aggregation (pre-feature wars).

        if (wallets.length === 0) {
            const payload = { success: true, weekId, contributions: [] };
            cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
            return Response.json(payload);
        }

        // Pull this week's runs for our squad members from BOTH RunScore AND
        // DeletedRunScore. The cleanup automation (cleanupKeepTopScoresPerPlayer)
        // soft-deletes lower scores into DeletedRunScore for archival, which
        // previously caused per-member contribution totals to undercount vs the
        // live squad war kills_a counter (Texxy bug 2026-05-20).
        // 500/table × 2 tables = 1000 rows headroom — well above realistic weekly play.
        const [runs, deletedRuns] = await Promise.all([
            base44.asServiceRole.entities.RunScore.filter(
                { week_id: weekId, wallet_address: { $in: wallets } },
                '-created_date',
                500,
            ),
            base44.asServiceRole.entities.DeletedRunScore.filter(
                { week_id: weekId, wallet_address: { $in: wallets } },
                '-created_date',
                500,
            ).catch(() => []),
        ]);

        // Sum war-eligible kills per wallet across BOTH live and archived rows.
        const killsByWallet = new Map();
        const addRow = (r) => {
            const arena = r.arena_id || '';
            if (NON_WAR_ARENAS.has(arena)) return;
            const w = (r.wallet_address || '').toLowerCase();
            if (!w) return;
            killsByWallet.set(w, (killsByWallet.get(w) || 0) + (r.kills || 0));
        };
        for (const r of runs) addRow(r);
        for (const r of deletedRuns) addRow(r);

        const contributions = members.map(m => {
            const w = (m.wallet_address || '').toLowerCase();
            return {
                wallet_address: w,
                player_name: m.player_name || `Pilot_${w.slice(-6).toUpperCase()}`,
                player_title: m.player_title || '',
                role: m.role || 'member',
                war_kills: killsByWallet.get(w) || 0,
            };
        }).sort((a, b) => b.war_kills - a.war_kills);

        const payload = { success: true, weekId, contributions };
        cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
        // Light GC
        if (cache.size > 200) {
            const now = Date.now();
            for (const [k, v] of cache) if (v.expiresAt < now) cache.delete(k);
        }
        return Response.json(payload);
    } catch (error) {
        console.error('[getSquadWarMemberContributions]', error.message);
        const msg = error.message || '';
        if (/rate limit/i.test(msg) || error.status === 429) {
            return Response.json({ error: 'Server busy — try again shortly.' }, { status: 429 });
        }
        return Response.json({ error: 'Couldn\'t load member contributions.' }, { status: 500 });
    }
});