import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled trigger — pair squads and resolve previous-week wars.
// Runs every Monday at 00:05 UTC. Idempotent: safe to call repeatedly.
//
// We re-implement the resolve+pair logic here (rather than just calling squadWarEngine)
// so the scheduled run uses the asServiceRole client directly without going through
// the user-auth gate. The logic is intentionally identical to squadWarEngine.

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
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

function getPreviousWeekId(currentWeekId) {
    const m = /^(\d{4})-W(\d{2})$/.exec(currentWeekId);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    if (week > 1) return `${year}-W${String(week - 1).padStart(2, '0')}`;
    return `${year - 1}-W52`;
}

async function pairSquadsForWeek(base44, weekId) {
    const allSquads = await base44.asServiceRole.entities.Squad.list('-level', 500);
    const eligible = allSquads.filter(s => (s.member_count || 0) >= 1);
    if (eligible.length === 0) return { paired: 0, byes: 0 };

    const existingWars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: weekId });
    const alreadyPaired = new Set();
    existingWars.forEach(w => {
        if (w.squad_a_id) alreadyPaired.add(w.squad_a_id);
        if (w.squad_b_id) alreadyPaired.add(w.squad_b_id);
    });

    const toPair = eligible.filter(s => !alreadyPaired.has(s.id));

    // Bracket matchmaking — see squadWarEngine for the design notes. Logic is
    // intentionally identical: bracket by 3 levels, sort within bracket by war_wins
    // desc, bump the odd squad DOWN to the next bracket to minimise byes.
    const BRACKET_SIZE = 3;
    const bracketOf = (lvl) => Math.floor((Math.max(1, lvl) - 1) / BRACKET_SIZE);
    const buckets = new Map();
    for (const s of toPair) {
        const b = bracketOf(s.level || 1);
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b).push(s);
    }
    const bracketIds = [...buckets.keys()].sort((a, b) => b - a);
    for (const bId of bracketIds) {
        const bucket = buckets.get(bId);
        bucket.sort((a, b) => (b.war_wins || 0) - (a.war_wins || 0));
        if (bucket.length % 2 === 1 && bId > 0) {
            const bumped = bucket.pop();
            const nextDown = bId - 1;
            if (!buckets.has(nextDown)) {
                buckets.set(nextDown, []);
                bracketIds.push(nextDown);
            }
            buckets.get(nextDown).unshift(bumped);
        }
    }
    const ordered = [];
    for (const bId of [...buckets.keys()].sort((a, b) => b - a)) {
        buckets.get(bId).sort((a, b) => (b.war_wins || 0) - (a.war_wins || 0));
        ordered.push(...buckets.get(bId));
    }

    // Repeat-avoidance: don't give a squad the same opponent as last week when
    // an alternative exists. Greedy pass over the pairing order — if a pair
    // would be a rematch, swap the second slot with the nearest later squad
    // that isn't last week's opponent. Levels barely move week-over-week, so
    // without this most squads would draw identical matchups every Monday.
    const prevWeekId = getPreviousWeekId(weekId);
    if (prevWeekId) {
        const prevWars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: prevWeekId });
        const prevOpponent = new Map();
        prevWars.forEach(w => {
            if (w.squad_a_id && w.squad_b_id) {
                prevOpponent.set(w.squad_a_id, w.squad_b_id);
                prevOpponent.set(w.squad_b_id, w.squad_a_id);
            }
        });
        for (let i = 0; i + 1 < ordered.length; i += 2) {
            if (prevOpponent.get(ordered[i].id) === ordered[i + 1].id) {
                for (let j = i + 2; j < ordered.length; j++) {
                    if (prevOpponent.get(ordered[i].id) !== ordered[j].id) {
                        [ordered[i + 1], ordered[j]] = [ordered[j], ordered[i + 1]];
                        break;
                    }
                }
            }
        }
    }

    let paired = 0, byes = 0;
    for (let i = 0; i < ordered.length; i += 2) {
        const a = ordered[i];
        const b = ordered[i + 1];
        if (b) {
            await base44.asServiceRole.entities.SquadWar.create({
                week_id: weekId,
                squad_a_id: a.id, squad_a_name: a.name, squad_a_tag: a.tag, squad_a_icon: a.icon || '🛡️', squad_a_level: a.level || 1,
                squad_b_id: b.id, squad_b_name: b.name, squad_b_tag: b.tag, squad_b_icon: b.icon || '🛡️', squad_b_level: b.level || 1,
                kills_a: 0, kills_b: 0,
                is_resolved: false,
                rewarded_member_wallets: [],
            });
            paired++;
        } else {
            await base44.asServiceRole.entities.SquadWar.create({
                week_id: weekId,
                squad_a_id: a.id, squad_a_name: a.name, squad_a_tag: a.tag, squad_a_icon: a.icon || '🛡️', squad_a_level: a.level || 1,
                squad_b_id: '', squad_b_name: 'No Opponent', squad_b_tag: '---', squad_b_icon: '👻', squad_b_level: 0,
                kills_a: 0, kills_b: 0,
                is_resolved: false,
                result_kind: 'bye',
                rewarded_member_wallets: [],
            });
            byes++;
        }
    }
    return { paired, byes };
}

