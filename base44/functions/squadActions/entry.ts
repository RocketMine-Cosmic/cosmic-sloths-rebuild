import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session. Wallet: from linked User.wallet_address.
// No OmenX token needed — wallet was linked at first login.

const MAX_SQUAD_MEMBERS = 5;

// Daily squad XP awarded once per day (UTC) when ANY member first claims the daily bounty.
// Scales with squad level so higher-tier squads still feel rewarded but progression
// stays slow enough that weekly kills remain the primary XP driver. Tuned to give
// a level-1 squad ~7 days to reach Drifters (5000 XP) on dailies alone, much less
// with weekly kill XP added on top.
const DAILY_SQUAD_XP_BY_LEVEL = [
    500,   // Lv 1
    700,   // Lv 2
    900,   // Lv 3
    1200,  // Lv 4
    1500,  // Lv 5
    1800,  // Lv 6
    2000,  // Lv 7+
];

// MUST mirror game/SquadLevels.js. Used to recompute level when XP changes server-side.
// Cap raised to Lv15 (2026-07-01) — without the extended thresholds every squad
// with 300k+ XP got clamped to Lv7 in the stored `level` field, wiping their
// visible progress (Briantjeuh 2026-07-01: "we were lvl11 before utc 00:00").
const SQUAD_LEVEL_THRESHOLDS = [
    { level: 1,  xpRequired: 0 },
    { level: 2,  xpRequired: 5000 },
    { level: 3,  xpRequired: 15000 },
    { level: 4,  xpRequired: 35000 },
    { level: 5,  xpRequired: 75000 },
    { level: 6,  xpRequired: 150000 },
    { level: 7,  xpRequired: 300000 },
    { level: 8,  xpRequired: 600000 },
    { level: 9,  xpRequired: 1200000 },
    { level: 10, xpRequired: 2500000 },
    { level: 11, xpRequired: 5000000 },
    { level: 12, xpRequired: 10000000 },
    { level: 13, xpRequired: 20000000 },
    { level: 14, xpRequired: 40000000 },
    { level: 15, xpRequired: 80000000 },
];

function computeSquadLevel(xp) {
    let lvl = 1;
    for (const t of SQUAD_LEVEL_THRESHOLDS) {
        if (xp >= t.xpRequired) lvl = t.level;
    }
    return lvl;
}

function getDailyXpForLevel(level) {
    const idx = Math.max(0, Math.min(DAILY_SQUAD_XP_BY_LEVEL.length - 1, (level || 1) - 1));
    return DAILY_SQUAD_XP_BY_LEVEL[idx];
}

// Server-authoritative bounty reward tables (must mirror pages/Squads.jsx for UI display).
// Rewards are PER-MEMBER (each member claims their own once per period). Halved from
// previous values to keep total squad payout roughly constant after the policy change.
const WEEKLY_BOUNTY_TIERS = [
    { minLevel: 1, target: 2000,  gold: 250,  fragments: 1 },
    { minLevel: 2, target: 5000,  gold: 600,  fragments: 1 },
    { minLevel: 3, target: 10000, gold: 1250, fragments: 2 },
    { minLevel: 4, target: 18000, gold: 2000, fragments: 2 },
    { minLevel: 5, target: 30000, gold: 3250, fragments: 3 },
    { minLevel: 6, target: 50000, gold: 5000, fragments: 4 },
    { minLevel: 7, target: 75000, gold: 7500, fragments: 5 },
];
const DAILY_BOUNTY_TIERS = [
    { minLevel: 1, target: 300,   gold: 75,   fragments: 0 },
    { minLevel: 2, target: 800,   gold: 150,  fragments: 0 },
    { minLevel: 3, target: 1500,  gold: 300,  fragments: 0 },
    { minLevel: 4, target: 2500,  gold: 500,  fragments: 1 },
    { minLevel: 5, target: 4500,  gold: 750,  fragments: 1 },
    { minLevel: 6, target: 7500,  gold: 1250, fragments: 1 },
    { minLevel: 7, target: 12000, gold: 2000, fragments: 2 },
];
function getTier(level, table) {
    let tier = table[0];
    for (const t of table) if (level >= t.minLevel) tier = t;
    return tier;
}

// Verify the caller is the leader of the given squad. Returns true if so,
// otherwise false. Used to gate squad-management actions (settings, transfer
// leadership, set ranks) so any random member can't mess with the squad.
async function isCallerLeader(base44, walletAddress, squadId) {
    if (!walletAddress || !squadId) return false;
    const records = await base44.asServiceRole.entities.SquadMember.filter({
        squad_id: squadId,
        wallet_address: walletAddress,
    });
    return records.length > 0 && records[0].role === 'leader';
}

// Leader OR officer — used for moderation actions (kick members,
// approve/deny join requests). Officers cannot touch other officers
// or the leader.
async function getCallerMember(base44, walletAddress, squadId) {
    if (!walletAddress || !squadId) return null;
    const records = await base44.asServiceRole.entities.SquadMember.filter({
        squad_id: squadId,
        wallet_address: walletAddress,
    });
    return records[0] || null;
}

// 429-aware retry wrapper — without this, peak-load rate-limits silently lose
// bounty claim rewards (member is marked claimed but gold/fragments never land).
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
            console.warn(`[squadActions] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

// Discord alert when a bounty is marked claimed but the gold credit failed —
// admins can manually pay from the wallet+amount logged here.
async function alertUnpaidBounty(wallet, kind, gold, fragments, errMsg) {
    const url = Deno.env.get('DISCORD_ERROR_WEBHOOK');
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{
                title: '⚠️ Squad bounty marked but UNPAID',
                description: 'Member was marked claimed but the gold/fragment credit failed. Manual payout needed.',
                color: 0xef4444,
                fields: [
                    { name: 'Wallet', value: `\`${wallet}\``, inline: true },
                    { name: 'Kind', value: kind, inline: true },
                    { name: 'Owed gold', value: String(gold), inline: true },
                    { name: 'Owed fragments', value: String(fragments), inline: true },
                    { name: 'Error', value: String(errMsg || '').slice(0, 500), inline: false },
                ],
                timestamp: new Date().toISOString(),
            }] }),
        });
    } catch {}
}

