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
// Soft-deletes a SquadMessage and writes an audit log entry.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { messageId, adminKey } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
            let me = null;
            try { me = await base44.auth.me(); } catch {}
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

        if (!messageId) return Response.json({ error: 'messageId required' }, { status: 400 });

        const target = await base44.asServiceRole.entities.SquadMessage.get(messageId);
        if (!target) return Response.json({ error: 'Message not found' }, { status: 404 });

        await base44.asServiceRole.entities.SquadMessage.delete(messageId);

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: `Deleted squad message from ${target.player_name}`,
                details: {
                    messageId,
                    squad_id: target.squad_id,
                    author_wallet: target.wallet_address,
                    content_excerpt: (target.content || '').slice(0, 200),
                },
            });
        } catch (e) { console.error('[deleteSquadMessage] audit log failed:', e.message); }

        postDiscordMod({
            title: '🗑️ Squad message deleted',
            fields: [
                { name: 'Author', value: target.player_name || '(unknown)', inline: true },
                { name: 'By moderator', value: `\`${callerWallet}\``, inline: true },
                { name: 'Content', value: `\`\`\`${(target.content || '').slice(0, 900)}\`\`\``, inline: false },
            ],
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error('[deleteSquadMessage]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});