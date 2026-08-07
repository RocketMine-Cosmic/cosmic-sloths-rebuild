// Admin-only — sets a server-wide XP multiplier that applies to every player's
// runs for a configurable duration. Used as a "make-good" lever when something
// disrupts play (e.g. OMENX settlement service is down and players can't buy
// the personal XP buff). Applies to all active runs at run-start.
//
// Stored at AppConfig key 'global_xp_buff' with shape:
//   { multiplier: number (1.0–3.0), expiresAt: number (ms epoch), message: string }
// expiresAt <= now means inactive. Set multiplier=1 OR pass disable=true to clear.
//
// Read by getMaintenanceMode (already cached 15s) — same hot path, no extra
// per-client traffic.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const KEY = 'global_xp_buff';
const MAX_MULT = 3.0;
const MAX_HOURS = 72;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

        const body = await req.json().catch(() => ({}));
        const disable = !!body.disable;
        const multiplier = Number(body.multiplier);
        const hours = Number(body.hours);
        const message = typeof body.message === 'string' ? body.message.slice(0, 280) : '';

        let value;
        if (disable) {
            value = { multiplier: 1.0, expiresAt: 0, message: '' };
        } else {
            if (!isFinite(multiplier) || multiplier < 1.0 || multiplier > MAX_MULT) {
                return Response.json({ error: `multiplier must be between 1.0 and ${MAX_MULT}` }, { status: 400 });
            }
            if (!isFinite(hours) || hours <= 0 || hours > MAX_HOURS) {
                return Response.json({ error: `hours must be between 0 and ${MAX_HOURS}` }, { status: 400 });
            }
            value = {
                multiplier,
                expiresAt: Date.now() + Math.floor(hours * 60 * 60 * 1000),
                message,
            };
        }

        const existing = await base44.asServiceRole.entities.AppConfig.filter({ key: KEY });
        if (existing[0]) {
            await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
                value,
                updated_by: me.wallet_address || me.email,
                notes: disable ? 'Disabled' : `Set ${multiplier}x for ${hours}h`,
            });
        } else {
            await base44.asServiceRole.entities.AppConfig.create({
                key: KEY,
                value,
                updated_by: me.wallet_address || me.email,
                notes: disable ? 'Disabled' : `Set ${multiplier}x for ${hours}h`,
            });
        }

        // Audit log
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: me.wallet_address || me.email,
                action_type: 'other',
                description: disable
                    ? 'Cleared global XP buff'
                    : `Set global XP buff to ${multiplier}× for ${hours}h`,
                details: value,
            });
        } catch {}

        return Response.json({ success: true, value });
    } catch (error) {
        console.error('[setGlobalXpBuff]', error.message);
        return Response.json({ error: error.message || 'Failed' }, { status: 500 });
    }
});