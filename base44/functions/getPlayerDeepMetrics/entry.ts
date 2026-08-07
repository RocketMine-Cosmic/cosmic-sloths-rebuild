import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Deep player metrics — cohort retention, level distribution, top characters/arenas,
// and squad membership rate. Built to be CHEAP and rate-limit-safe:
//   - PlayerSave x1 (60d window, cap 5000) — level distribution + cohort signups.
//   - DailyActivityLog x1 (60d window, cap 30000) — TRUE cohort retention
//     (per-week activity rows, not approximated from a single updated_at).
//   - RunHistoryLog x1 (14d window, cap 20000) — top characters / arenas
//     (immutable mirror of RunScore that survives the keep-top-scores cleanup
//     cron, so historical totals don't shrink).
//   - SquadMember x1 — squad membership rate (full list, cap 10000).
//   - All bucket math done in-memory.
//   - 5-minute server-side cache (these metrics shift slowly — DAU/MAU is on the
//     other endpoint with 60s cache for the more time-sensitive numbers).
//
// Returns:
//   {
//     generated_at,
//     cohorts: [{ cohort_week, signups, w0, w1, w2, w3 }] x ~6 weeks
//     level_distribution: [{ bucket, count }],
//     top_characters: [{ id, runs, share_pct }] x 10,
//     top_arenas:     [{ id, runs, share_pct }] x 10,
//     squad_membership: { in_squad, solo, pct_in_squad, total_active },
//   }

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

let _cache = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 min

