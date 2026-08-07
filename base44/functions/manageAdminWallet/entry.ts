import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Manages staff/admin wallets. Auth = Base44 session → me.wallet_address → AdminWallet lookup.
// (No OmenX OAuth token — that goes stale once a user stops re-logging-in.)
// `owner` permission is sticky — only owners can grant/remove the owner flag.

const ALL_PERMISSIONS = [
    'view_data', 'view_finance', 'edit_players', 'delete_scores', 'manage_blacklist',
    'distribute_rewards', 'manage_raid', 'manage_admins', 'manage_maintenance', 'wipe_data',
    'refund_omenx', 'refund_single', 'manage_backups', 'moderate_chat', 'owner'
];

async function verifyCaller(base44, adminKey) {
    // Emergency master key — bypasses all checks
    if (adminKey && adminKey === Deno.env.get('AdminDash')) {
        return { admin: { permissions: ['owner', 'manage_admins'] }, wallet: 'EMERGENCY_KEY', isEmergency: true };
    }
    const me = await base44.auth.me();
    if (!me) return { error: 'Unauthorized', status: 401 };
    const wallet = me.wallet_address?.toLowerCase();
    if (!wallet) return { error: 'No wallet linked to user', status: 401 };
    const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: wallet });
    if (records.length === 0) return { error: 'Forbidden — not an admin', status: 403 };
    const admin = records[0];
    const perms = admin.permissions || [];
    if (!perms.includes('owner') && !perms.includes('manage_admins')) {
        return { error: 'Forbidden — manage_admins permission required', status: 403 };
    }
    return { admin, wallet };
}

async function logAction(base44, callerWallet, description, details) {
    try {
        await base44.asServiceRole.entities.AdminChangesLog.create({
            wallet_address: callerWallet,
            action_type: 'other',
            description,
            details,
        });
    } catch (e) {
        console.error('[manageAdminWallet] audit log failed:', e.message);
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { action, adminKey } = body;

        const auth = await verifyCaller(base44, adminKey);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

        const callerIsOwner = (auth.admin.permissions || []).includes('owner');

        if (action === 'create') {
            const { wallet_address, admin_name, permissions, notes } = body;
            if (!wallet_address) return Response.json({ error: 'wallet_address required' }, { status: 400 });

            const cleanPerms = (permissions || []).filter(p => ALL_PERMISSIONS.includes(p));
            if (cleanPerms.includes('owner') && !callerIsOwner) {
                return Response.json({ error: 'Only owners can grant owner permission' }, { status: 403 });
            }

            const existing = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: wallet_address.toLowerCase() });
            if (existing.length > 0) return Response.json({ error: 'Wallet is already an admin' }, { status: 409 });

            const created = await base44.asServiceRole.entities.AdminWallet.create({
                wallet_address: wallet_address.toLowerCase(),
                admin_name: admin_name || 'Unnamed',
                permissions: cleanPerms,
                notes: notes || '',
            });
            await logAction(base44, auth.wallet, `Added admin: ${admin_name || wallet_address}`, { wallet: wallet_address, permissions: cleanPerms });
            return Response.json({ success: true, record: created });
        }

        if (action === 'updatePerms') {
            const { admin_id, permissions } = body;
            if (!admin_id) return Response.json({ error: 'admin_id required' }, { status: 400 });
            const cleanPerms = (permissions || []).filter(p => ALL_PERMISSIONS.includes(p));

            const target = await base44.asServiceRole.entities.AdminWallet.get(admin_id);
            if (!target) return Response.json({ error: 'Admin not found' }, { status: 404 });

            const targetIsOwner = (target.permissions || []).includes('owner');
            const willBeOwner = cleanPerms.includes('owner');

            if ((targetIsOwner !== willBeOwner) && !callerIsOwner) {
                return Response.json({ error: 'Only owners can change owner permission' }, { status: 403 });
            }
            if (targetIsOwner && !willBeOwner && target.wallet_address === auth.wallet) {
                const allOwners = await base44.asServiceRole.entities.AdminWallet.list();
                const ownerCount = allOwners.filter(a => (a.permissions || []).includes('owner')).length;
                if (ownerCount <= 1) {
                    return Response.json({ error: 'Cannot remove last owner' }, { status: 400 });
                }
            }

            await base44.asServiceRole.entities.AdminWallet.update(admin_id, { permissions: cleanPerms });
            await logAction(base44, auth.wallet, `Updated permissions for ${target.admin_name || target.wallet_address}`, { wallet: target.wallet_address, permissions: cleanPerms });
            return Response.json({ success: true });
        }

        if (action === 'delete') {
            const { admin_id } = body;
            if (!admin_id) return Response.json({ error: 'admin_id required' }, { status: 400 });

            const target = await base44.asServiceRole.entities.AdminWallet.get(admin_id);
            if (!target) return Response.json({ error: 'Admin not found' }, { status: 404 });

            if ((target.permissions || []).includes('owner') && !callerIsOwner) {
                return Response.json({ error: 'Only owners can remove owners' }, { status: 403 });
            }
            if ((target.permissions || []).includes('owner')) {
                const allAdmins = await base44.asServiceRole.entities.AdminWallet.list();
                const ownerCount = allAdmins.filter(a => (a.permissions || []).includes('owner')).length;
                if (ownerCount <= 1) {
                    return Response.json({ error: 'Cannot remove last owner' }, { status: 400 });
                }
            }

            await base44.asServiceRole.entities.AdminWallet.delete(admin_id);
            await logAction(base44, auth.wallet, `Removed admin: ${target.admin_name || target.wallet_address}`, { wallet: target.wallet_address });
            return Response.json({ success: true });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[manageAdminWallet]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});