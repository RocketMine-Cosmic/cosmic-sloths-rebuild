import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function postDiscordMod(payload) {
    const url = Deno.env.get('DISCORD_MOD_WEBHOOK');
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{ ...payload, color: 0xea580c, timestamp: new Date().toISOString() }] }),
        });
    } catch {}
}

// Auth: Base44 session + 'moderate_chat' permission, OR emergency master key.
// Actions:
//   - 'mute'   { walletAddress, durationMinutes?, reason?, playerName? }
//                durationMinutes omitted/0 = permanent until lifted
//   - 'unmute' { walletAddress }
//   - 'list'   → returns active mutes (server-side filters out expired)

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { action, adminKey, walletAddress, durationMinutes, reason, playerName } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('moderate_chat') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'moderate_chat' permission required" }, { status: 403 });
            }
        }

        if (action === 'list') {
            const all = await base44.asServiceRole.entities.MutedWallet.list('-created_date', 500);
            const now = Date.now();
            const active = [];
            for (const m of all) {
                const until = m.muted_until ? new Date(m.muted_until).getTime() : null;
                if (until && until < now) {
                    // Auto-clean expired mutes
                    try { await base44.asServiceRole.entities.MutedWallet.delete(m.id); } catch {}
                    continue;
                }
                active.push(m);
            }
            return Response.json({ mutes: active });
        }

        const wallet = (walletAddress || '').toLowerCase().trim();
        if (!wallet) return Response.json({ error: 'walletAddress required' }, { status: 400 });

        if (action === 'unmute') {
            const existing = await base44.asServiceRole.entities.MutedWallet.filter({ wallet_address: wallet });
            for (const e of existing) {
                try { await base44.asServiceRole.entities.MutedWallet.delete(e.id); } catch {}
            }
            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'other',
                    description: `Unmuted ${playerName || wallet}`,
                    details: { wallet, removed_count: existing.length },
                });
            } catch {}
            postDiscordMod({
                title: '🔊 Wallet unmuted',
                fields: [
                    { name: 'Player', value: playerName || '(unknown)', inline: true },
                    { name: 'By moderator', value: `\`${callerWallet}\``, inline: true },
                    { name: 'Wallet', value: `\`${wallet}\``, inline: false },
                ],
            });
            return Response.json({ success: true, removed: existing.length });
        }

        if (action === 'mute') {
            const minutes = Number(durationMinutes) || 0;
            const muted_until = minutes > 0
                ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
                : null;

            // Replace any existing mute for this wallet (so duration changes are clean).
            const existing = await base44.asServiceRole.entities.MutedWallet.filter({ wallet_address: wallet });
            for (const e of existing) {
                try { await base44.asServiceRole.entities.MutedWallet.delete(e.id); } catch {}
            }

            const created = await base44.asServiceRole.entities.MutedWallet.create({
                wallet_address: wallet,
                muted_until,
                reason: (reason || '').slice(0, 200),
                muted_by: callerWallet,
                player_name: playerName || '',
            });

            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'other',
                    description: `Muted ${playerName || wallet}${minutes > 0 ? ` for ${minutes} min` : ' permanently'}`,
                    details: { wallet, minutes, muted_until, reason: reason || '' },
                });
            } catch {}

            postDiscordMod({
                title: '🔇 Wallet muted',
                fields: [
                    { name: 'Player', value: playerName || '(unknown)', inline: true },
                    { name: 'Duration', value: minutes > 0 ? `${minutes} min` : 'Permanent', inline: true },
                    { name: 'By moderator', value: `\`${callerWallet}\``, inline: true },
                    { name: 'Reason', value: reason || '(none)', inline: false },
                    { name: 'Wallet', value: `\`${wallet}\``, inline: false },
                ],
            });

            return Response.json({ success: true, mute: created });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        console.error('[muteWallet]', err);
        return Response.json({ error: err.message || String(err) }, { status: 500 });
    }
});