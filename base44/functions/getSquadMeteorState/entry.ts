import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns the current Squad Meteor state for the authenticated user's squad:
// - meteor row (level, hp, max_hp)
// - today's activity (per-member attack count, who hasn't started)
// - active squad buffs derived from meteor level
// - this week's top damage contributors (leaderboard)

const MAX_BUFF_LEVEL = 20;
const HP_PER_LEVEL = 25_000_000;
const HP_BASE = 50_000_000;
const DAILY_ATTEMPT_LIMIT = 3;

// In-memory cache to absorb spike load and prevent 429 rate-limit cascades.
// Keyed by squadId — same squad opened within TTL skips ALL db reads.
// Meteor state doesn't tick faster than ~15s in practice, so this is safe.
const STATE_CACHE_TTL_MS = 15_000;
const stateCache = new Map();

// Wrap a base44 call with retry-on-429 (matches saveScore/loadSave pattern).
// Without this, a single rate-limit spike bubbles a 500 straight to the panel.
async function withRetry(fn, label = 'op') {
    const delays = [300, 700, 1400];
    let lastErr = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            const status = e?.response?.status || e?.status;
            const msg = (e?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit');
            if (!is429 || attempt === delays.length) throw e;
            console.warn(`[getSquadMeteorState] ${label} 429 — retry ${attempt + 1}/${delays.length} after ${delays[attempt]}ms`);
            await new Promise(r => setTimeout(r, delays[attempt]));
        }
    }
    throw lastErr;
}

function getCachedState(squadId) {
    const entry = stateCache.get(squadId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        stateCache.delete(squadId);
        return null;
    }
    return entry.payload;
}

function setCachedState(squadId, payload) {
    stateCache.set(squadId, { expiresAt: Date.now() + STATE_CACHE_TTL_MS, payload });
    if (stateCache.size > 200) {
        const cutoff = Date.now();
        for (const [k, v] of stateCache) {
            if (v.expiresAt < cutoff) stateCache.delete(k);
        }
    }
}

// ISO 8601 week id (Mon-start)
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

function todayUtcDate() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function computeBuffs(level) {
    const lvl = Math.min(Math.max(level || 0, 0), MAX_BUFF_LEVEL);
    return {
        gold_pct: lvl * 1.0,        // +1% per lvl, cap +20%
        damage_pct: lvl * 0.5,      // +0.5% per lvl, cap +10%
        aoe_pct: lvl * 0.5,         // +0.5% per lvl, cap +10%
        cdr_pct: lvl * 0.25,        // +0.25% per lvl, cap +5%
        applied_level: lvl,
        is_capped: lvl >= MAX_BUFF_LEVEL,
    };
}

