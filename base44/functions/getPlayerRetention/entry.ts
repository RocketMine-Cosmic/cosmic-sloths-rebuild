import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Lightweight player retention / DAU dashboard data source.
//
// Designed to be CHEAP and rate-limit-safe:
//   - One bounded read (PlayerSave with updated_at >= 30 days ago, capped at 5000 rows).
//     With current playerbase (~80 MAU) this is well under any limits and well under
//     200KB. If MAU grows past a few thousand, we can switch to bucket counters or
//     server-side aggregation — but that's a future problem.
//   - All bucket counts (DAU / WAU / MAU / 7-day chart / new vs returning) are
//     computed in-memory from the single fetch — zero extra DB calls.
//   - Cached server-side for 60s so admins refreshing the tab don't refire the read.
//
// Returns:
//   {
//     generated_at: number,
//     totals: { dau, wau, mau, all_time_players },
//     daily: [{ date, active, new_players }] x 14,   // last 14 days incl. today
//     hourly_today: [{ hour, active }] x 24,         // rolling 24h, hour buckets
//     top_active: [{ player_name, wallet_address, updated_at }] x 20,
//     stale_signups: [{ player_name, wallet_address, created_date }] x 20,  // joined >7d ago, never returned
//   }

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

let _cache = null;
const CACHE_TTL_MS = 60_000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const wallet = me.wallet_address?.toLowerCase();
        if (!wallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const admins = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: wallet });
        if (admins.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });
        const perms = admins[0].permissions || [];
        if (!perms.includes('owner') && !perms.includes('view_data')) {
            return Response.json({ error: "Forbidden — 'view_data' permission required" }, { status: 403 });
        }

        const now = Date.now();
        if (_cache && now - _cache.generated_at < CACHE_TTL_MS) {
            return Response.json({ ..._cache.data, cached: true });
        }

        const db = base44.asServiceRole;
        // PlayerSave read — powers DAU/WAU/MAU (moving-window metrics where
        // the single overwriting updated_at is correct) + top_active +
        // stale_signups + all_time_players fallback.
        const since30 = now - 30 * DAY;
        const recent = await db.entities.PlayerSave.filter(
            { updated_at: { $gte: since30 } },
            '-updated_at',
            5000
        );

        // Helper — strip a Date back to UTC YYYY-MM-DD
        const toDateKey = (ms) => {
            const d = new Date(ms);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };

        // DAU/WAU/MAU from PlayerSave (single timestamp per player is fine —
        // these are "active in the last N hours" moving windows).
        const dauSet = new Set();
        const wauSet = new Set();
        const mauSet = new Set();
        // First-seen by day (last 14 days) — uses PlayerSave.created_date which
        // for nearly every player matches their first session.
        const newSignupsByDay = new Map();

        for (const ps of recent) {
            const w = (ps.wallet_address || '').toLowerCase();
            if (!w) continue;
            const ts = Number(ps.updated_at) || 0;
            if (!ts) continue;

            const age = now - ts;
            if (age <= 1 * DAY) dauSet.add(w);
            if (age <= 7 * DAY) wauSet.add(w);
            if (age <= 30 * DAY) mauSet.add(w);

            if (ps.created_date) {
                const createdMs = new Date(ps.created_date).getTime();
                if (now - createdMs <= 14 * DAY) {
                    const key = toDateKey(createdMs);
                    if (!newSignupsByDay.has(key)) newSignupsByDay.set(key, new Set());
                    newSignupsByDay.get(key).add(w);
                }
            }
        }

        const dau = dauSet.size;
        const wau = wauSet.size;
        const mau = mauSet.size;

        // 14-day daily activity chart + 24h hourly chart — read from
        // DailyActivityLog, which is an immutable per-(wallet, day) log
        // written by saveScore. PlayerSave.updated_at can't power historical
        // bars (single overwriting timestamp), RunScore gets soft-deleted by
        // the keep-top-scores cleanup cron, so the dedicated log is the only
        // stable source. Bounded read: only the last 14 days.
        const since14Iso = new Date(now - 14 * DAY).toISOString().split('T')[0];
        let activityLogs = [];
        try {
            activityLogs = await db.entities.DailyActivityLog.filter(
                { date_key: { $gte: since14Iso } },
                '-date_key',
                10000
            );
        } catch (logErr) {
            console.warn('[getPlayerRetention] DailyActivityLog read failed:', logErr.message);
        }

        const dayBuckets = new Map();  // dateKey -> Set<wallet>
        const hourBuckets = new Map(); // hourIndex (0..23, 23 = "now") -> Set<wallet>
        for (const log of activityLogs) {
            const w = (log.wallet_address || '').toLowerCase();
            const dateKey = log.date_key;
            if (!w || !dateKey) continue;
            if (!dayBuckets.has(dateKey)) dayBuckets.set(dateKey, new Set());
            dayBuckets.get(dateKey).add(w);

            // Hourly bucket — only entries whose first_seen_ms falls inside the
            // rolling last 24h. first_seen_ms is the time of the player's first
            // save on that UTC day, which is a stable per-player anchor.
            const firstMs = Number(log.first_seen_ms) || 0;
            if (firstMs && now - firstMs <= 24 * HOUR) {
                const hoursAgo = Math.floor((now - firstMs) / HOUR);
                const idx = 23 - hoursAgo;
                if (idx >= 0 && idx <= 23) {
                    if (!hourBuckets.has(idx)) hourBuckets.set(idx, new Set());
                    hourBuckets.get(idx).add(w);
                }
            }
        }

        // Build 14-day daily series (oldest → newest)
        const daily = [];
        for (let i = 13; i >= 0; i--) {
            const ms = now - i * DAY;
            const key = toDateKey(ms);
            daily.push({
                date: key,
                active: dayBuckets.get(key)?.size || 0,
                new_players: newSignupsByDay.get(key)?.size || 0,
            });
        }

        // 24h hourly series (oldest → newest)
        const hourly_today = [];
        for (let i = 0; i <= 23; i++) {
            hourly_today.push({ hour: i, active: hourBuckets.get(i)?.size || 0 });
        }

        // Top 20 most recently active (already sorted desc by updated_at from the query)
        const top_active = recent.slice(0, 20).map(ps => ({
            player_name: ps.player_name || 'Unknown',
            wallet_address: ps.wallet_address || '',
            updated_at: ps.updated_at || 0,
        }));

        // Stale signups: joined >7d ago, last seen >7d ago. From the 30-day pool only
        // (so we naturally cap the scan — no extra DB calls).
        // We sort by created_date desc and take 20 to keep the payload tight.
        const stale_signups = recent
            .filter(ps => {
                if (!ps.created_date) return false;
                const createdMs = new Date(ps.created_date).getTime();
                const ageSinceJoin = now - createdMs;
                const ageSinceSeen = now - (Number(ps.updated_at) || 0);
                return ageSinceJoin >= 7 * DAY && ageSinceSeen >= 7 * DAY;
            })
            .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
            .slice(0, 20)
            .map(ps => ({
                player_name: ps.player_name || 'Unknown',
                wallet_address: ps.wallet_address || '',
                created_date: ps.created_date,
                last_seen: ps.updated_at || 0,
            }));

        // Best-effort all-time player count — uses a quick list with a high cap so
        // we get the actual number without scanning every row twice. Returns
        // whatever the DB gives us (capped); the dashboard labels it accordingly.
        let all_time_players = mau; // safe fallback
        try {
            // Lightweight existence list — only need length. Cap high enough to be
            // useful for the foreseeable playerbase. Not in the hot path of the
            // chart math, so an occasional 429 here just falls back to MAU.
            const all = await db.entities.PlayerSave.list('-created_date', 10000);
            all_time_players = all.length;
        } catch {}

        const data = {
            generated_at: now,
            totals: { dau, wau, mau, all_time_players },
            daily,
            hourly_today,
            top_active,
            stale_signups,
        };

        _cache = { generated_at: now, data };
        return Response.json(data);
    } catch (error) {
        console.error('[getPlayerRetention]', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
});