// Grants gold/fragments directly to the player's cloud PlayerSave so the
// reward grant is server-authoritative and can't be tampered with by the client.
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
        if (!walletAddress) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const body = await req.json();
        const { action } = body;

        // Authoritative pilot name from PlayerSave (set via Profile page).
        // We look it up once here so all writes (join/leave/message/system events)
        // use the same source of truth — never trust the client-submitted name.
        const fallbackName = `Pilot_${walletAddress.slice(-6).toUpperCase()}`;
        let authoritativeName = fallbackName;
        let authoritativeTitle = '';
        try {
            const saves = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() });
            if (saves.length > 0) {
                const sd = typeof saves[0].save_data === 'string' ? JSON.parse(saves[0].save_data) : saves[0].save_data;
                const n = (sd?.player_name || saves[0].player_name || '').trim();
                if (n) authoritativeName = n;
                const t = (sd?.player_title || '').trim();
                if (t) authoritativeTitle = t;
            }
        } catch {}

        if (action === 'join') {
            const { squadId } = body;
            const playerName = authoritativeName;
            const playerTitle = authoritativeTitle;
            if (!squadId) return Response.json({ error: 'Couldn\'t join the squad — please refresh and try again.' }, { status: 400 });

            // Validate squad exists & has space; reject duplicate joins.
            let squad;
            try {
                squad = await base44.asServiceRole.entities.Squad.get(squadId);
            } catch {
                return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });
            }
            if (!squad) return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });
            // CRITICAL: Use actual SquadMember row count, not cached member_count.
            // Two simultaneous joins on a 4/5 squad both read member_count=4 from
            // the squad row → both pass the guard → squad ends up with 6 actual
            // members but counter stuck at 5 (Hugo bug 2026-05-03 — Anubian Legion).
            const currentMembers = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            if (currentMembers.length >= MAX_SQUAD_MEMBERS) {
                return Response.json({ error: 'This squad is full.' }, { status: 400 });
            }
            // Case-insensitive existing-membership check (covers both the legacy
            // mixed-case and the new lowercase storage formats).
            const walletLower = walletAddress.toLowerCase();
            const existingByLower = await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletLower });
            const existingByOriginal = walletAddress !== walletLower
                ? await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletAddress })
                : [];
            if (existingByLower.length > 0 || existingByOriginal.length > 0) {
                return Response.json({ error: 'You\'re already in a squad. Leave it before joining another.' }, { status: 400 });
            }

            // Privacy gate: only `open` squads accept instant joins.
            // `request` squads must use the requestJoin flow; `closed` squads block all joins.
            const privacy = squad.privacy || 'open';
            if (privacy === 'closed') {
                return Response.json({ error: 'This squad is closed to new members.' }, { status: 403 });
            }
            if (privacy === 'request') {
                return Response.json({ error: 'This squad is invite-only. Send a join request instead.', requiresRequest: true }, { status: 403 });
            }

            // Leave bounty stamps empty so new members can claim the current
            // period's daily/weekly bounty if the squad has hit the threshold.
            // (Previously we pre-stamped both fields, which made every joiner see
            // "already claimed" until the next rollover — Texxy bug 2026-05-03.)
            // Always store wallet lowercase — keeps claim/kick/transfer comparisons
            // consistent across direct-join and approveJoin paths.
            const member = await base44.asServiceRole.entities.SquadMember.create({
                squad_id: squadId,
                wallet_address: walletLower,
                player_name: playerName || 'Pilot',
                player_title: playerTitle || '',
                role: 'member',
                last_payout_week: '',
                last_daily_payout_date: ''
            });

            // Set member count from actual row count (race-safe — re-counts after the
            // create above so concurrent joins both end up with the correct total).
            const verifiedMembers = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            await base44.asServiceRole.entities.Squad.update(squadId, {
                member_count: verifiedMembers.length
            });
            const updatedSquad = await base44.asServiceRole.entities.Squad.get(squadId);

            await base44.asServiceRole.entities.SquadMessage.create({
                squad_id: squadId,
                wallet_address: 'system',
                player_name: 'SYSTEM',
                content: `${playerName || 'A pilot'} has joined the squad!`
            });

            return Response.json({ success: true, member, squad: updatedSquad });
        }

        if (action === 'leave') {
            const { memberId, squadId } = body;
            const playerName = authoritativeName;
            if (!memberId || !squadId) return Response.json({ error: 'Couldn\'t leave the squad — please refresh and try again.' }, { status: 400 });

            await base44.asServiceRole.entities.SquadMember.delete(memberId);

            // Reconcile member count from actual rows (race-safe — also self-heals
            // any squads with stale member_count from past concurrent joins).
            try {
                const remaining = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
                await base44.asServiceRole.entities.Squad.update(squadId, {
                    member_count: remaining.length
                });
            } catch {}

            await base44.asServiceRole.entities.SquadMessage.create({
                squad_id: squadId,
                wallet_address: 'system',
                player_name: 'SYSTEM',
                content: `${playerName || 'A pilot'} has left the squad.`
            });

            return Response.json({ success: true });
        }

        if (action === 'kick') {
            const { targetMemberId, squadId } = body;
            if (!targetMemberId || !squadId) return Response.json({ error: 'Couldn\'t kick this member — please refresh and try again.' }, { status: 400 });

            // Leader OR officer can kick. Officers can't kick the leader or other officers.
            const caller = await getCallerMember(base44, walletAddress, squadId);
            if (!caller || (caller.role !== 'leader' && caller.role !== 'officer')) {
                return Response.json({ error: 'Only squad leaders and officers can kick members.' }, { status: 403 });
            }

            // Validate target and rank-restriction.
            try {
                const target = await base44.asServiceRole.entities.SquadMember.get(targetMemberId);
                if (target && target.wallet_address === walletAddress) {
                    return Response.json({ error: 'Use "leave squad" to remove yourself.' }, { status: 400 });
                }
                if (target && caller.role === 'officer' && (target.role === 'leader' || target.role === 'officer')) {
                    return Response.json({ error: 'Officers can\'t kick the leader or other officers.' }, { status: 403 });
                }
            } catch {}

            await base44.asServiceRole.entities.SquadMember.delete(targetMemberId);

            // Reconcile member count from actual rows (race-safe + self-healing).
            try {
                const remaining = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
                await base44.asServiceRole.entities.Squad.update(squadId, {
                    member_count: remaining.length
                });
            } catch {}

            return Response.json({ success: true });
        }

        if (action === 'sendMessage') {
            const { squadId, content } = body;
            const playerName = authoritativeName;
            const playerTitle = authoritativeTitle;
            if (!squadId || !content) return Response.json({ error: 'Couldn\'t send your message — please try again.' }, { status: 400 });

            // Block muted wallets. Auto-clean expired mutes inline so they don't linger.
            const mutes = await base44.asServiceRole.entities.MutedWallet.filter({ wallet_address: walletAddress.toLowerCase() });
            if (mutes.length > 0) {
                const m = mutes[0];
                const until = m.muted_until ? new Date(m.muted_until).getTime() : null;
                if (until && until < Date.now()) {
                    try { await base44.asServiceRole.entities.MutedWallet.delete(m.id); } catch {}
                } else {
                    const remaining = until
                        ? `until ${new Date(until).toISOString().replace('T', ' ').slice(0, 16)} UTC`
                        : 'by a moderator';
                    return Response.json({ error: `You've been muted from squad chat ${remaining}.`, muted: true }, { status: 403 });
                }
            }

            const message = await base44.asServiceRole.entities.SquadMessage.create({
                squad_id: squadId,
                wallet_address: walletAddress,
                player_name: playerName || 'Pilot',
                player_title: playerTitle || '',
                content: content.substring(0, 200)
            });
            return Response.json({ success: true, message });
        }

        if (action === 'transferLeadership') {
            const { targetMemberId, squadId } = body;
            if (!targetMemberId || !squadId) return Response.json({ error: 'Couldn\'t transfer leadership — please refresh and try again.' }, { status: 400 });

            // Only the current leader can transfer leadership.
            const currentLeaderRecords = await base44.asServiceRole.entities.SquadMember.filter({
                squad_id: squadId,
                wallet_address: walletAddress
            });
            if (currentLeaderRecords.length === 0 || currentLeaderRecords[0].role !== 'leader') {
                return Response.json({ error: 'Only the current squad leader can transfer leadership.' }, { status: 403 });
            }

            // Sanity-check the target is a real member of the same squad
            try {
                const target = await base44.asServiceRole.entities.SquadMember.get(targetMemberId);
                if (!target || target.squad_id !== squadId) {
                    return Response.json({ error: 'Target is not a member of this squad.' }, { status: 400 });
                }
            } catch {
                return Response.json({ error: 'Target is not a member of this squad.' }, { status: 400 });
            }

            await base44.asServiceRole.entities.SquadMember.update(currentLeaderRecords[0].id, { role: 'member' });
            await base44.asServiceRole.entities.SquadMember.update(targetMemberId, { role: 'leader' });

            return Response.json({ success: true, newLeaderMemberId: targetMemberId });
        }

        if (action === 'saveSettings') {
            const { squadId, name, tag, description, icon, privacy } = body;
            if (!squadId) return Response.json({ error: 'Couldn\'t save squad settings — please refresh and try again.' }, { status: 400 });

            // Only the leader can change squad settings.
            if (!(await isCallerLeader(base44, walletAddress, squadId))) {
                return Response.json({ error: 'Only the squad leader can change squad settings.' }, { status: 403 });
            }

            const patch = {
                name: name?.trim(),
                tag: tag?.trim().toUpperCase().substring(0, 4),
                description: description?.trim() || '',
                icon: icon || '🛡️',
            };
            // Only update privacy when an allowed value is supplied.
            if (privacy === 'open' || privacy === 'request' || privacy === 'closed') {
                patch.privacy = privacy;
            }
            await base44.asServiceRole.entities.Squad.update(squadId, patch);

            const updatedSquad = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updatedSquad });
        }

        // ----- Join Requests (privacy = 'request' flow) -----

        if (action === 'requestJoin') {
            const { squadId } = body;
            if (!squadId) return Response.json({ error: 'Couldn\'t send your join request — please refresh and try again.' }, { status: 400 });

            let squad;
            try { squad = await base44.asServiceRole.entities.Squad.get(squadId); } catch {}
            if (!squad) return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });
            if ((squad.privacy || 'open') !== 'request') {
                return Response.json({ error: 'This squad doesn\'t accept join requests.' }, { status: 400 });
            }
            if ((squad.member_count || 0) >= MAX_SQUAD_MEMBERS) {
                return Response.json({ error: 'This squad is full.' }, { status: 400 });
            }
            const existingMember = await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletAddress });
            if (existingMember.length > 0) {
                return Response.json({ error: 'You\'re already in a squad. Leave it before requesting to join another.' }, { status: 400 });
            }
            // Reject duplicates: one pending request per (squad, wallet) max.
            const existing = await base44.asServiceRole.entities.SquadJoinRequest.filter({
                squad_id: squadId,
                wallet_address: walletAddress.toLowerCase(),
                status: 'pending',
            });
            if (existing.length > 0) {
                return Response.json({ error: 'You already have a pending request to this squad.' }, { status: 409 });
            }
            const request = await base44.asServiceRole.entities.SquadJoinRequest.create({
                squad_id: squadId,
                wallet_address: walletAddress.toLowerCase(),
                player_name: authoritativeName,
                player_title: authoritativeTitle,
                status: 'pending',
            });
            return Response.json({ success: true, request });
        }

        if (action === 'approveJoin' || action === 'denyJoin') {
            const { requestId, squadId } = body;
            if (!requestId || !squadId) return Response.json({ error: 'Couldn\'t process this request — please refresh and try again.' }, { status: 400 });

            // Leader OR officer can approve/deny.
            const caller = await getCallerMember(base44, walletAddress, squadId);
            if (!caller || (caller.role !== 'leader' && caller.role !== 'officer')) {
                return Response.json({ error: 'Only leaders and officers can manage join requests.' }, { status: 403 });
            }

            let request;
            try { request = await base44.asServiceRole.entities.SquadJoinRequest.get(requestId); } catch {}
            if (!request || request.squad_id !== squadId) {
                return Response.json({ error: 'This join request no longer exists.' }, { status: 404 });
            }
            if (request.status !== 'pending') {
                return Response.json({ error: 'This request has already been handled.' }, { status: 409 });
            }

            if (action === 'denyJoin') {
                await base44.asServiceRole.entities.SquadJoinRequest.update(requestId, { status: 'denied' });
                return Response.json({ success: true });
            }

            // Approve — mirror join logic but skip the privacy gate.
            const squad = await base44.asServiceRole.entities.Squad.get(squadId);
            if (!squad) return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });
            // Race-safe cap check: use actual SquadMember row count, not cached member_count.
            const currentApproveMembers = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            if (currentApproveMembers.length >= MAX_SQUAD_MEMBERS) {
                return Response.json({ error: 'Your squad is full — kick someone first.' }, { status: 400 });
            }
            // Make sure the requester didn't already join another squad while waiting.
            const existingMember = await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: request.wallet_address });
            if (existingMember.length > 0) {
                await base44.asServiceRole.entities.SquadJoinRequest.update(requestId, { status: 'denied' });
                return Response.json({ error: 'That pilot has already joined another squad.' }, { status: 409 });
            }

            // Leave bounty stamps empty (see direct-join comment above).
            await base44.asServiceRole.entities.SquadMember.create({
                squad_id: squadId,
                wallet_address: request.wallet_address,
                player_name: request.player_name || 'Pilot',
                player_title: request.player_title || '',
                role: 'member',
                last_payout_week: '',
                last_daily_payout_date: '',
            });
            // Set member count from actual rows (race-safe).
            const verifiedApproveMembers = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            await base44.asServiceRole.entities.Squad.update(squadId, {
                member_count: verifiedApproveMembers.length,
            });
            await base44.asServiceRole.entities.SquadJoinRequest.update(requestId, { status: 'approved' });
            await base44.asServiceRole.entities.SquadMessage.create({
                squad_id: squadId,
                wallet_address: 'system',
                player_name: 'SYSTEM',
                content: `${request.player_name || 'A pilot'} has joined the squad!`,
            });
            return Response.json({ success: true });
        }

        // ----- Member Ranks (officer/member toggle) -----

        if (action === 'setRank') {
            const { targetMemberId, squadId, rank } = body;
            if (!targetMemberId || !squadId || !rank) {
                return Response.json({ error: 'Couldn\'t update rank — please refresh and try again.' }, { status: 400 });
            }
            if (rank !== 'officer' && rank !== 'member') {
                return Response.json({ error: 'Invalid rank.' }, { status: 400 });
            }
            // Only the leader can promote/demote officers.
            if (!(await isCallerLeader(base44, walletAddress, squadId))) {
                return Response.json({ error: 'Only the squad leader can change member ranks.' }, { status: 403 });
            }

            let target;
            try { target = await base44.asServiceRole.entities.SquadMember.get(targetMemberId); } catch {}
            if (!target || target.squad_id !== squadId) {
                return Response.json({ error: 'Target is not a member of this squad.' }, { status: 400 });
            }
            if (target.role === 'leader') {
                return Response.json({ error: 'Use "transfer leadership" to change the leader.' }, { status: 400 });
            }
            await base44.asServiceRole.entities.SquadMember.update(targetMemberId, { role: rank });
            return Response.json({ success: true });
        }

        if (action === 'claimWeekly' || action === 'claimDaily') {
            const { memberId, squadId } = body;
            if (!memberId || !squadId) return Response.json({ error: 'Couldn\'t claim your bounty — please refresh and try again.' }, { status: 400 });

            // Load member + squad in parallel (independent reads). Sequential
            // gets used to add ~80-150ms latency and double the rate-limit pressure
            // during the hot path of a claim — at peak the bucket would overflow
            // here before we even got to the credit step.
            const [member, squad] = await Promise.all([
                base44.asServiceRole.entities.SquadMember.get(memberId).catch(() => null),
                base44.asServiceRole.entities.Squad.get(squadId).catch(() => null),
            ]);
            if (!member) return Response.json({ error: 'You\'re no longer a member of this squad.' }, { status: 404 });
            // Case-insensitive wallet comparison — older SquadMember rows were created
            // with mixed-case wallets via the direct-join path while newer rows from
            // approveJoin are lowercase. A strict === check made every member with a
            // mismatched casing hit "You can only claim your own rewards" and silently
            // fail to claim daily/weekly squad bounties (Hugo bug 2026-05-06).
            if ((member.wallet_address || '').toLowerCase() !== (walletAddress || '').toLowerCase()) {
                return Response.json({ error: 'You can only claim your own rewards.' }, { status: 403 });
            }
            if (member.squad_id !== squadId) return Response.json({ error: 'You\'re not a member of this squad.' }, { status: 400 });

            if (!squad) return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });

            const isWeekly = action === 'claimWeekly';
            // Server-authoritative period IDs — IGNORE client values (stale tabs were
            // submitting W19 instead of W18 on Sundays, booking phantom claims).
            const periodId = isWeekly
                ? (() => {
                    const now = new Date();
                    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                    const dayNum = tmp.getUTCDay() || 7;
                    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
                    const isoYear = tmp.getUTCFullYear();
                    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
                    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
                    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
                })()
                : new Date().toISOString().split('T')[0];
            const lastClaimedField = isWeekly ? 'last_payout_week' : 'last_daily_payout_date';
            const killsField = isWeekly ? 'weekly_kills' : 'daily_kills';
            const tier = getTier(squad.level || 1, isWeekly ? WEEKLY_BOUNTY_TIERS : DAILY_BOUNTY_TIERS);

            // Check already claimed
            if (member[lastClaimedField] === periodId) {
                return Response.json({ error: 'You\'ve already claimed this bounty.', alreadyClaimed: true }, { status: 409 });
            }
            // Check progress threshold met
            if ((squad[killsField] || 0) < tier.target) {
                return Response.json({ error: 'Your squad hasn\'t reached the kill target yet.' }, { status: 400 });
            }

            // Mark claimed FIRST so concurrent calls fail
            await with429Retry(
                () => base44.asServiceRole.entities.SquadMember.update(memberId, { [lastClaimedField]: periodId }),
                'mark_claimed'
            );

            // Grant rewards to player's cloud PlayerSave. If credit fails after
            // 4 retries, ROLL BACK the claim stamp so the player can simply
            // click again in a few seconds — much better UX than locking them
            // out and forcing manual admin payout. Discord alert still fires
            // so we can see persistent failure patterns.
            let updatedTotals;
            try {
                updatedTotals = await grantToPlayerSave(base44, walletAddress, tier.gold, tier.fragments);
            } catch (creditErr) {
                console.error('[squadActions] credit failed, rolling back claim:', creditErr.message);
                // Restore the previous claim stamp so the player isn't locked out.
                try {
                    await with429Retry(
                        () => base44.asServiceRole.entities.SquadMember.update(memberId, {
                            [lastClaimedField]: member[lastClaimedField] || ''
                        }),
                        'rollback_claim'
                    );
                } catch (rollbackErr) {
                    // Rollback itself failed — NOW it's a real unpaid bounty. Alert.
                    console.error('[squadActions] CRITICAL: rollback failed too:', rollbackErr.message);
                    alertUnpaidBounty(walletAddress, isWeekly ? 'weekly' : 'daily', tier.gold, tier.fragments, `credit: ${creditErr.message} | rollback: ${rollbackErr.message}`);
                }
                return Response.json({
                    error: 'The server is busy right now — please tap Claim again in a few seconds.',
                    retryable: true,
                }, { status: 503 });
            }

            // Award daily squad XP — ONCE per day, on the first member's daily claim.
            // Gives squads a steady drip of progression between weekly resets.
            let dailyXpAwarded = 0;
            if (!isWeekly && squad.last_daily_xp_award_date !== periodId) {
                dailyXpAwarded = getDailyXpForLevel(squad.level || 1);
                const newXp = (squad.xp || 0) + dailyXpAwarded;
                const newLevel = computeSquadLevel(newXp);
                await base44.asServiceRole.entities.Squad.update(squadId, {
                    xp: newXp,
                    level: newLevel,
                    last_daily_xp_award_date: periodId,
                });
            }

            return Response.json({
                success: true,
                reward: { gold: tier.gold, fragments: tier.fragments },
                saveData: updatedTotals,
                member: { ...member, [lastClaimedField]: periodId },
                dailyXpAwarded,
            });
        }

        if (action === 'resetPeriods') {
            // Server-authoritative period rollover. We IGNORE the client's `current_week`
            // and `current_day` values (stale browser tabs with the old buggy formula were
            // pushing W19 here on Sundays, wiping kills mid-week). Server computes the
            // canonical ISO week + today's UTC date and only resets if the squad is
            // genuinely on a stale period.
            const { squadId } = body;
            if (!squadId) return Response.json({ error: 'Couldn\'t update squad — please refresh and try again.' }, { status: 400 });

            // Verify caller is a member of this squad.
            const memberRecords = await base44.asServiceRole.entities.SquadMember.filter({
                squad_id: squadId,
                wallet_address: walletAddress
            });
            if (memberRecords.length === 0) {
                return Response.json({ error: 'You\'re not a member of this squad.' }, { status: 403 });
            }

            // Canonical ISO 8601 week (Mon-start, Sun 23:59 UTC end).
            const canonicalWeek = (() => {
                const now = new Date();
                const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                const dayNum = tmp.getUTCDay() || 7;
                tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
                const isoYear = tmp.getUTCFullYear();
                const yearStart = new Date(Date.UTC(isoYear, 0, 1));
                const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
                return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
            })();
            const canonicalDay = new Date().toISOString().split('T')[0];

            const squad = await base44.asServiceRole.entities.Squad.get(squadId);
            if (!squad) return Response.json({ error: 'Squad not found.' }, { status: 404 });

            const safePatch = {};
            // Detect malformed current_week stamps (anything not in "YYYY-Www" format).
            // The old createSquad stamped a date ("2026-05-12") here, which lexicographically
            // compares SMALLER than any "YYYY-Www" string — so the wipe branch below fires
            // every page load and the squad's weekly_kills appear to reset day-to-day
            // (Anubis bug 2026-05-12). Heal those without zeroing kills.
            const isCanonicalWeekFormat = /^\d{4}-W\d{2}$/.test(squad.current_week || '');
            if (!isCanonicalWeekFormat) {
                safePatch.current_week = canonicalWeek;
            } else if (squad.current_week < canonicalWeek) {
                // Weekly rollover: stored week is BEHIND canonical. Roll weekly_kills into XP,
                // zero weekly_kills, stamp canonical week. Also recompute level so squads
                // that grow past a tier threshold during rollover see their new rank
                // immediately (previously `level` only advanced on the next daily bounty).
                safePatch.current_week = canonicalWeek;
                safePatch.weekly_kills = 0;
                safePatch.xp = (squad.xp || 0) + (squad.weekly_kills || 0);
                safePatch.level = computeSquadLevel(safePatch.xp);
            } else if (squad.current_week !== canonicalWeek) {
                // Squad is stamped with a FUTURE week (corrupted by the old buggy client).
                // Heal it without wiping kills — those kills were earned in the real current week.
                safePatch.current_week = canonicalWeek;
            }

            // Daily rollover: only when stored day is behind today.
            if (squad.current_day && squad.current_day < canonicalDay) {
                safePatch.current_day = canonicalDay;
                safePatch.daily_kills = 0;
            } else if (squad.current_day !== canonicalDay) {
                safePatch.current_day = canonicalDay;
            }

            // Treasury buff rollover (2026-06-16): if the active buff's week has
            // passed, clear it. If a pending buff is stamped for the current
            // (or any past-or-equal) week, roll it into the active slot.
            const activeBuffWeek = squad.active_buff_week_id || '';
            if (squad.active_buff_tier && activeBuffWeek && activeBuffWeek < canonicalWeek) {
                safePatch.active_buff_tier = '';
                safePatch.active_buff_week_id = '';
            }
            const pendingBuffWeek = squad.pending_buff_week_id || '';
            if (squad.pending_buff_tier && pendingBuffWeek && pendingBuffWeek <= canonicalWeek) {
                // Pending buff is now current (or overdue) — promote it.
                safePatch.active_buff_tier = squad.pending_buff_tier;
                safePatch.active_buff_week_id = pendingBuffWeek;
                safePatch.pending_buff_tier = '';
                safePatch.pending_buff_week_id = '';
            }

            if (Object.keys(safePatch).length === 0) {
                // Nothing to reset — squad is already on the canonical period.
                return Response.json({ success: true, squad });
            }

            // TOCTOU guard (Texxy bug 2026-05-15 — "daily kills reset a double time"):
            // saveScore and resetPeriods both reset daily_kills at UTC rollover. If a
            // squadmate finishes a run at 00:00:05 and writes daily_kills=200 with
            // current_day=today, then another member opens the Squad page at 00:00:10,
            // resetPeriods read the squad row BEFORE that write replicated, saw
            // current_day=yesterday, and wiped the 200 kills back to 0.
            //
            // Fix: re-fetch the row immediately before the update. If another writer
            // has already advanced current_day to canonicalDay, drop the daily wipe
            // from the patch — saveScore (or a previous resetPeriods call) has already
            // handled the rollover and any kills posted since then are legitimate.
            if (safePatch.daily_kills === 0) {
                try {
                    const fresh = await base44.asServiceRole.entities.Squad.get(squadId);
                    if (fresh && fresh.current_day === canonicalDay) {
                        // Another writer (likely saveScore) already rolled the day over.
                        // Don't touch daily_kills — saveScore already zeroed it and added
                        // its own kills on top. Wiping again would erase those kills.
                        delete safePatch.daily_kills;
                        delete safePatch.current_day;
                        if (Object.keys(safePatch).length === 0) {
                            return Response.json({ success: true, squad: fresh });
                        }
                    }
                } catch {}
            }

            await base44.asServiceRole.entities.Squad.update(squadId, safePatch);
            const updatedSquad = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updatedSquad });
        }

        // ----- Daily Goal (leader-set squad-wide goal that broadcasts a banner) -----

        if (action === 'setDailyGoal') {
            const { squadId, goalType, target, label, durationHours } = body;
            if (!squadId || !label) {
                return Response.json({ error: 'Couldn\'t set the goal — please refresh and try again.' }, { status: 400 });
            }
            // Only the squad leader can set a daily goal.
            if (!(await isCallerLeader(base44, walletAddress, squadId))) {
                return Response.json({ error: 'Only the squad leader can set a daily goal.' }, { status: 403 });
            }
            const safeType = (goalType === 'custom') ? 'custom' : 'kills';
            const safeTarget = safeType === 'kills' ? Math.max(1, Math.min(100000, parseInt(target, 10) || 100)) : 0;
            const hours = Math.max(1, Math.min(48, parseInt(durationHours, 10) || 24));
            const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

            // Deactivate any previous active goal for this squad before creating the new one.
            const existing = await base44.asServiceRole.entities.SquadDailyGoal.filter({ squad_id: squadId, is_active: true });
            for (const g of existing) {
                try { await base44.asServiceRole.entities.SquadDailyGoal.update(g.id, { is_active: false }); } catch {}
            }

            const goal = await base44.asServiceRole.entities.SquadDailyGoal.create({
                squad_id: squadId,
                goal_type: safeType,
                target: safeTarget,
                label: String(label).substring(0, 120),
                set_by_wallet: walletAddress,
                set_by_name: authoritativeName,
                expires_at: expiresAt,
                is_active: true,
            });

            // Drop a SYSTEM message into squad chat so members see it immediately.
            try {
                await base44.asServiceRole.entities.SquadMessage.create({
                    squad_id: squadId,
                    wallet_address: 'system',
                    player_name: 'SYSTEM',
                    content: `🎯 Daily goal set by ${authoritativeName}: ${goal.label}`,
                });
            } catch {}

            return Response.json({ success: true, goal });
        }

        if (action === 'clearDailyGoal') {
            const { squadId } = body;
            if (!squadId) return Response.json({ error: 'Couldn\'t clear the goal — please refresh and try again.' }, { status: 400 });
            if (!(await isCallerLeader(base44, walletAddress, squadId))) {
                return Response.json({ error: 'Only the squad leader can clear the daily goal.' }, { status: 403 });
            }
            const active = await base44.asServiceRole.entities.SquadDailyGoal.filter({ squad_id: squadId, is_active: true });
            for (const g of active) {
                try { await base44.asServiceRole.entities.SquadDailyGoal.update(g.id, { is_active: false }); } catch {}
            }
            return Response.json({ success: true });
        }

        if (action === 'getDailyGoal') {
            const { squadId } = body;
            if (!squadId) return Response.json({ goal: null });
            const active = await base44.asServiceRole.entities.SquadDailyGoal.filter({ squad_id: squadId, is_active: true }, '-created_date', 5);
            // Auto-expire any goal past its deadline (cheap inline cleanup).
            const now = Date.now();
            let live = null;
            for (const g of active) {
                const exp = g.expires_at ? new Date(g.expires_at).getTime() : 0;
                if (exp && exp < now) {
                    try { await base44.asServiceRole.entities.SquadDailyGoal.update(g.id, { is_active: false }); } catch {}
                } else if (!live) {
                    live = g;
                }
            }
            return Response.json({ goal: live });
        }

        // ----- Member Activity (leader dashboard contribution feed) -----

        if (action === 'getMemberActivity') {
            const { squadId } = body;
            if (!squadId) return Response.json({ activity: [], members: [] });
            // Verify caller is in this squad (any member can read; leader UI gates the page).
            const memberRecords = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            const isInSquad = memberRecords.some(m => m.wallet_address?.toLowerCase() === walletAddress.toLowerCase());
            if (!isInSquad) {
                return Response.json({ error: 'You\'re not a member of this squad.' }, { status: 403 });
            }

            // Recent runs by every squad member in the past 7 days.
            const wallets = memberRecords.map(m => m.wallet_address).filter(Boolean);
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const allRuns = [];
            for (const w of wallets) {
                try {
                    const runs = await base44.asServiceRole.entities.RunScore.filter({ wallet_address: w }, '-created_date', 20);
                    for (const r of runs) {
                        const ts = new Date(r.created_date).getTime();
                        if (ts >= sevenDaysAgo) allRuns.push(r);
                    }
                } catch {}
            }
            allRuns.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            const activity = allRuns.slice(0, 50).map(r => ({
                id: r.id,
                wallet_address: r.wallet_address,
                player_name: r.player_name,
                kills: r.kills || 0,
                score: r.score || 0,
                level: r.level || 1,
                time_survived: r.time_survived || 0,
                character_id: r.character_id,
                arena_id: r.arena_id,
                created_date: r.created_date,
            }));

            // Per-member summary: total kills + last run timestamp (used for kick-inactive UI).
            const summaryByWallet = {};
            for (const m of memberRecords) {
                const w = (m.wallet_address || '').toLowerCase();
                summaryByWallet[w] = {
                    member_id: m.id,
                    wallet_address: m.wallet_address,
                    player_name: m.player_name,
                    role: m.role,
                    runs_7d: 0,
                    kills_7d: 0,
                    last_run_at: null,
                };
            }
            for (const r of allRuns) {
                const w = (r.wallet_address || '').toLowerCase();
                const s = summaryByWallet[w];
                if (!s) continue;
                s.runs_7d += 1;
                s.kills_7d += (r.kills || 0);
                const ts = new Date(r.created_date).getTime();
                if (!s.last_run_at || ts > new Date(s.last_run_at).getTime()) s.last_run_at = r.created_date;
            }
            const members = Object.values(summaryByWallet);

            return Response.json({ activity, members });
        }

        // ----- S6 Squad Treasury (Phase 3c) -----
        // Members donate gold to a shared squad pool. Once the pool reaches a tier
        // threshold, the leader can ACTIVATE a buff for the upcoming war week.
        // Active buffs apply during the week tracked by `active_buff_week_id` and
        // are read by the engine + war scoring (additive bonuses, no stacking).
        // Hard-gated to S6+ via period check — pre-rollover both actions return 403.
        if (action === 'donateTreasury' || action === 'activateBuff' || action === 'getTreasury') {
            const isS6 = (() => {
                const now = new Date();
                const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                const dayNum = tmp.getUTCDay() || 7;
                tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
                const isoYear = tmp.getUTCFullYear();
                const yearStart = new Date(Date.UTC(isoYear, 0, 1));
                const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
                const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
                return `${isoYear}-S${seasonNum}` !== '2026-S5';
            })();
            if (!isS6) {
                return Response.json({ error: 'Squad Treasury unlocks in Season 6.' }, { status: 403 });
            }

            // Tier table — locked per master plan §5c. Costs are CUMULATIVE thresholds
            // (treasury must hold ≥ this amount to activate). Activation drains exactly
            // the cost from the pool. Buffs last one full ISO week.
            const TREASURY_TIERS = {
                bronze:   { cost: 25_000,    label: 'Bronze' },
                silver:   { cost: 100_000,   label: 'Silver' },
                gold:     { cost: 500_000,   label: 'Gold' },
                platinum: { cost: 2_000_000, label: 'Platinum' },
            };

            const { squadId } = body;
            if (!squadId) return Response.json({ error: 'Couldn\'t access squad treasury — please refresh.' }, { status: 400 });

            // Caller must be a squad member.
            const caller = await getCallerMember(base44, walletAddress, squadId);
            if (!caller) {
                return Response.json({ error: 'You\'re not a member of this squad.' }, { status: 403 });
            }

            const squad = await base44.asServiceRole.entities.Squad.get(squadId);
            if (!squad) return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });

            // Server-canonical current ISO week — shared by both actions.
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

            // Two real storage slots (2026-06-16 refactor — Cosmic Sloths bug):
            //   - active_buff_*  = buff currently in effect THIS week.
            //   - pending_buff_* = buff pre-purchased for a FUTURE week.
            // Pending → active rollover happens in `resetPeriods` when week advances.
            // We still self-heal here: if active_* points to a past week we treat
            // it as empty (display only — no destructive write from this read path).
            const activeStampedWeek = squad.active_buff_week_id || '';
            const activeIsLive = !!(squad.active_buff_tier && activeStampedWeek === currentWeekId);
            const activeBuffTier = activeIsLive ? squad.active_buff_tier : '';

            const pendingStampedWeek = squad.pending_buff_week_id || '';
            const pendingIsFuture = !!(squad.pending_buff_tier && pendingStampedWeek > currentWeekId);
            const pendingBuffTier = pendingIsFuture ? squad.pending_buff_tier : '';

            if (action === 'getTreasury') {
                return Response.json({
                    treasury_gold: squad.treasury_gold || 0,
                    treasury_total_donated: squad.treasury_total_donated || 0,
                    // Buff currently in effect this week (display only — does not block new purchases).
                    active_buff_tier: activeBuffTier,
                    active_buff_week_id: activeBuffTier ? activeStampedWeek : '',
                    // Buff already pre-purchased for a future week (blocks new buys / allows upgrade).
                    pending_buff_tier: pendingBuffTier,
                    pending_buff_week_id: pendingBuffTier ? pendingStampedWeek : '',
                    current_week_id: currentWeekId,
                });
            }

            if (action === 'donateTreasury') {
                const amount = Math.max(1, Math.floor(Number(body.amount) || 0));
                if (amount <= 0) return Response.json({ error: 'Donation must be greater than zero.' }, { status: 400 });
                // Hard upper bound to prevent runaway typos / cheaters from emptying their save in one click.
                if (amount > 10_000_000) {
                    return Response.json({ error: 'Donation exceeds the per-action limit (10,000,000).' }, { status: 400 });
                }

                // Deduct from donor's PlayerSave (server-authoritative).
                const walletLower = walletAddress.toLowerCase();
                const saveRecords = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower });
                if (saveRecords.length === 0) {
                    return Response.json({ error: 'Your save couldn\'t be found.' }, { status: 400 });
                }
                const saveRecord = saveRecords[0];
                const saveData = typeof saveRecord.save_data === 'string' ? JSON.parse(saveRecord.save_data) : saveRecord.save_data;
                const playerGold = Number(saveData.gold || 0);
                if (playerGold < amount) {
                    return Response.json({
                        error: `Not enough gold — you need ${amount.toLocaleString()} but have ${playerGold.toLocaleString()}.`
                    }, { status: 400 });
                }

                const updatedSave = { ...saveData, gold: playerGold - amount, updated_at: Date.now() };
                await base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                    save_data: updatedSave,
                    updated_at: Date.now(),
                });

                const newTreasury = (squad.treasury_gold || 0) + amount;
                const newTotal = (squad.treasury_total_donated || 0) + amount;
                await base44.asServiceRole.entities.Squad.update(squadId, {
                    treasury_gold: newTreasury,
                    treasury_total_donated: newTotal,
                });

                // System message in squad chat for transparency.
                try {
                    await base44.asServiceRole.entities.SquadMessage.create({
                        squad_id: squadId,
                        wallet_address: 'system',
                        player_name: 'SYSTEM',
                        content: `💰 ${authoritativeName} donated ${amount.toLocaleString()} gold to the treasury.`,
                    });
                } catch {}

                // Audit log so admin gold-audit picks up treasury donations.
                try {
                    await base44.asServiceRole.entities.GoldSpendLog.create({
                        wallet_address: walletLower,
                        player_name: authoritativeName,
                        amount,
                        balance_before: playerGold,
                        balance_after: updatedSave.gold,
                        grant_info: { type: 'squad_treasury_donation', squadId },
                        week_id: currentWeekId,
                        season_id: '',
                    });
                } catch {}

                return Response.json({
                    success: true,
                    treasury_gold: newTreasury,
                    treasury_total_donated: newTotal,
                    saveData: { gold: updatedSave.gold },
                });
            }

            if (action === 'activateBuff') {
                // Only the leader (or officers) can spend the treasury.
                if (caller.role !== 'leader' && caller.role !== 'officer') {
                    return Response.json({ error: 'Only the squad leader or officers can activate treasury buffs.' }, { status: 403 });
                }
                const tierKey = body.tier;
                const tier = TREASURY_TIERS[tierKey];
                if (!tier) return Response.json({ error: 'Invalid buff tier.' }, { status: 400 });

                // CONCURRENCY GUARD (Waeoo bug 2026-06-15 — "2 players shouldnt be
                // able to buy the buff twice"). The `squad` row was read way back at
                // line ~948 before the action branch. If two officers click Activate
                // near-simultaneously, both stale reads showed active_buff_tier='' and
                // both writes went through — squad got double-charged and posted two
                // SYSTEM messages (Texxy + Waeoo both bought Platinum for W26).
                //
                // Fix: re-fetch the squad row RIGHT before the write and re-derive
                // liveBuffTier from the fresh data. If another writer beat us to it
                // for the SAME target week, return 409 instead of charging again.
                const freshSquad = await base44.asServiceRole.entities.Squad.get(squadId);
                if (!freshSquad) return Response.json({ error: 'This squad no longer exists.' }, { status: 404 });

                // Compute the week the buff would land on if it activated now (mirrors
                // the locked rule: new buff applies to NEXT week, upgrade stays on the
                // active buff's existing week).
                const computeNextWeek = (wk) => {
                    const m = wk.match(/^(\d{4})-W(\d{2})$/);
                    if (!m) return wk;
                    const year = parseInt(m[1], 10);
                    const w = parseInt(m[2], 10);
                    if (w >= 52) return `${year + 1}-W01`;
                    return `${year}-W${String(w + 1).padStart(2, '0')}`;
                };

                // Re-derive both slots from the fresh row.
                const freshActiveWeek = freshSquad.active_buff_week_id || '';
                const freshActiveTier = (freshSquad.active_buff_tier && freshActiveWeek === currentWeekId)
                    ? freshSquad.active_buff_tier
                    : '';
                const freshPendingWeek = freshSquad.pending_buff_week_id || '';
                const freshPendingTier = (freshSquad.pending_buff_tier && freshPendingWeek > currentWeekId)
                    ? freshSquad.pending_buff_tier
                    : '';

                const treasury = freshSquad.treasury_gold || 0;
                let chargeAmount = tier.cost;
                let targetWeek;
                let writeSlot; // 'active' or 'pending'

                if (freshPendingTier) {
                    // Already pre-purchased for a future week — block duplicate / upgrade only.
                    const liveCost = TREASURY_TIERS[freshPendingTier]?.cost || 0;
                    if (freshPendingTier === tierKey) {
                        return Response.json({
                            error: `Your squad already activated a ${tier.label} buff for ${freshPendingWeek}.`,
                            alreadyActive: true,
                        }, { status: 409 });
                    }
                    if (tier.cost <= liveCost) {
                        return Response.json({ error: 'You can only upgrade to a higher-tier buff (no downgrades).' }, { status: 400 });
                    }
                    chargeAmount = tier.cost - liveCost;
                    targetWeek = freshPendingWeek;
                    writeSlot = 'pending';
                } else if (freshActiveTier) {
                    // Current-week buff already running — new purchase goes into the pending slot for next week.
                    targetWeek = computeNextWeek(currentWeekId);
                    writeSlot = 'pending';
                } else {
                    // No active or pending buff — this purchase activates THIS week immediately.
                    targetWeek = currentWeekId;
                    writeSlot = 'active';
                }

                if (treasury < chargeAmount) {
                    return Response.json({
                        error: `Treasury holds ${treasury.toLocaleString()} — needs ${chargeAmount.toLocaleString()} ${freshPendingTier ? 'to upgrade' : `for ${tier.label}`}.`
                    }, { status: 400 });
                }

                const patch = { treasury_gold: treasury - chargeAmount };
                if (writeSlot === 'active') {
                    patch.active_buff_tier = tierKey;
                    patch.active_buff_week_id = targetWeek;
                } else {
                    patch.pending_buff_tier = tierKey;
                    patch.pending_buff_week_id = targetWeek;
                }
                await base44.asServiceRole.entities.Squad.update(squadId, patch);

                try {
                    await base44.asServiceRole.entities.SquadMessage.create({
                        squad_id: squadId,
                        wallet_address: 'system',
                        player_name: 'SYSTEM',
                        content: freshPendingTier
                            ? `⭐ ${authoritativeName} upgraded the treasury buff to ${tier.label} for ${targetWeek} (paid ${chargeAmount.toLocaleString()} difference)!`
                            : `⭐ ${authoritativeName} activated a ${tier.label} treasury buff for ${targetWeek}!`,
                    });
                } catch {}

                return Response.json({
                    success: true,
                    treasury_gold: treasury - chargeAmount,
                    // Return BOTH slots so the UI updates correctly regardless of which we wrote.
                    active_buff_tier: writeSlot === 'active' ? tierKey : freshActiveTier,
                    active_buff_week_id: writeSlot === 'active' ? targetWeek : (freshActiveTier ? freshActiveWeek : ''),
                    pending_buff_tier: writeSlot === 'pending' ? tierKey : freshPendingTier,
                    pending_buff_week_id: writeSlot === 'pending' ? targetWeek : (freshPendingTier ? freshPendingWeek : ''),
                    upgraded: !!freshPendingTier,
                });
            }
        }

        return Response.json({ error: 'Couldn\'t process this request — please refresh and try again.' }, { status: 400 });
    } catch (error) {
        console.error('[squadActions]', error.message);
        return Response.json({ error: 'Something went wrong with your squad. Please try again.' }, { status: 500 });
    }
});