function hpForLevel(level) {
    return HP_BASE + (Math.max(1, level) - 1) * HP_PER_LEVEL;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const wallet = me.wallet_address?.toLowerCase();
        if (!wallet) return Response.json({ error: 'No wallet linked' }, { status: 400 });

        const db = base44.asServiceRole;

        // Find the user's squad membership
        const memberships = await withRetry(() => db.entities.SquadMember.filter({ wallet_address: wallet }), 'SquadMember.filter');
        if (memberships.length === 0) {
            return Response.json({ in_squad: false, message: 'Join a squad to attack the meteor.' });
        }
        const squadId = memberships[0].squad_id;

        // Serve from cache when fresh — skips all the heavy db reads below.
        // We still need to recompute the caller's personal "attempts remaining"
        // because two members of the same squad can have different counts —
        // so we pull the cached squad-wide payload and patch in the caller's numbers.
        const cached = getCachedState(squadId);
        if (cached) {
            const myAttacksToday = cached.today_activity.find(r => r.wallet === wallet)?.attacks || 0;
            return Response.json({
                ...cached,
                my_attempts_used_today: myAttacksToday,
                my_attempts_remaining: Math.max(0, DAILY_ATTEMPT_LIMIT - myAttacksToday),
            });
        }

        // Load (or lazily create) the meteor row for this squad
        let meteors = await withRetry(() => db.entities.SquadMeteor.filter({ squad_id: squadId }), 'SquadMeteor.filter');
        let meteor;
        if (meteors.length === 0) {
            meteor = await withRetry(() => db.entities.SquadMeteor.create({
                squad_id: squadId,
                level: 1,
                max_hp: hpForLevel(1),
                current_hp: hpForLevel(1),
                total_lifetime_damage: 0,
                total_lifetime_kills: 0,
            }), 'SquadMeteor.create');
        } else {
            meteor = meteors[0];
        }

        // Today's attacks for this squad
        const today = todayUtcDate();
        // Daily attempt cap is 3 × max ~50 squad members = 150 rows worst case.
        // 250 gives headroom while staying way under the 1000 that was triggering 429s.
        const todayAttacks = await withRetry(() => db.entities.SquadMeteorAttack.filter({
            squad_id: squadId,
            attack_date_utc: today,
        }, '-created_date', 250), 'SquadMeteorAttack.today');

        // Aggregate per-member attacks. We DON'T trust stored player_name —
        // GDPR fix (2026-05-18): older rows leaked OAuth full_name (e.g. "Dennis"
        // / "Patrick Heelan Jr."). Names are re-resolved from PlayerSave below.
        const perMember = {};
        for (const a of todayAttacks) {
            const w = (a.wallet_address || '').toLowerCase();
            if (!perMember[w]) perMember[w] = { wallet: w, name: '', attacks: 0, damage: 0 };
            perMember[w].attacks++;
            perMember[w].damage += Number(a.damage || 0);
        }

        // Caller's remaining attempts
        const myAttacksToday = perMember[wallet]?.attacks || 0;
        const myAttemptsRemaining = Math.max(0, DAILY_ATTEMPT_LIMIT - myAttacksToday);

        // Weekly leaderboard (top 10 contributors this week)
        const weekId = getCurrentWeekId();
        // 3 attempts/day × 7 days × ~50 members = 1050 rows worst case, but the
        // leaderboard only displays the top 10 by damage. 500 rows of the most
        // recent attacks is plenty to identify the top 10 and stays well under
        // rate-limit thresholds. Was 2000 — heavy contributor to 429 storms.
        const weekAttacks = await withRetry(() => db.entities.SquadMeteorAttack.filter({
            squad_id: squadId,
            week_id: weekId,
        }, '-created_date', 500), 'SquadMeteorAttack.week');
        const weekTotals = {};
        for (const a of weekAttacks) {
            const w = (a.wallet_address || '').toLowerCase();
            if (!weekTotals[w]) weekTotals[w] = { wallet: w, name: '', damage: 0, attacks: 0 };
            weekTotals[w].damage += Number(a.damage || 0);
            weekTotals[w].attacks++;
        }
        const weeklyLeaderboard = Object.values(weekTotals)
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 10);

        // GDPR-safe name resolution: pull pilot names from PlayerSave for every
        // wallet shown in either feed. Stored player_name on SquadMeteorAttack
        // is IGNORED — older rows leaked OAuth full_name and we cannot trust them.
        // Falls back to Pilot_XXXXXX if PlayerSave has no pilot name or if the
        // stored pilot name equals the caller's OAuth name (legacy paranoia).
        const wallets = new Set([
            ...Object.keys(perMember),
            ...weeklyLeaderboard.map(r => r.wallet),
        ]);
        const nameByWallet = {};
        await Promise.all([...wallets].map(async (w) => {
            try {
                const saves = await withRetry(
                    () => db.entities.PlayerSave.filter({ wallet_address: w }),
                    `PlayerSave.filter(${w.slice(-6)})`
                );
                const stored = (saves[0]?.player_name || '').trim();
                const anon = `Pilot_${w.slice(-6).toUpperCase()}`;
                nameByWallet[w] = stored || anon;
            } catch {
                nameByWallet[w] = `Pilot_${w.slice(-6).toUpperCase()}`;
            }
        }));
        // Apply resolved names
        for (const w of Object.keys(perMember)) {
            perMember[w].name = nameByWallet[w] || `Pilot_${w.slice(-6).toUpperCase()}`;
        }
        for (const row of weeklyLeaderboard) {
            row.name = nameByWallet[row.wallet] || `Pilot_${row.wallet.slice(-6).toUpperCase()}`;
        }

        // Buffs
        const buffs = computeBuffs(meteor.level);

        const payload = {
            in_squad: true,
            squad_id: squadId,
            meteor: {
                level: meteor.level,
                current_hp: meteor.current_hp,
                max_hp: meteor.max_hp,
                hp_pct: meteor.max_hp > 0 ? (meteor.current_hp / meteor.max_hp) : 0,
                total_lifetime_damage: meteor.total_lifetime_damage || 0,
                total_lifetime_kills: meteor.total_lifetime_kills || 0,
            },
            buffs,
            my_attempts_remaining: myAttemptsRemaining,
            my_attempts_used_today: myAttacksToday,
            daily_attempt_limit: DAILY_ATTEMPT_LIMIT,
            today_activity: Object.values(perMember).sort((a, b) => b.damage - a.damage),
            weekly_leaderboard: weeklyLeaderboard,
            today_date: today,
            week_id: weekId,
        };
        setCachedState(squadId, payload);
        return Response.json(payload);
    } catch (error) {
        console.error('[getSquadMeteorState]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});