// Public read of the maintenance gate state. Called from MaintenanceGate every 30s
// PER CLIENT — with hundreds of concurrent players this previously hit AppConfig
// twice per request and was a major contributor to Base44 rate limits.
//
// In-memory cache (15s TTL) collapses bursts down to ~4 DB reads/min total instead
// of 2 per player per 30s. Admins flipping the flag in AdminMaintenance see the
// change in <15s — fast enough for incident response.
//
// Returns { mode, message, omenxPurchasesDisabled, omenxPurchasesMessage }.
// Never throws — fails OPEN so a DB hiccup doesn't lock players out.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

let cached = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000;

Deno.serve(async (req) => {
    try {
        const now = Date.now();
        if (cached && now < cacheExpiresAt) {
            return Response.json(cached);
        }
        const base44 = createClientFromRequest(req);
        const [maintRecords, omenxRecords, xpBuffRecords, versionRecords] = await Promise.all([
            base44.asServiceRole.entities.AppConfig.filter({ key: 'maintenance_mode' }),
            base44.asServiceRole.entities.AppConfig.filter({ key: 'omenx_purchases_disabled' }),
            base44.asServiceRole.entities.AppConfig.filter({ key: 'global_xp_buff' }),
            base44.asServiceRole.entities.AppConfig.filter({ key: 'min_client_version' }),
        ]);
        const m = maintRecords[0]?.value || {};
        const o = omenxRecords[0]?.value || {};
        const x = xpBuffRecords[0]?.value || {};
        const v = versionRecords[0]?.value || {};
        const xpActive = Number(x.multiplier || 1) > 1 && Number(x.expiresAt || 0) > now;
        const payload = {
            mode: m.mode || 'off',
            message: m.message || '',
            omenxPurchasesDisabled: !!o.disabled,
            omenxPurchasesMessage: o.message || '',
            globalXpBuff: xpActive
                ? { multiplier: Number(x.multiplier), expiresAt: Number(x.expiresAt), message: x.message || '' }
                : null,
            minClientVersion: v.version || '',
            minClientVersionMessage: v.message || '',
        };
        cached = payload;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return Response.json(payload);
    } catch (error) {
        // Fail OPEN — but DON'T cache the failure (next request retries).
        console.error('[getMaintenanceMode]', error.message);
        return Response.json({ mode: 'off', message: '', omenxPurchasesDisabled: false, omenxPurchasesMessage: '', globalXpBuff: null, minClientVersion: '', minClientVersionMessage: '' });
    }
});