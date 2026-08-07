import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session → linked wallet → AdminWallet lookup. (No OmenX OAuth — that goes stale.)

// In-memory caches to dampen Base44 platform rate-limits during admin-dash load
// bursts. Both are short-lived enough that perm changes show up within ~30s.
const _meCache = new Map();         // sessionToken → { me, expiresAt }
const _adminCache = new Map();      // wallet (lowercase) → { record, expiresAt }
const ME_TTL_MS = 30_000;
const ADMIN_TTL_MS = 30_000;

// Tiny retry-on-429 helper. The Base44 platform throttles by token + endpoint,
// so a single staff member opening AdminDash can burst past the limit on the
// auth.me() / AdminWallet.filter calls. Sleeping briefly + retrying once is
// kinder than failing fast (which causes the client to retry 4× — multiplying
// the stampede).
async function withRetry429(fn, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try { return await fn(); }
        catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            if (status !== 429 || i === attempts - 1) throw err;
            // 250ms → 500ms → 1s
            await new Promise(r => setTimeout(r, 250 * Math.pow(2, i)));
        }
    }
    throw lastErr;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Short-circuit unauthenticated callers before hitting auth.me() — the SDK
        // auto-logs a 401 to runtime logs every time auth.me() is called without a
        // session, and WarpMenu pings this on every page load to check admin status.
        // No auth header → no session → return 401 immediately.
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
        if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Cache the auth.me() result per session token. The SDK call hits the
        // platform every time and was a top contributor to dashboard 429s.
        const tokenKey = authHeader.slice(-32); // last 32 chars are unique enough
        const now = Date.now();
        let me;
        const meHit = _meCache.get(tokenKey);
        if (meHit && now < meHit.expiresAt) {
            me = meHit.me;
        } else {
            try {
                me = await withRetry429(() => base44.auth.me());
            } catch (authErr) {
                const status = authErr?.status || authErr?.response?.status;
                if (status === 429) {
                    return Response.json({ error: 'Server is busy — please try again in a few seconds' }, { status: 429 });
                }
                // Stale/invalid session token — same silent 401 as missing auth.
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            if (me) _meCache.set(tokenKey, { me, expiresAt: now + ME_TTL_MS });
        }
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const wallet = me.wallet_address?.toLowerCase();
        if (!wallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        // Cache the AdminWallet lookup per wallet — admin perms don't change
        // minute-to-minute, and tab swaps + MyStaffIncomeCard polls + useEffects
        // all hit this lookup on every dashboard load.
        let adminWallets;
        const adminHit = _adminCache.get(wallet);
        if (adminHit && now < adminHit.expiresAt) {
            adminWallets = adminHit.record;
        } else {
            try {
                adminWallets = await withRetry429(
                    () => base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: wallet })
                );
            } catch (err) {
                const status = err?.status || err?.response?.status;
                if (status === 429) {
                    return Response.json({ error: 'Server is busy — please try again in a few seconds' }, { status: 429 });
                }
                throw err;
            }
            _adminCache.set(wallet, { record: adminWallets, expiresAt: now + ADMIN_TTL_MS });
        }
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const perms = adminWallets[0].permissions || [];
        const canViewFinance = perms.includes('owner') || perms.includes('view_finance');

        const { type } = await req.json();

        // Finance-restricted types — hide revenue from regular staff
        const FINANCE_TYPES = ['pools', 'logs', 'payouts'];
        if (FINANCE_TYPES.includes(type) && !canViewFinance) {
            return Response.json({ error: 'Forbidden — view_finance permission required' }, { status: 403 });
        }

        if (type === 'pools') {
            const pools = await base44.asServiceRole.entities.TokenPool.list('-created_date', 100);
            return Response.json({ pools });
        }
        if (type === 'logs') {
            // Pull a wide window so client-side date filters (This Week / This Month)
            // don't silently drop entries when there's a busy day. 50 was way too tight —
            // a single active morning would push the rest of the week off the list.
            const logs = await base44.asServiceRole.entities.TokenSpendLog.list('-created_date', 2000);
            return Response.json({ logs });
        }
        if (type === 'payouts') {
            const payouts = await base44.asServiceRole.entities.PayoutLog.list('-created_date', 200);
            return Response.json({ payouts });
        }
        if (type === 'adminWallets') {
            const records = await base44.asServiceRole.entities.AdminWallet.list('-created_date', 200);
            return Response.json({ records });
        }
        // Tiny boolean check — used by WarpMenu on every page load to decide if
        // it should show the Staff section. Skips the heavy 200-row list fetch
        // (the AdminWallet lookup at line 27 already proved admin status).
        if (type === 'isAdmin') {
            return Response.json({ isAdmin: true, permissions: perms });
        }
        // Staff-safe: any admin can see their own projected weekly OMENX income
        // (the current week's total_spent + the live staff pct). Does NOT expose
        // logs, payouts, or all-time totals.
        if (type === 'my_staff_income') {
            // Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
            const now = new Date();
            const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const dayNum = tmp.getUTCDay() || 7;
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
            const isoYear = tmp.getUTCFullYear();
            const yearStart = new Date(Date.UTC(isoYear, 0, 1));
            const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
            const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;

            const pools = await base44.asServiceRole.entities.TokenPool.filter({ period_id: week_id, period_type: 'weekly' });
            const totalSpent = pools[0]?.total_spent || 0;

            const cfg = await base44.asServiceRole.entities.AppConfig.filter({ key: 'staff_pct_per_wallet' });
            const globalPct = Number(cfg[0]?.value?.pct ?? 0.02);

            // Per-wallet override (set via setStaffPayoutPct setOverride) wins over global.
            const myOverride = adminWallets[0].payout_pct_override;
            const hasOverride = myOverride !== null && myOverride !== undefined && isFinite(Number(myOverride));
            const pct = hasOverride ? Number(myOverride) : globalPct;

            return Response.json({ week_id, total_spent: totalSpent, pct, has_override: hasOverride, global_pct: globalPct });
        }

        return Response.json({ error: 'Invalid type' }, { status: 400 });
    } catch (error) {
        // 401 from auth.me() is expected — every player's WarpMenu pings this on
        // mount to check admin status. Silently return Unauthorized; only log
        // unexpected errors so #errors / runtime logs stay actionable.
        if (error?.status === 401 || /Authentication required/i.test(error?.message || '')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('[getAdminData] Error:', error);
        return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
});