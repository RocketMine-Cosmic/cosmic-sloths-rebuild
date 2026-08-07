import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 429-aware retry wrapper — read-only, but high-volume page loads were 500-ing
// during peak and breaking the raid UI. Retries make the read resilient.
async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return await fn(); }
        catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 3) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[getSquadRaidLeaderboard] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

// Auth: Base44 session (any authenticated user can view).
// Aggregates GlobalBossContribution by squad_id for the current (or specified) week.
// Returns top squads ranked by total damage to the world boss.

// Per-week 30s cache. Raid pages poll this every ~10s from every viewer, and the
// underlying aggregation (paginated contribution scan + per-wallet squad backfill)
// is one of the heaviest reads in the app. A 30s cache cuts repeat work by ~95%
// during raid windows with at most 30s of staleness on the displayed rankings —
// imperceptible on a weekly leaderboard.
// Lives in module scope (warm-instance only); cold starts simply skip the cache.
const LEADERBOARD_CACHE_TTL_MS = 30_000;
const leaderboardCache = new Map(); // weekId → { ts, payload }

function getCachedLeaderboard(weekId) {
    const entry = leaderboardCache.get(weekId);
    if (!entry) return null;
    if (Date.now() - entry.ts > LEADERBOARD_CACHE_TTL_MS) {
        leaderboardCache.delete(weekId);
        return null;
    }
    return entry.payload;
}

function setCachedLeaderboard(weekId, payload) {
    leaderboardCache.set(weekId, { ts: Date.now(), payload });
    // Bound the map — at most a handful of week ids should ever live here.
    if (leaderboardCache.size > 50) {
        const cutoff = Date.now() - LEADERBOARD_CACHE_TTL_MS;
        for (const [k, v] of leaderboardCache) {
            if (v.ts < cutoff) leaderboardCache.delete(k);
        }
    }
}

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
function getCurrentWeekId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to view raid stats.' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const weekId = body.weekId || getCurrentWeekId();

        // 30s cache check — return cached payload for repeat polls within the window.
        const cached = getCachedLeaderboard(weekId);
        if (cached) {
            return Response.json(cached);
        }

        // Pull all contributions for this week. Page in case there's a lot.
        const PAGE = 500;
        let all = [];
        let skip = 0;
        for (let i = 0; i < 20; i++) { // cap at 10k contributions per week
            const page = await with429Retry(
                () => base44.asServiceRole.entities.GlobalBossContribution.list('-created_date', PAGE, skip),
                'GlobalBossContribution.list'
            );
            const filtered = page.filter(c => c.week_id === weekId);
            all = all.concat(filtered);
            if (page.length < PAGE) break;
            skip += PAGE;
        }

        // Back-fill squad info for contributions missing it (older records were created
        // before submitBossDamage attached squad info). Look up current squad membership
        // by wallet for any contribution with no squad_id.
        const walletsNeedingLookup = new Set();
        for (const c of all) {
            if (!c.squad_id && c.user_id) walletsNeedingLookup.add(c.user_id.toLowerCase());
        }
        const walletToSquad = new Map();
        if (walletsNeedingLookup.size > 0) {
            // Batch in groups so we don't hit a query limit
            const wallets = Array.from(walletsNeedingLookup);
            for (const wallet of wallets) {
                try {
                    const members = await with429Retry(
                        () => base44.asServiceRole.entities.SquadMember.filter({ wallet_address: wallet }),
                        'SquadMember.filter'
                    );
                    if (members.length > 0) {
                        const sq = await with429Retry(
                            () => base44.asServiceRole.entities.Squad.get(members[0].squad_id),
                            'Squad.get'
                        );
                        if (sq) {
                            walletToSquad.set(wallet, {
                                squad_id: sq.id,
                                squad_name: sq.name || '',
                                squad_tag: sq.tag || '',
                                squad_icon: sq.icon || '🛡️',
                            });
                        }
                    }
                } catch (e) {
                    // Skip if lookup fails
                }
            }
        }

        // Aggregate by squad_id (using back-filled lookups when needed)
        const bySquad = new Map();
        for (const c of all) {
            let squadInfo = c.squad_id
                ? { squad_id: c.squad_id, squad_name: c.squad_name, squad_tag: c.squad_tag, squad_icon: c.squad_icon }
                : (c.user_id ? walletToSquad.get(c.user_id.toLowerCase()) : null);
            if (!squadInfo?.squad_id) continue;
            const key = squadInfo.squad_id;
            const cur = bySquad.get(key) || {
                squad_id: squadInfo.squad_id,
                squad_name: squadInfo.squad_name || '',
                squad_tag: squadInfo.squad_tag || '',
                squad_icon: squadInfo.squad_icon || '🛡️',
                total_damage: 0,
                contributors: new Set(),
            };
            cur.total_damage += Number(c.damage || 0);
            if (c.user_id) cur.contributors.add(c.user_id);
            if (squadInfo.squad_name) cur.squad_name = squadInfo.squad_name;
            if (squadInfo.squad_tag) cur.squad_tag = squadInfo.squad_tag;
            if (squadInfo.squad_icon) cur.squad_icon = squadInfo.squad_icon;
            bySquad.set(key, cur);
        }

        const ranking = Array.from(bySquad.values())
            .map(s => ({
                squad_id: s.squad_id,
                squad_name: s.squad_name,
                squad_tag: s.squad_tag,
                squad_icon: s.squad_icon,
                total_damage: Math.floor(s.total_damage),
                contributor_count: s.contributors.size,
            }))
            .sort((a, b) => b.total_damage - a.total_damage)
            .slice(0, 50);

        const payload = { success: true, weekId, ranking };
        setCachedLeaderboard(weekId, payload);
        return Response.json(payload);
    } catch (error) {
        console.error('[getSquadRaidLeaderboard]', error.message);
        return Response.json({ error: 'Couldn\'t load the raid leaderboard. Please try again.' }, { status: 500 });
    }
});