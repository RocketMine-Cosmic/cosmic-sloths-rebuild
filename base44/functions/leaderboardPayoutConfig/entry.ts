// Owner-only endpoint to read/write the leaderboard payout configuration.
// Persists `top_n` + per-rank-tier percentages for weekly + seasonal payouts.
//
// Reads (action='get' or no action) are PUBLIC so the frontend Leaderboard can
// mirror the exact same payout math the backend will use at distribution time.
// Writes (action='set') require owner permission.
//
// Stored in AppConfig under key 'leaderboard_payout_config'. Shape:
//   {
//     top_n: 20,
//     weekly_tiers:   [{ min: 1, max: 1, pct: 0.10 }, ...],
//     seasonal_tiers: [{ min: 1, max: 1, pct: 0.10 }, ...]
//   }
//
// Bounds: 1 ≤ top_n ≤ 100, 0 ≤ pct ≤ 0.50 per tier (prevents accidental
// configurations that drain or zero out the pool). The percentage normaliser
// in distributeRewards/previewPayouts/manuallyDistributeRewards re-scales to
// 1/totalPct anyway, so individual percentages are *relative weights* — they
// don't need to sum to any specific target.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONFIG_KEY = 'leaderboard_payout_config';
const MAX_TOP_N = 100;
const MAX_TIER_PCT = 0.50;

// Built-in defaults — match the values currently hard-coded in the payout
// functions. Used when AppConfig has no entry yet (first launch).
export const DEFAULT_CONFIG = {
    top_n: 20,
    // Pool size %s — applied to weekly/seasonal payout periods starting at S7
    // (2026-S7, ~2026-06-14). Pre-S7 distributions use legacy hardcoded values
    // (0.20 weekly / 0.30 seasonal / no kill pool) and IGNORE these fields, so
    // editing them won't retroactively affect closed S6 or earlier pools.
    // See docs/OMENX_POOL_RESPLIT_PLAN.md.
    weekly_pool_pct: 0.15,
    seasonal_pool_pct: 0.20,
    kill_pool_pct: 0.05,
    weekly_tiers: [
        { min: 1,  max: 1,  pct: 0.10 },
        { min: 2,  max: 2,  pct: 0.08 },
        { min: 3,  max: 3,  pct: 0.06 },
        { min: 4,  max: 10, pct: 0.04 },
        { min: 11, max: 20, pct: 0.03 },
    ],
    seasonal_tiers: [
        { min: 1,  max: 1,  pct: 0.10 },
        { min: 2,  max: 2,  pct: 0.075 },
        { min: 3,  max: 3,  pct: 0.06 },
        { min: 4,  max: 10, pct: 0.032 },
        { min: 11, max: 20, pct: 0.022 },
    ],
    // Flatter curve than score tiers — kills is a grind metric so rewarding
    // effort beats over-concentrating at #1. Top 20 ranks paid.
    weekly_kill_tiers: [
        { min: 1,  max: 1,  pct: 0.15 },
        { min: 2,  max: 2,  pct: 0.10 },
        { min: 3,  max: 3,  pct: 0.08 },
        { min: 4,  max: 10, pct: 0.05 },
        { min: 11, max: 20, pct: 0.025 },
    ],
};

