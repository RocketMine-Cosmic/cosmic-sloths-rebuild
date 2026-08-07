import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session + (view_data for list / manage_blacklist for mutations), OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { action, wallet_address, reason, notes, adminKey } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            const required = action === 'list' ? 'view_data' : 'manage_blacklist';
            if (!perms.includes(required) && !perms.includes('owner')) {
                return Response.json({ error: `Forbidden — '${required}' permission required` }, { status: 403 });
            }
        }

        if (!action) return Response.json({ error: 'action required' }, { status: 400 });

        if (action === 'list') {
            const records = await base44.asServiceRole.entities.BlacklistedWallet.list('-banned_at', 200);
            return Response.json({ records });
        }

        if (!wallet_address) return Response.json({ error: 'wallet_address required' }, { status: 400 });

        if (action === 'ban') {
            if (!reason) return Response.json({ error: 'Reason required for ban' }, { status: 400 });
            const existing = await base44.asServiceRole.entities.BlacklistedWallet.filter({ wallet_address });
            if (existing.length > 0) return Response.json({ error: 'Wallet already banned' }, { status: 409 });
            const record = await base44.asServiceRole.entities.BlacklistedWallet.create({
                wallet_address,
                reason,
                banned_by: callerWallet,
                banned_at: new Date().toISOString(),
                notes: notes || ''
            });
            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'player_action',
                    description: `Banned wallet ${wallet_address}`,
                    details: { wallet: wallet_address, reason, notes }
                });
            } catch {}
            return Response.json({ success: true, record });
        }

        if (action === 'unban') {
            const existing = await base44.asServiceRole.entities.BlacklistedWallet.filter({ wallet_address });
            if (existing.length === 0) return Response.json({ error: 'Wallet not on blacklist' }, { status: 404 });
            await base44.asServiceRole.entities.BlacklistedWallet.delete(existing[0].id);
            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'player_action',
                    description: `Unbanned wallet ${wallet_address}`,
                    details: { wallet: wallet_address }
                });
            } catch {}
            return Response.json({ success: true, message: 'Wallet unbanned' });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});