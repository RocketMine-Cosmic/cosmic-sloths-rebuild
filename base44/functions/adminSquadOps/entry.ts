import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only squad operations hub. One endpoint, many actions — so the admin
// dashboard's Squads tab can sort out anything squad-related without needing
// individual backend functions per knob.
//
// Auth: Base44 session → wallet → AdminWallet lookup. Every mutation writes
// an AdminChangesLog row so we can trace who changed what.

const ALLOWED_BUFF_TIERS = ['', 'bronze', 'silver', 'gold', 'platinum'];
const ALLOWED_ROLES = ['leader', 'officer', 'member'];
const ALLOWED_PRIVACY = ['open', 'request', 'closed'];

function isValidWeekId(w) {
    return typeof w === 'string' && /^\d{4}-W\d{2}$/.test(w);
}

async function audit(base44, wallet, description, details) {
    try {
        await base44.asServiceRole.entities.AdminChangesLog.create({
            wallet_address: wallet,
            action_type: 'other',
            description,
            details: details || {},
        });
    } catch {}
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const body = await req.json();
        const { action, squadId } = body;

        // ----- READ: full squad detail bundle -----
        if (action === 'getSquadDetail') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const squad = await base44.asServiceRole.entities.Squad.get(squadId).catch(() => null);
            if (!squad) return Response.json({ error: 'Squad not found' }, { status: 404 });

            const [members, recentMessages, currentWars, joinRequests] = await Promise.all([
                base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId }),
                base44.asServiceRole.entities.SquadMessage.filter({ squad_id: squadId }, '-created_date', 30),
                base44.asServiceRole.entities.SquadWar.filter({ $or: [{ squad_a_id: squadId }, { squad_b_id: squadId }] }, '-created_date', 10),
                base44.asServiceRole.entities.SquadJoinRequest.filter({ squad_id: squadId, status: 'pending' }, '-created_date', 30).catch(() => []),
            ]);

            return Response.json({ squad, members, recentMessages, recentWars: currentWars, joinRequests });
        }

        // ----- WRITE: core squad fields (name/tag/icon/description/privacy/level/xp/member_count) -----
        if (action === 'updateCore') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const { name, tag, icon, description, privacy, level, xp, weekly_kills, daily_kills, member_count } = body;
            const patch = {};
            if (typeof name === 'string') patch.name = name.trim();
            if (typeof tag === 'string') patch.tag = tag.trim().toUpperCase().substring(0, 4);
            if (typeof icon === 'string') patch.icon = icon;
            if (typeof description === 'string') patch.description = description;
            if (typeof privacy === 'string' && ALLOWED_PRIVACY.includes(privacy)) patch.privacy = privacy;
            if (Number.isFinite(level)) patch.level = Math.max(1, Math.min(7, Math.floor(level)));
            if (Number.isFinite(xp)) patch.xp = Math.max(0, Math.floor(xp));
            if (Number.isFinite(weekly_kills)) patch.weekly_kills = Math.max(0, Math.floor(weekly_kills));
            if (Number.isFinite(daily_kills)) patch.daily_kills = Math.max(0, Math.floor(daily_kills));
            if (Number.isFinite(member_count)) patch.member_count = Math.max(0, Math.floor(member_count));
            if (Object.keys(patch).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

            await base44.asServiceRole.entities.Squad.update(squadId, patch);
            await audit(base44, callerWallet, `Squad core updated: ${squadId}`, { squadId, patch });
            const updated = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updated });
        }

        // ----- WRITE: treasury gold + lifetime donated -----
        if (action === 'updateTreasuryGold') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const { treasury_gold, treasury_total_donated } = body;
            const patch = {};
            if (Number.isFinite(treasury_gold)) patch.treasury_gold = Math.max(0, Math.floor(treasury_gold));
            if (Number.isFinite(treasury_total_donated)) patch.treasury_total_donated = Math.max(0, Math.floor(treasury_total_donated));
            if (Object.keys(patch).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });
            await base44.asServiceRole.entities.Squad.update(squadId, patch);
            await audit(base44, callerWallet, `Squad treasury gold updated: ${squadId}`, { squadId, patch });
            const updated = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updated });
        }

        // ----- WRITE: buff slots (active + pending). Empty tier clears the slot. -----
        if (action === 'setBuffs') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const { active_buff_tier, active_buff_week_id, pending_buff_tier, pending_buff_week_id } = body;
            const patch = {};
            if (active_buff_tier !== undefined) {
                if (!ALLOWED_BUFF_TIERS.includes(active_buff_tier)) return Response.json({ error: 'Invalid active tier' }, { status: 400 });
                patch.active_buff_tier = active_buff_tier;
                patch.active_buff_week_id = active_buff_tier ? (isValidWeekId(active_buff_week_id) ? active_buff_week_id : '') : '';
                if (active_buff_tier && !patch.active_buff_week_id) return Response.json({ error: 'active_buff_week_id required (format YYYY-Www)' }, { status: 400 });
            }
            if (pending_buff_tier !== undefined) {
                if (!ALLOWED_BUFF_TIERS.includes(pending_buff_tier)) return Response.json({ error: 'Invalid pending tier' }, { status: 400 });
                patch.pending_buff_tier = pending_buff_tier;
                patch.pending_buff_week_id = pending_buff_tier ? (isValidWeekId(pending_buff_week_id) ? pending_buff_week_id : '') : '';
                if (pending_buff_tier && !patch.pending_buff_week_id) return Response.json({ error: 'pending_buff_week_id required (format YYYY-Www)' }, { status: 400 });
            }
            if (Object.keys(patch).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });
            await base44.asServiceRole.entities.Squad.update(squadId, patch);
            await audit(base44, callerWallet, `Squad buffs updated: ${squadId}`, { squadId, patch });
            const updated = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updated });
        }

        // ----- WRITE: war record (wins/losses/ties/streak) -----
        if (action === 'updateWarRecord') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const { war_wins, war_losses, war_ties, war_streak } = body;
            const patch = {};
            if (Number.isFinite(war_wins)) patch.war_wins = Math.max(0, Math.floor(war_wins));
            if (Number.isFinite(war_losses)) patch.war_losses = Math.max(0, Math.floor(war_losses));
            if (Number.isFinite(war_ties)) patch.war_ties = Math.max(0, Math.floor(war_ties));
            if (Number.isFinite(war_streak)) patch.war_streak = Math.max(0, Math.floor(war_streak));
            if (Object.keys(patch).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });
            await base44.asServiceRole.entities.Squad.update(squadId, patch);
            await audit(base44, callerWallet, `Squad war record updated: ${squadId}`, { squadId, patch });
            const updated = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updated });
        }

        // ----- WRITE: member role / rename / kick -----
        if (action === 'setMemberRole') {
            const { memberId, role } = body;
            if (!memberId || !ALLOWED_ROLES.includes(role)) return Response.json({ error: 'memberId + valid role required' }, { status: 400 });
            const target = await base44.asServiceRole.entities.SquadMember.get(memberId).catch(() => null);
            if (!target) return Response.json({ error: 'Member not found' }, { status: 404 });
            // If promoting to leader, demote existing leader to officer to keep a single leader.
            if (role === 'leader') {
                const others = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: target.squad_id, role: 'leader' });
                for (const o of others) {
                    if (o.id !== memberId) {
                        await base44.asServiceRole.entities.SquadMember.update(o.id, { role: 'officer' });
                    }
                }
            }
            await base44.asServiceRole.entities.SquadMember.update(memberId, { role });
            await audit(base44, callerWallet, `Squad member role set: ${memberId} → ${role}`, { memberId, squadId: target.squad_id, role });
            return Response.json({ success: true });
        }

        if (action === 'renameMember') {
            const { memberId, player_name } = body;
            if (!memberId || typeof player_name !== 'string') return Response.json({ error: 'memberId + player_name required' }, { status: 400 });
            const clean = player_name.trim().substring(0, 32);
            if (!clean) return Response.json({ error: 'Name cannot be empty' }, { status: 400 });
            await base44.asServiceRole.entities.SquadMember.update(memberId, { player_name: clean });
            await audit(base44, callerWallet, `Squad member renamed: ${memberId}`, { memberId, player_name: clean });
            return Response.json({ success: true });
        }

        if (action === 'kickMember') {
            const { memberId } = body;
            if (!memberId) return Response.json({ error: 'memberId required' }, { status: 400 });
            const target = await base44.asServiceRole.entities.SquadMember.get(memberId).catch(() => null);
            if (!target) return Response.json({ error: 'Member not found' }, { status: 404 });
            await base44.asServiceRole.entities.SquadMember.delete(memberId);
            // Reconcile member_count from actual rows.
            try {
                const remaining = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: target.squad_id });
                await base44.asServiceRole.entities.Squad.update(target.squad_id, { member_count: remaining.length });
            } catch {}
            await audit(base44, callerWallet, `Squad member kicked: ${memberId}`, { memberId, squadId: target.squad_id, wallet_address: target.wallet_address });
            return Response.json({ success: true });
        }

        // ----- WRITE: reconcile member_count + reset period stamps if requested -----
        if (action === 'reconcileMemberCount') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const members = await base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId });
            await base44.asServiceRole.entities.Squad.update(squadId, { member_count: members.length });
            await audit(base44, callerWallet, `Squad member_count reconciled: ${squadId}`, { squadId, member_count: members.length });
            const updated = await base44.asServiceRole.entities.Squad.get(squadId);
            return Response.json({ success: true, squad: updated, member_count: members.length });
        }

        // ----- DESTRUCTIVE: delete squad (members preserved as orphans for audit, or we cascade) -----
        if (action === 'deleteSquad') {
            if (!squadId) return Response.json({ error: 'squadId required' }, { status: 400 });
            const { confirm } = body;
            if (confirm !== 'DELETE') return Response.json({ error: 'Confirmation phrase "DELETE" required' }, { status: 400 });
            // Cascade: delete members, join requests, messages. War rows are historical — leave intact.
            const [members, requests, messages] = await Promise.all([
                base44.asServiceRole.entities.SquadMember.filter({ squad_id: squadId }),
                base44.asServiceRole.entities.SquadJoinRequest.filter({ squad_id: squadId }).catch(() => []),
                base44.asServiceRole.entities.SquadMessage.filter({ squad_id: squadId }, '-created_date', 500),
            ]);
            for (const m of members) { try { await base44.asServiceRole.entities.SquadMember.delete(m.id); } catch {} }
            for (const r of requests) { try { await base44.asServiceRole.entities.SquadJoinRequest.delete(r.id); } catch {} }
            for (const msg of messages) { try { await base44.asServiceRole.entities.SquadMessage.delete(msg.id); } catch {} }
            await base44.asServiceRole.entities.Squad.delete(squadId);
            await audit(base44, callerWallet, `Squad DELETED: ${squadId}`, {
                squadId,
                cascaded: { members: members.length, requests: requests.length, messages: messages.length },
            });
            return Response.json({ success: true, cascaded: { members: members.length, requests: requests.length, messages: messages.length } });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('[adminSquadOps]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});