function validateTiers(tiers) {
    if (!Array.isArray(tiers) || tiers.length === 0) return 'tiers must be a non-empty array';
    for (const t of tiers) {
        const min = Number(t.min), max = Number(t.max), pct = Number(t.pct);
        if (!isFinite(min) || !isFinite(max) || !isFinite(pct)) return 'tier values must be numbers';
        if (min < 1 || max < min) return 'tier min/max out of order';
        if (pct < 0 || pct > MAX_TIER_PCT) return `tier pct out of bounds (0..${MAX_TIER_PCT})`;
    }
    return null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { action, adminKey, top_n, weekly_tiers, seasonal_tiers, notes } = body;

        // PUBLIC read — no auth required, so Leaderboard.jsx can fetch it.
        const existing = await base44.asServiceRole.entities.AppConfig.list();
        const currentRecord = existing.find(r => r.key === CONFIG_KEY);
        const currentConfig = currentRecord?.value || DEFAULT_CONFIG;

        if (!action || action === 'get') {
            return Response.json({
                config: currentConfig,
                default: DEFAULT_CONFIG,
                updated_by: currentRecord?.updated_by || null,
                updated_date: currentRecord?.updated_date || null,
                notes: currentRecord?.notes || '',
                max_top_n: MAX_TOP_N,
                max_tier_pct: MAX_TIER_PCT,
            });
        }

        if (action === 'set') {
            // Auth: owner permission OR emergency master key
            let callerWallet = 'EMERGENCY_KEY';
            if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
                const me = await base44.auth.me();
                if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
                callerWallet = me.wallet_address?.toLowerCase();
                if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
                const records = await base44.asServiceRole.entities.AdminWallet.list();
                const adminRec = records.find(r => r.wallet_address === callerWallet);
                if (!adminRec) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
                const perms = adminRec.permissions || [];
                if (!perms.includes('owner')) {
                    return Response.json({ error: "Forbidden — owner permission required" }, { status: 403 });
                }
            }

            const n = Number(top_n);
            if (!isFinite(n) || n < 1 || n > MAX_TOP_N) {
                return Response.json({ error: `Invalid top_n — must be 1..${MAX_TOP_N}` }, { status: 400 });
            }
            const wkErr = validateTiers(weekly_tiers);
            if (wkErr) return Response.json({ error: `weekly_tiers: ${wkErr}` }, { status: 400 });
            const seErr = validateTiers(seasonal_tiers);
            if (seErr) return Response.json({ error: `seasonal_tiers: ${seErr}` }, { status: 400 });

            // S7 fields — all optional. If omitted, carry the current value over
            // (lets the existing admin UI keep working without surfacing them yet).
            const { weekly_pool_pct, seasonal_pool_pct, kill_pool_pct, weekly_kill_tiers } = body;
            const validatePct = (label, v) => {
                const num = Number(v);
                if (!isFinite(num) || num < 0 || num > MAX_TIER_PCT) {
                    return `${label} out of bounds (0..${MAX_TIER_PCT})`;
                }
                return null;
            };
            if (weekly_pool_pct !== undefined) {
                const e = validatePct('weekly_pool_pct', weekly_pool_pct);
                if (e) return Response.json({ error: e }, { status: 400 });
            }
            if (seasonal_pool_pct !== undefined) {
                const e = validatePct('seasonal_pool_pct', seasonal_pool_pct);
                if (e) return Response.json({ error: e }, { status: 400 });
            }
            if (kill_pool_pct !== undefined) {
                const e = validatePct('kill_pool_pct', kill_pool_pct);
                if (e) return Response.json({ error: e }, { status: 400 });
            }
            let resolvedKillTiers = currentConfig.weekly_kill_tiers || DEFAULT_CONFIG.weekly_kill_tiers;
            if (weekly_kill_tiers) {
                const kErr = validateTiers(weekly_kill_tiers);
                if (kErr) return Response.json({ error: `weekly_kill_tiers: ${kErr}` }, { status: 400 });
                resolvedKillTiers = weekly_kill_tiers.map(t => ({ min: Number(t.min), max: Number(t.max), pct: Number(t.pct) }));
            }
            const resolvedWkPoolPct = weekly_pool_pct !== undefined
                ? Number(weekly_pool_pct)
                : (currentConfig.weekly_pool_pct ?? DEFAULT_CONFIG.weekly_pool_pct);
            const resolvedSeasPoolPct = seasonal_pool_pct !== undefined
                ? Number(seasonal_pool_pct)
                : (currentConfig.seasonal_pool_pct ?? DEFAULT_CONFIG.seasonal_pool_pct);
            const resolvedKillPoolPct = kill_pool_pct !== undefined
                ? Number(kill_pool_pct)
                : (currentConfig.kill_pool_pct ?? DEFAULT_CONFIG.kill_pool_pct);

            const newConfig = {
                top_n: n,
                weekly_pool_pct: resolvedWkPoolPct,
                seasonal_pool_pct: resolvedSeasPoolPct,
                kill_pool_pct: resolvedKillPoolPct,
                weekly_tiers: weekly_tiers.map(t => ({ min: Number(t.min), max: Number(t.max), pct: Number(t.pct) })),
                seasonal_tiers: seasonal_tiers.map(t => ({ min: Number(t.min), max: Number(t.max), pct: Number(t.pct) })),
                weekly_kill_tiers: resolvedKillTiers,
            };

            if (currentRecord) {
                await base44.asServiceRole.entities.AppConfig.update(currentRecord.id, {
                    value: newConfig,
                    updated_by: callerWallet,
                    notes: notes || '',
                });
            } else {
                await base44.asServiceRole.entities.AppConfig.create({
                    key: CONFIG_KEY,
                    value: newConfig,
                    updated_by: callerWallet,
                    notes: notes || '',
                });
            }
            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: callerWallet,
                    action_type: 'reward_adjustment',
                    description: `Leaderboard payout config updated (top_n=${n})`,
                    details: { previous: currentConfig, next: newConfig, notes: notes || '' },
                });
            } catch {}
            return Response.json({ success: true, config: newConfig });
        }

        if (action === 'reset') {
            // Auth check (same as 'set')
            let callerWallet = 'EMERGENCY_KEY';
            if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
                const me = await base44.auth.me();
                if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
                callerWallet = me.wallet_address?.toLowerCase();
                const records = await base44.asServiceRole.entities.AdminWallet.list();
                const adminRec = records.find(r => r.wallet_address === callerWallet);
                if (!adminRec || !(adminRec.permissions || []).includes('owner')) {
                    return Response.json({ error: "Forbidden — owner permission required" }, { status: 403 });
                }
            }
            if (currentRecord) {
                await base44.asServiceRole.entities.AppConfig.update(currentRecord.id, {
                    value: DEFAULT_CONFIG,
                    updated_by: callerWallet,
                    notes: 'Reset to defaults',
                });
            }
            return Response.json({ success: true, config: DEFAULT_CONFIG });
        }

        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        console.error('[leaderboardPayoutConfig]', err);
        return Response.json({ error: err.message || String(err) }, { status: 500 });
    }
});