// Map a timestamp to the Monday-start of its ISO week (UTC), as YYYY-MM-DD.
function isoWeekStart(ms) {
    const d = new Date(ms);
    const day = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
    d.setUTCDate(d.getUTCDate() - (day - 1));
    d.setUTCHours(0, 0, 0, 0);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function levelBucket(level) {
    const lvl = Number(level) || 0;
    if (lvl <= 0)   return '0 (new)';
    if (lvl <= 5)   return '1–5';
    if (lvl <= 10)  return '6–10';
    if (lvl <= 20)  return '11–20';
    if (lvl <= 35)  return '21–35';
    if (lvl <= 50)  return '36–50';
    return '50+';
}
const LEVEL_ORDER = ['0 (new)', '1–5', '6–10', '11–20', '21–35', '36–50', '50+'];

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

        // --- READ 1: All PlayerSaves active in last 60 days (for cohort + level dist) ---
        // 60-day window covers ~6 weekly cohorts with their W0–W3 retention buckets.
        const since60 = now - 60 * DAY;
        const players = await db.entities.PlayerSave.filter(
            { updated_at: { $gte: since60 } },
            '-updated_at',
            5000
        );

        // --- COHORT RETENTION ---
        // Cohort = ISO week of created_date. For each cohort: count signups,
        // then count wallets that have a DailyActivityLog row falling inside
        // each of W+0, W+1, W+2, W+3. This is TRUE per-week retention — the
        // previous "lastSeen >= weekStart" approximation made any returning
        // player retroactively count as retained in every prior week, which
        // is why the numbers shifted every day.
        const cohorts = new Map(); // cohort_week -> { signups: Set, w0: Set, w1: Set, w2: Set, w3: Set, startMs }
        const ensureCohort = (key) => {
            if (!cohorts.has(key)) {
                cohorts.set(key, {
                    signups: new Set(), w0: new Set(), w1: new Set(), w2: new Set(), w3: new Set(),
                    startMs: new Date(key + 'T00:00:00Z').getTime(),
                });
            }
            return cohorts.get(key);
        };
        const walletCohort = new Map(); // wallet -> cohort_week (for fast lookup during DailyActivityLog pass)

        const nowWeekStart = new Date(isoWeekStart(now) + 'T00:00:00Z').getTime();

        for (const p of players) {
            const w = (p.wallet_address || '').toLowerCase();
            if (!w || !p.created_date) continue;
            const createdMs = new Date(p.created_date).getTime();
            if (now - createdMs > 60 * DAY) continue; // only cohorts in our window

            const cohortKey = isoWeekStart(createdMs);
            const c = ensureCohort(cohortKey);
            c.signups.add(w);
            walletCohort.set(w, cohortKey);
        }

        // Pull DailyActivityLog rows for the cohort window (60d) and assign
        // each row to its wallet's cohort's W0/W1/W2/W3 bucket based on the
        // log's date_key. Bounded read — 60d × ~MAU rows per day, capped 30k.
        const since60Iso = new Date(now - 60 * DAY).toISOString().split('T')[0];
        let cohortLogs = [];
        try {
            cohortLogs = await db.entities.DailyActivityLog.filter(
                { date_key: { $gte: since60Iso } },
                '-date_key',
                30000
            );
        } catch (logErr) {
            console.warn('[getPlayerDeepMetrics] DailyActivityLog read failed:', logErr.message);
        }
        for (const log of cohortLogs) {
            const w = (log.wallet_address || '').toLowerCase();
            const cohortKey = walletCohort.get(w);
            if (!cohortKey) continue;
            const c = cohorts.get(cohortKey);
            if (!c) continue;
            const logMs = new Date(log.date_key + 'T00:00:00Z').getTime();
            const weekOffset = Math.floor((logMs - c.startMs) / WEEK);
            if (weekOffset >= 0 && weekOffset <= 3) {
                c[`w${weekOffset}`].add(w);
            }
        }

        // Serialize cohorts oldest → newest, drop the current incomplete week from
        // the tail if it's the same as nowWeekStart (W0 ongoing is fine, but very
        // young cohorts give misleading numbers — we keep all and let the UI label them).
        const cohortRows = [...cohorts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([cohort_week, c]) => {
                const signups = c.signups.size;
                const w0 = c.w0.size;
                const w1 = c.w1.size;
                const w2 = c.w2.size;
                const w3 = c.w3.size;
                const ageWeeks = Math.floor((nowWeekStart - c.startMs) / WEEK);
                return {
                    cohort_week,
                    age_weeks: ageWeeks,
                    signups,
                    w0,
                    w1: ageWeeks >= 1 ? w1 : null,
                    w2: ageWeeks >= 2 ? w2 : null,
                    w3: ageWeeks >= 3 ? w3 : null,
                    w1_pct: ageWeeks >= 1 && signups > 0 ? Math.round((w1 / signups) * 100) : null,
                    w2_pct: ageWeeks >= 2 && signups > 0 ? Math.round((w2 / signups) * 100) : null,
                    w3_pct: ageWeeks >= 3 && signups > 0 ? Math.round((w3 / signups) * 100) : null,
                };
            });

        // --- LEVEL DISTRIBUTION (active in last 14 days only — current playerbase shape) ---
        const since14 = now - 14 * DAY;
        const levelCounts = new Map();
        for (const k of LEVEL_ORDER) levelCounts.set(k, 0);
        for (const p of players) {
            if (!p.updated_at || p.updated_at < since14) continue;
            const lvl = Number(p.save_data?.level) || 0;
            const bucket = levelBucket(lvl);
            levelCounts.set(bucket, (levelCounts.get(bucket) || 0) + 1);
        }
        const level_distribution = LEVEL_ORDER.map(bucket => ({
            bucket,
            count: levelCounts.get(bucket) || 0,
        }));

        // --- READ 2: RunHistoryLog — last 14 days (top characters / arenas) ---
        // Reads from the immutable RunHistoryLog (written by saveScore alongside
        // every RunScore.create) instead of RunScore itself — RunScore rows get
        // soft-deleted by the keep-top-scores cleanup cron, so historical totals
        // pulled from it shrink over time. The log entity carries only the four
        // fields we need (wallet, character, arena, date_key) so the read is small.
        const since14Key = new Date(now - 14 * DAY).toISOString().split('T')[0];
        const runs = await db.entities.RunHistoryLog.filter(
            { date_key: { $gte: since14Key } },
            '-date_key',
            20000
        );

        const charCounts = new Map();
        const arenaCounts = new Map();
        for (const r of runs) {
            if (r.character_id) charCounts.set(r.character_id, (charCounts.get(r.character_id) || 0) + 1);
            if (r.arena_id)     arenaCounts.set(r.arena_id, (arenaCounts.get(r.arena_id) || 0) + 1);
        }
        const totalRuns = runs.length;
        const toTopList = (map) => [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, runs]) => ({
                id,
                runs,
                share_pct: totalRuns > 0 ? Math.round((runs / totalRuns) * 100 * 10) / 10 : 0,
            }));
        const top_characters = toTopList(charCounts);
        const top_arenas = toTopList(arenaCounts);

        // --- READ 3: Squad membership rate ---
        // Membership is a single row per (wallet, squad). We count distinct wallets
        // and intersect with the 14d-active set from PlayerSave.
        const activeWallets = new Set(
            players
                .filter(p => p.updated_at && p.updated_at >= since14 && p.wallet_address)
                .map(p => p.wallet_address.toLowerCase())
        );
        const members = await db.entities.SquadMember.list('-created_date', 10000);
        const inSquadWallets = new Set();
        for (const m of members) {
            const w = (m.wallet_address || '').toLowerCase();
            if (w && activeWallets.has(w)) inSquadWallets.add(w);
        }
        const totalActive = activeWallets.size;
        const inSquad = inSquadWallets.size;
        const solo = Math.max(0, totalActive - inSquad);
        const squad_membership = {
            in_squad: inSquad,
            solo,
            total_active: totalActive,
            pct_in_squad: totalActive > 0 ? Math.round((inSquad / totalActive) * 100) : 0,
        };

        const data = {
            generated_at: now,
            window_note: 'Cohorts: 60d. Levels & top content & squad rate: 14d active.',
            cohorts: cohortRows,
            level_distribution,
            top_characters,
            top_arenas,
            top_run_count: totalRuns,
            squad_membership,
        };

        _cache = { generated_at: now, data };
        return Response.json(data);
    } catch (error) {
        console.error('[getPlayerDeepMetrics]', error);
        return Response.json({ error: error?.message || String(error) }, { status: 500 });
    }
});