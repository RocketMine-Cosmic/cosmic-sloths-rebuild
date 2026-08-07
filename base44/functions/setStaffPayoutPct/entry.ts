// Owner-only endpoint to read or update the per-staff weekly payout percentage.
// The value is stored in AppConfig under key 'staff_pct_per_wallet'.
// distributeRewards.js + manuallyDistributeRewards.js read it at distribution time.
//
// Bounds: 0 ≤ pct ≤ 0.10 (10% per staff wallet) — keeps a hard ceiling so a typo
// can't accidentally drain the pool.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONFIG_KEY = 'staff_pct_per_wallet';
const DEFAULT_PCT = 0.02;
const MAX_PCT = 0.10;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { adminKey, action, pct, notes } = body;

        // Auth: owner permission OR emergency master key
        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('owner')) {
                return Response.json({ error: "Forbidden — owner permission required" }, { status: 403 });
            }
        }

        // Read the current config (used by both 'get' and 'set' to return the latest)
        const existing = await base44.asServiceRole.entities.AppConfig.filter({ key: CONFIG_KEY });
        const currentRecord = existing[0];
        const currentPct = currentRecord?.value?.pct ?? DEFAULT_PCT;

        if (action === 'get' || !action) {
            return Response.json({
                pct: currentPct,
                default: DEFAULT_PCT,
                max: MAX_PCT,
                updated_by: currentRecord?.updated_by || null,
                updated_date: currentRecord?.updated_date || null,
                notes: currentRecord?.notes || '',
            });
        }

        if (action === 'set') {
            const newPct = Number(pct);
            if (!isFinite(newPct) || newPct < 0 || newPct > MAX_PCT) {
                return Response.json({ error: `Invalid pct — must be between 0 and ${MAX_PCT}` }, { status: 400 });
            }
            if (currentRecord) {
                await base44.asServiceRole.entities.AppConfig.update(currentRecord.id, {
                    value: { pct: newPct },
                    updated_by: callerWallet,
                    notes: notes || '',
                });
            } else {
                await base44.asServiceRole.entities.AppConfig.create({
                    key: CONFIG_KEY,
                    value: { pct: newPct },
                    updated_by: callerWallet,
                    notes: notes || '',
                });
            }
            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'reward_adjustment',
                    description: `Staff weekly payout % changed: ${(currentPct * 100).toFixed(2)}% → ${(newPct * 100).toFixed(2)}%`,
                    details: { previous_pct: currentPct, new_pct: newPct, notes: notes || '' },
                });
            } catch {}
            return Response.json({ success: true, pct: newPct });
        }

        // Per-wallet override — owner-only. Pass admin_id + override_pct (or null to clear).
        if (action === 'setOverride') {
            const { admin_id, override_pct } = body;
            if (!admin_id) return Response.json({ error: 'admin_id required' }, { status: 400 });

            const target = await base44.asServiceRole.entities.AdminWallet.get(admin_id);
            if (!target) return Response.json({ error: 'Admin not found' }, { status: 404 });

            // null/undefined/'' → clear the override (revert to global default)
            let newOverride = null;
            if (override_pct !== null && override_pct !== undefined && override_pct !== '') {
                const n = Number(override_pct);
                if (!isFinite(n) || n < 0 || n > MAX_PCT) {
                    return Response.json({ error: `Invalid override_pct — must be between 0 and ${MAX_PCT}` }, { status: 400 });
                }
                newOverride = n;
            }

            const previousOverride = target.payout_pct_override ?? null;
            await base44.asServiceRole.entities.AdminWallet.update(admin_id, { payout_pct_override: newOverride });

            try {
                const fmt = (v) => v === null ? 'global default' : `${(v * 100).toFixed(2)}%`;
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'reward_adjustment',
                    description: `Per-wallet payout override for ${target.admin_name || target.wallet_address}: ${fmt(previousOverride)} → ${fmt(newOverride)}`,
                    details: {
                        target_wallet: target.wallet_address,
                        target_player_name: target.admin_name,
                        previous_override: previousOverride,
                        new_override: newOverride,
                        notes: notes || '',
                    },
                });
            } catch {}

            return Response.json({ success: true, override_pct: newOverride });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        console.error('[setStaffPayoutPct]', err);
        return Response.json({ error: err.message || String(err) }, { status: 500 });
    }
});