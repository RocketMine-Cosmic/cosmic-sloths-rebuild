import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only tool: recomputes SquadWar.kills_a / kills_b for the current week
// (or a given week) by summing war-eligible kills from RunScore for each squad's
// current members. Fixes drift when a saveScore SquadWar.update silently failed
// (Crybel/MiSFiTS bug 2026-05-18 — squad weekly_kills had 1,415 but war row was
// stuck at 680 because one of 4 SquadWar.update calls 429'd and the error was
// swallowed by a bare .catch in saveScore).
//
// Idempotent. Compares old vs new and only writes rows that changed.

const NON_WAR_ARENAS = new Set(['endless', 'world_boss_arena', 'quantum_meteor']);

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

async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return await fn(); }
        catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 3) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[resyncSquadWarKills] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const weekId = body.weekId || getCurrentWeekId();
        const dryRun = !!body.dryRun;

        // Pull every unresolved war for the target week.
        const wars = await with429Retry(
            () => base44.asServiceRole.entities.SquadWar.filter({ week_id: weekId, is_resolved: false }),
            'SquadWar.filter'
        );
        if (wars.length === 0) {
            return Response.json({ success: true, weekId, dryRun, scanned: 0, updated: 0, changes: [] });
        }

        // Collect every squad id involved across all wars.
        const squadIds = new Set();
        for (const w of wars) {
            if (w.squad_a_id) squadIds.add(w.squad_a_id);
            if (w.squad_b_id) squadIds.add(w.squad_b_id);
        }

        // For each squad, sum this week's war-eligible kills from RunScore.
        // Done per-squad (instead of one giant $in query) to keep pages reasonable.
        const killsBySquad = new Map();
        for (const squadId of squadIds) {
            const members = await with429Retry(
                () => base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId }),
                'SquadMember.filter'
            );
            const wallets = members.map(m => (m.wallet_address || '').toLowerCase()).filter(Boolean);
            if (wallets.length === 0) {
                killsBySquad.set(squadId, 0);
                continue;
            }
            const runs = await with429Retry(
                () => base44.asServiceRole.entities.RunScore.filter(
                    { week_id: weekId, wallet_address: { $in: wallets } },
                    '-created_date',
                    1000,
                ),
                'RunScore.filter'
            );
            let total = 0;
            for (const r of runs) {
                if (NON_WAR_ARENAS.has(r.arena_id || '')) continue;
                total += Number(r.kills || 0);
            }
            killsBySquad.set(squadId, total);
        }

        // Diff + write.
        const changes = [];
        let updated = 0;
        for (const w of wars) {
            const trueA = w.squad_a_id ? (killsBySquad.get(w.squad_a_id) || 0) : 0;
            const trueB = w.squad_b_id ? (killsBySquad.get(w.squad_b_id) || 0) : 0;
            const oldA = Number(w.kills_a || 0);
            const oldB = Number(w.kills_b || 0);
            if (trueA === oldA && trueB === oldB) continue;
            changes.push({
                warId: w.id,
                squad_a_name: w.squad_a_name, squad_b_name: w.squad_b_name,
                kills_a: { old: oldA, new: trueA, delta: trueA - oldA },
                kills_b: { old: oldB, new: trueB, delta: trueB - oldB },
            });
            if (!dryRun) {
                await with429Retry(
                    () => base44.asServiceRole.entities.SquadWar.update(w.id, { kills_a: trueA, kills_b: trueB }),
                    'SquadWar.update'
                );
                updated++;
            }
        }

        console.log(`[resyncSquadWarKills] week=${weekId} dryRun=${dryRun} scanned=${wars.length} changes=${changes.length} updated=${updated}`);
        return Response.json({
            success: true,
            weekId,
            dryRun,
            scanned: wars.length,
            updated,
            changes,
        });
    } catch (error) {
        console.error('[resyncSquadWarKills]', error.message);
        return Response.json({ error: error.message || 'Resync failed' }, { status: 500 });
    }
});