async function resolveWarsForWeek(base44, weekId) {
    const wars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: weekId, is_resolved: false });
    let resolved = 0;
    for (const war of wars) {
        const isBye = war.result_kind === 'bye' || !war.squad_b_id;
        let winnerId = '';
        let resultKind = 'tie';
        if (isBye) {
            winnerId = war.squad_a_id;
            resultKind = 'bye';
        } else if ((war.kills_a || 0) > (war.kills_b || 0)) {
            winnerId = war.squad_a_id;
            resultKind = 'win_a';
        } else if ((war.kills_b || 0) > (war.kills_a || 0)) {
            winnerId = war.squad_b_id;
            resultKind = 'win_b';
        }

        await base44.asServiceRole.entities.SquadWar.update(war.id, {
            is_resolved: true,
            winner_squad_id: winnerId,
            result_kind: resultKind,
        });

        const updateSquadStats = async (squadId, didWin, didTie) => {
            if (!squadId) return;
            try {
                const sq = await base44.asServiceRole.entities.Squad.get(squadId);
                if (!sq) return;
                const patch = {};
                if (didWin) {
                    patch.war_wins = (sq.war_wins || 0) + 1;
                    patch.war_streak = (sq.war_streak || 0) + 1;
                } else if (didTie) {
                    patch.war_ties = (sq.war_ties || 0) + 1;
                    patch.war_streak = 0;
                } else {
                    patch.war_losses = (sq.war_losses || 0) + 1;
                    patch.war_streak = 0;
                }
                await base44.asServiceRole.entities.Squad.update(squadId, patch);
            } catch (e) {
                console.error('[scheduledSquadWarPairing] failed to update squad stats:', e.message);
            }
        };

        if (resultKind === 'tie') {
            await updateSquadStats(war.squad_a_id, false, true);
            await updateSquadStats(war.squad_b_id, false, true);
        } else if (resultKind === 'bye' || resultKind === 'win_a') {
            await updateSquadStats(war.squad_a_id, true, false);
            if (war.squad_b_id) await updateSquadStats(war.squad_b_id, false, false);
        } else if (resultKind === 'win_b') {
            await updateSquadStats(war.squad_a_id, false, false);
            await updateSquadStats(war.squad_b_id, true, false);
        }
        resolved++;
    }
    return resolved;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // Scheduled automation may invoke without a user. If a user is set,
        // require admin to call manually.
        const me = await base44.auth.me().catch(() => null);
        if (me && me.role !== 'admin' && me.role !== 'owner') {
            return Response.json({ error: 'Forbidden.' }, { status: 403 });
        }

        const currentWeek = getCurrentWeekId();
        const prevWeek = getPreviousWeekId(currentWeek);

        // Resolve previous week first so its wins/losses are tagged before new pairings show
        const resolvedCount = prevWeek ? await resolveWarsForWeek(base44, prevWeek) : 0;
        const pairResult = await pairSquadsForWeek(base44, currentWeek);

        console.log(`[scheduledSquadWarPairing] resolved=${resolvedCount} (week ${prevWeek}), paired=${pairResult.paired}, byes=${pairResult.byes} (week ${currentWeek})`);
        return Response.json({
            success: true,
            currentWeek,
            previousWeek: prevWeek,
            resolvedCount,
            paired: pairResult.paired,
            byes: pairResult.byes,
        });
    } catch (error) {
        console.error('[scheduledSquadWarPairing]', error.message);
        return Response.json({ error: 'Squad war pairing failed.' }, { status: 500 });
    }
});