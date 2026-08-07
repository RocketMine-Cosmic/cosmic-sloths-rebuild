import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 429-aware retry wrapper — Squad Wars reads/writes were 500-ing during peak,
// which was particularly nasty for `claimWinBonus` (the gold/fragment grant
// could fail mid-flight, leaving the war marked claimed but the player unpaid).
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
            console.warn(`[squadWarEngine] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

async function postDiscordSquadWars(payload) {
    const url = Deno.env.get('DISCORD_SQUADWARS_WEBHOOK');
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{ ...payload, color: payload.color ?? 0xdc2626, timestamp: new Date().toISOString() }] }),
        });
    } catch {}
}

// Auth: Base44 session.
// Single endpoint for Squad Wars: viewing current war, history, and admin pairing/resolution.
// Server is the sole writer for kills/scores/winners — all updates server-authoritative.
//
// Actions:
//  - 'getCurrent'  : returns the current week's war for a given squad (or null)
//  - 'getHistory'  : returns recent wars for a given squad (last ~12)
//  - 'getRoster'   : returns all wars for the current week (for the global "Wars Board")
//  - 'pairAndResolve' : ADMIN-ONLY — pair squads for new week + resolve previous week wars
//  - 'claimWinBonus'  : member of winning squad collects per-member bonus (idempotent)

// Weekly war rewards reduced — Champions Pool (5% of seasonal OMENX) supplements these.
const WAR_WIN_GOLD_PER_MEMBER = 2500;
const WAR_WIN_FRAGMENTS_PER_MEMBER = 3;
const WAR_TIE_GOLD_PER_MEMBER = 1000;
const WAR_TIE_FRAGMENTS_PER_MEMBER = 1;
const WAR_LOSS_GOLD_PER_MEMBER = 500;

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
    // Parse YYYY-Www format and subtract one week
    const m = /^(\d{4})-W(\d{2})$/.exec(currentWeekId);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    if (week > 1) return `${year}-W${String(week - 1).padStart(2, '0')}`;
    // Roll over to last week of previous year (approx — week 52)
    return `${year - 1}-W52`;
}

async function grantToPlayerSave(base44, walletAddress, gold, fragments) {
    const walletLower = walletAddress.toLowerCase();
    const records = await with429Retry(
        () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
        'PlayerSave.filter'
    );
    if (records.length === 0) throw new Error('PlayerSave not found');
    const record = records[0];
    const saveData = typeof record.save_data === 'string' ? JSON.parse(record.save_data) : record.save_data;
    saveData.gold = (saveData.gold || 0) + gold;
    if (fragments > 0) saveData.relicFragments = (saveData.relicFragments || 0) + fragments;
    saveData.updated_at = Date.now();
    await with429Retry(
        () => base44.asServiceRole.entities.PlayerSave.update(record.id, {
            save_data: saveData,
            updated_at: Date.now()
        }),
        'PlayerSave.update'
    );
    return { gold: saveData.gold, relicFragments: saveData.relicFragments || 0 };
}

// Minimum members required for a squad to be entered into Squad Wars matchmaking.
// Prevents abuse where a leader sits at 2 members with stacked stats / closed privacy
// to dodge larger opponents and farm easy bye-week / lopsided wins. Roster of 3+ is
// the floor for "real" squad activity. Pairing skips smaller squads — they still get
// to play normally, they just don't enter the war league until they grow.
const MIN_MEMBERS_FOR_WAR = 2;

// Launch grace — Squad Wars went live on the weekend of week 2026-W18, so most
// squads are still recruiting. For the inaugural pairing week (W19, paired
// Monday 2026-05-04) we let solo squads in too so nobody sits out. Reverts
// to MIN_MEMBERS_FOR_WAR after that.
const LAUNCH_GRACE_WEEKS = new Set(['2026-W19']);

// Pair eligible squads for a given week. Idempotent — if a war already exists
// for a squad in that week, we skip it.
async function pairSquadsForWeek(base44, weekId) {
    const allSquads = await base44.asServiceRole.entities.Squad.list('-level', 500);
    const minMembers = LAUNCH_GRACE_WEEKS.has(weekId) ? 1 : MIN_MEMBERS_FOR_WAR;
    const eligible = allSquads.filter(s => (s.member_count || 0) >= minMembers);
    if (eligible.length === 0) return { paired: 0, byes: 0 };

    // Find existing wars for this week so we don't double-pair
    const existingWars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: weekId });
    const alreadyPaired = new Set();
    existingWars.forEach(w => {
        if (w.squad_a_id) alreadyPaired.add(w.squad_a_id);
        if (w.squad_b_id) alreadyPaired.add(w.squad_b_id);
    });

    const toPair = eligible.filter(s => !alreadyPaired.has(s.id));

    // Bracket matchmaking: group squads into 3-level brackets (1-3, 4-6, 7-9, 10-12, 13-15),
    // sort each bracket by war_wins desc so veterans face veterans, and bump odd-bracket
    // squads DOWN to the next bracket to fill it (avoids byes wherever possible).
    // With a 5-member squad cap, level + lifetime wins is the best balance signal we have.
    const BRACKET_SIZE = 3;
    const bracketOf = (lvl) => Math.floor((Math.max(1, lvl) - 1) / BRACKET_SIZE);
    const buckets = new Map();
    for (const s of toPair) {
        const b = bracketOf(s.level || 1);
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b).push(s);
    }
    // Walk brackets from highest to lowest. If a bracket has an odd squad,
    // pop the lowest-wins squad and prepend it to the next bracket down.
    const bracketIds = [...buckets.keys()].sort((a, b) => b - a);
    for (const bId of bracketIds) {
        const bucket = buckets.get(bId);
        // Sort by war_wins desc so adjacent pairs face similar-experience opponents
        bucket.sort((a, b) => (b.war_wins || 0) - (a.war_wins || 0));
        if (bucket.length % 2 === 1 && bId > 0) {
            const bumped = bucket.pop(); // lowest-wins in this bracket
            const nextDown = bId - 1;
            if (!buckets.has(nextDown)) {
                buckets.set(nextDown, []);
                bracketIds.push(nextDown); // ensure we still iterate it
            }
            buckets.get(nextDown).unshift(bumped); // pairs near the top of the lower bracket
        }
    }
    // Flatten bracket order: highest-bracket pairs first, lowest last.
    const ordered = [];
    for (const bId of [...buckets.keys()].sort((a, b) => b - a)) {
        // Re-sort after any bumps
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
            // Odd squad out — bye week (auto-win, no opponent)
            await base44.asServiceRole.entities.SquadWar.create({
                week_id: weekId,
                squad_a_id: a.id, squad_a_name: a.name, squad_a_tag: a.tag, squad_a_icon: a.icon || '🛡️', squad_a_level: a.level || 1,
                squad_b_id: '', squad_b_name: 'No Opponent', squad_b_tag: '---', squad_b_icon: '👻', squad_b_level: 0,
                kills_a: 0, kills_b: 0,
                is_resolved: false, // resolves on next pairing run
                result_kind: 'bye',
                rewarded_member_wallets: [],
            });
            byes++;
        }
    }
    return { paired, byes };
}

// Resolve all unresolved wars for a given week. Updates squad win/loss/tie counts
// and tags the war with a winner. Players claim per-member bonuses separately
// via 'claimWinBonus' so we don't write to PlayerSave for absent players.
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
        } else {
            winnerId = '';
            resultKind = 'tie';
        }

        await base44.asServiceRole.entities.SquadWar.update(war.id, {
            is_resolved: true,
            winner_squad_id: winnerId,
            result_kind: resultKind,
        });

        // Announce result to #squad-wars
        const aLabel = `${war.squad_a_icon || '🛡️'} [${war.squad_a_tag}] ${war.squad_a_name}`;
        const bLabel = war.squad_b_id ? `${war.squad_b_icon || '🛡️'} [${war.squad_b_tag}] ${war.squad_b_name}` : '👻 (no opponent)';
        let title, color;
        if (resultKind === 'bye') { title = `🎟️ Bye week — ${aLabel}`; color = 0x6b7280; }
        else if (resultKind === 'tie') { title = `🤝 War tied — ${aLabel} vs ${bLabel}`; color = 0xeab308; }
        else if (resultKind === 'win_a') { title = `🏆 ${aLabel} wins!`; color = 0x10b981; }
        else { title = `🏆 ${bLabel} wins!`; color = 0x10b981; }
        postDiscordSquadWars({
            title,
            color,
            fields: [
                { name: war.squad_a_name, value: `${war.kills_a || 0} kills`, inline: true },
                { name: war.squad_b_name || 'No Opponent', value: `${war.kills_b || 0} kills`, inline: true },
                { name: 'Week', value: weekId, inline: true },
            ],
        });

        // Update lifetime squad stats
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
                console.error('[squadWarEngine] failed to update squad stats:', e.message);
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
        // base44.auth.me() THROWS (doesn't return null) when there's no auth context —
        // common during page-load race conditions before the OmenX iframe handshake
        // completes. Catch it and surface a clean 401 instead of a 500.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to continue.' }, { status: 401 });

        const walletAddress = me.wallet_address;
        const body = await req.json();
        const { action } = body;

        // ---- Public read actions ----
        if (action === 'getCurrent') {
            const { squadId } = body;
            if (!squadId) return Response.json({ war: null });
            const weekId = getCurrentWeekId();
            const wars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: weekId });
            const war = wars.find(w => w.squad_a_id === squadId || w.squad_b_id === squadId) || null;
            return Response.json({ war, weekId });
        }

        if (action === 'getHistory') {
            const { squadId, limit } = body;
            if (!squadId) return Response.json({ wars: [] });
            // Pull recent wars from SquadWar entity, then filter to those involving the squad
            const all = await base44.asServiceRole.entities.SquadWar.list('-created_date', 200);
            const mine = all.filter(w => w.squad_a_id === squadId || w.squad_b_id === squadId).slice(0, Math.min(limit || 12, 50));
            return Response.json({ wars: mine });
        }

        if (action === 'getRoster') {
            // All wars for the current week (global "Wars Board")
            const weekId = getCurrentWeekId();
            const wars = await base44.asServiceRole.entities.SquadWar.filter({ week_id: weekId });
            // Sort by total kills desc (most exciting first)
            wars.sort((a, b) => ((b.kills_a || 0) + (b.kills_b || 0)) - ((a.kills_a || 0) + (a.kills_b || 0)));
            return Response.json({ wars, weekId });
        }

        if (action === 'getArchive') {
            // Global archive of every resolved war, newest first. Used by the War Archive page.
            // Optional filters: weekId (specific week), squadId (only wars involving that squad), limit (default 200).
            const { weekId, squadId, limit } = body;
            const all = await base44.asServiceRole.entities.SquadWar.list('-created_date', 1000);
            let filtered = all.filter(w => w.is_resolved);
            if (weekId) filtered = filtered.filter(w => w.week_id === weekId);
            if (squadId) filtered = filtered.filter(w => w.squad_a_id === squadId || w.squad_b_id === squadId);
            const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
            return Response.json({ wars: filtered.slice(0, cap) });
        }

        // ---- Member action: claim per-member bonus from a resolved war ----
        if (action === 'claimWinBonus') {
            const { warId } = body;
            if (!walletAddress) return Response.json({ error: 'Your wallet isn\'t linked yet.' }, { status: 400 });
            if (!warId) return Response.json({ error: 'Missing war id.' }, { status: 400 });

            const war = await base44.asServiceRole.entities.SquadWar.get(warId);
            if (!war) return Response.json({ error: 'War not found.' }, { status: 404 });
            if (!war.is_resolved) return Response.json({ error: 'This war hasn\'t finished yet.' }, { status: 400 });

            const already = (war.rewarded_member_wallets || []).map(w => w.toLowerCase());
            if (already.includes(walletAddress.toLowerCase())) {
                return Response.json({ error: 'You\'ve already claimed your war bonus.', alreadyClaimed: true }, { status: 409 });
            }

            // Verify the caller was a member of one of the warring squads at claim time
            const memberRecords = await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletAddress });
            if (memberRecords.length === 0) {
                return Response.json({ error: 'You\'re not in a squad.' }, { status: 403 });
            }
            const mySquadId = memberRecords[0].squad_id;
            const inWar = mySquadId === war.squad_a_id || mySquadId === war.squad_b_id;
            if (!inWar) {
                return Response.json({ error: 'You weren\'t part of this war\'s squads.' }, { status: 403 });
            }

            // Determine reward tier
            const isWinner = war.winner_squad_id && war.winner_squad_id === mySquadId;
            const isTie = !war.winner_squad_id && war.result_kind === 'tie';
            let gold, fragments, label;
            if (isWinner) {
                gold = WAR_WIN_GOLD_PER_MEMBER;
                fragments = WAR_WIN_FRAGMENTS_PER_MEMBER;
                label = 'win';
            } else if (isTie) {
                gold = WAR_TIE_GOLD_PER_MEMBER;
                fragments = WAR_TIE_FRAGMENTS_PER_MEMBER;
                label = 'tie';
            } else {
                gold = WAR_LOSS_GOLD_PER_MEMBER;
                fragments = 0;
                label = 'loss';
            }

            // Mark claimed FIRST so concurrent calls fail
            const updatedClaimList = [...(war.rewarded_member_wallets || []), walletAddress.toLowerCase()];
            await with429Retry(
                () => base44.asServiceRole.entities.SquadWar.update(warId, {
                    rewarded_member_wallets: updatedClaimList,
                }),
                'SquadWar.update'
            );

            // Grant rewards. If credit fails after 4 retries the war is already
            // marked claimed for this wallet — alert Discord so admins can
            // manually pay out (Discord webhook is fire-and-forget).
            let totals;
            try {
                totals = await grantToPlayerSave(base44, walletAddress, gold, fragments);
            } catch (creditErr) {
                console.error('[squadWarEngine] CRITICAL: marked claimed but credit failed:', creditErr.message);
                const errUrl = Deno.env.get('DISCORD_ERROR_WEBHOOK');
                if (errUrl) {
                    fetch(errUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ embeds: [{
                            title: '⚠️ Squad War bonus marked but UNPAID',
                            description: 'Member was marked claimed but the gold/fragment credit failed. Manual payout needed.',
                            color: 0xef4444,
                            fields: [
                                { name: 'Wallet', value: `\`${walletAddress}\``, inline: true },
                                { name: 'War ID', value: warId, inline: true },
                                { name: 'Result', value: label, inline: true },
                                { name: 'Owed gold', value: String(gold), inline: true },
                                { name: 'Owed fragments', value: String(fragments), inline: true },
                                { name: 'Error', value: String(creditErr.message || '').slice(0, 500), inline: false },
                            ],
                            timestamp: new Date().toISOString(),
                        }] }),
                    }).catch(() => {});
                }
                return Response.json({
                    error: 'Your war bonus was logged but couldn\'t be credited right now. Our team has been alerted — please wait a moment.',
                }, { status: 500 });
            }
            return Response.json({
                success: true,
                reward: { gold, fragments, label },
                saveData: totals,
            });
        }

        // ---- Admin: pair + resolve. Idempotent: safe to call repeatedly. ----
        if (action === 'pairAndResolve') {
            // Allow scheduled calls (no user) OR admin user
            if (me && me.role !== 'admin' && me.role !== 'owner') {
                // Scheduled automation runs without a user; if a user IS set, require admin
                return Response.json({ error: 'Forbidden.' }, { status: 403 });
            }
            const currentWeek = getCurrentWeekId();
            const prevWeek = getPreviousWeekId(currentWeek);

            // 1. Resolve previous week first (so winners are tagged before new pairings show)
            const resolvedCount = prevWeek ? await resolveWarsForWeek(base44, prevWeek) : 0;
            // 2. Pair this week's squads
            const pairResult = await pairSquadsForWeek(base44, currentWeek);

            postDiscordSquadWars({
                title: '⚔️ New week of Squad Wars!',
                color: 0xdc2626,
                fields: [
                    { name: 'Current week', value: currentWeek, inline: true },
                    { name: 'New pairings', value: String(pairResult.paired), inline: true },
                    { name: 'Byes', value: String(pairResult.byes), inline: true },
                    { name: 'Previous week resolved', value: `${resolvedCount} war${resolvedCount === 1 ? '' : 's'} (${prevWeek || '—'})`, inline: false },
                ],
            });

            return Response.json({
                success: true,
                resolvedPreviousWeek: prevWeek,
                resolvedCount,
                paired: pairResult.paired,
                byes: pairResult.byes,
                currentWeek,
            });
        }

        return Response.json({ error: 'Unknown action.' }, { status: 400 });
    } catch (error) {
        console.error('[squadWarEngine]', error.message);
        return Response.json({ error: 'Something went wrong with Squad Wars. Please try again.' }, { status: 500 });
    }
});