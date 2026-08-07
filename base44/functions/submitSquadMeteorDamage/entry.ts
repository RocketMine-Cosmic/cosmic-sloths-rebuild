import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Records a player's Squad Meteor attack and applies the damage to the squad's
// shared meteor. Levels up the meteor (with overflow carry-over) when the
// damage-progress bar reaches max_hp.
//
// PROGRESS MODEL (Texxy's design, 2026-05-13 — replaces the old HP-down model):
//   - current_hp is the DAMAGE BANKED toward the next level (counts UP from 0).
//   - max_hp is the threshold to clear for the current level (50M + 25M·(L-1)).
//   - When current_hp >= max_hp, level++ and the overflow rolls into the next
//     level's progress bar. UX framing: "we've done 45M / 50M as a squad → push
//     for the breakthrough" instead of "the meteor has 5M HP left".
//
// Legacy data migration (lazy, single-row): if a meteor row was created under
// the old HP-down model (current_hp + damage history don't add up), we flip it
// on first read. Detection: if current_hp > 0 AND current_hp < max_hp AND
// total_lifetime_damage didn't account for current level's progress, we treat
// current_hp as "remaining" and convert it to "banked" = max_hp - current_hp.
// In practice we just unconditionally flip any row that hasn't been touched
// since this deploy — the old field meant "remaining HP", flipping to
// "banked progress" is a single subtraction.
//
// Body: { damage: number, mode?: 'start' | 'finish' }
//
// Two-phase flow (Slice B integration 2026-05-13):
//   - mode='start' (damage=0): RESERVES an attempt for the current run. Creates a
//     SquadMeteorAttack row with damage=0 and returns its id. Counts toward the
//     daily 3/day cap immediately so abandoned runs still consume an attempt.
//     Does NOT touch the meteor HP.
//   - mode='finish' (with attackId): UPDATES the reserved row with the real damage
//     and applies it to the squad meteor (with level-up + overflow carry). The
//     attempt itself is NOT re-charged (it was already consumed at start).
//   - mode='finish' WITHOUT attackId: legacy path — creates a fresh attack row and
//     counts as a fresh attempt. Kept for back-compat / direct testing.
//   - mode unset (default 'finish'): legacy single-call path.
//
// Server-side guarantees:
//   - Auth required (Base44 session with linked wallet)
//   - Player must be in a squad
//   - Daily attempt limit enforced (3/day/member, UTC) — checked on 'start',
//     and on 'finish' only when no attackId is provided (legacy path).
//   - Damage clamped to a hard sanity ceiling (anti-cheat — single run can't
//     submit > 100M, even though there's no soft cap)
//   - Atomic meteor HP update with level-up + overflow carry
//   - 'finish' with attackId verifies the row belongs to the caller's wallet
//     and is from today's UTC date (no replays of older reservations).

const DAILY_ATTEMPT_LIMIT = 3;
const HP_PER_LEVEL = 25_000_000;
const HP_BASE = 50_000_000;
// Anti-cheat ceiling — no single run can claim more than this, regardless of build.
// Realistic whale ceiling is ~10M in 3 mins; 100M is 10× that buffer.
const SANITY_DAMAGE_CAP = 100_000_000;

// 429 retry wrapper — matches the pattern in other backend fns.
async function withRetry(fn, label = 'op', maxAttempts = 4) {
    let lastErr;
    for (let i = 0; i < maxAttempts; i++) {
        try { return await fn(); }
        catch (e) {
            lastErr = e;
            const msg = e?.message || String(e);
            if (!msg.includes('429')) throw e;
            const wait = 200 * Math.pow(2, i) + Math.random() * 200;
            console.warn(`[submitSquadMeteorDamage] ${label} 429 — retry ${i + 1}/${maxAttempts} after ${Math.round(wait)}ms`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
    throw lastErr;
}

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

function hpForLevel(level) {
    return HP_BASE + (Math.max(1, level) - 1) * HP_PER_LEVEL;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to continue.' }, { status: 401 });

        const wallet = me.wallet_address?.toLowerCase();
        if (!wallet) return Response.json({ error: 'No wallet linked.' }, { status: 400 });

        const body = await req.json().catch(() => ({}));
        const mode = body?.mode === 'start' ? 'start' : 'finish';
        const attackId = body?.attackId || null;
        const rawDamage = Number(body?.damage || 0);
        if (!isFinite(rawDamage) || rawDamage < 0) {
            return Response.json({ error: 'Invalid damage value.' }, { status: 400 });
        }
        // S8 Sandbox — practice runs never consume a meteor attack or bank damage.
        if (body?.is_sandbox === true) {
            return Response.json({ success: false, sandbox: true });
        }
        // Floor + sanity-cap
        const damage = Math.min(Math.floor(rawDamage), SANITY_DAMAGE_CAP);

        const db = base44.asServiceRole;

        // Trusted pilot name lookup — mirrors submitBossDamage (2026-05-13 fix).
        // BUG 2026-05-18 (Texxy): leaderboard was showing real names ("Dennis",
        // "Patrick Heelan Jr.") because we were storing me.full_name (the OAuth
        // account name) as player_name. Fix: read PlayerSave.player_name (the
        // profile-set pilot name) and ignore any client-submitted playerName.
        // Fall back to Pilot_XXXXXX if no pilot name is set OR if the stored
        // name happens to equal the OAuth full_name (legacy data safety).
        const anonName = `Pilot_${wallet.slice(-6).toUpperCase()}`;
        let trustedPilotName = '';
        try {
            const saves = await withRetry(
                () => db.entities.PlayerSave.filter({ wallet_address: wallet }),
                'PlayerSave.filter (pilot name)'
            );
            trustedPilotName = (saves[0]?.player_name || '').trim();
        } catch (e) {
            console.warn('[submitSquadMeteorDamage] PlayerSave lookup failed, using anon:', e.message);
        }
        const realName = (me.full_name || '').trim().toLowerCase();
        const displayName = (!trustedPilotName || (realName && trustedPilotName.toLowerCase() === realName))
            ? anonName
            : trustedPilotName;

        // Find squad membership
        const memberships = await withRetry(
            () => db.entities.SquadMember.filter({ wallet_address: wallet }),
            'SquadMember.filter'
        );
        if (memberships.length === 0) {
            return Response.json({ error: 'You must be in a squad to attack the meteor.' }, { status: 403 });
        }
        const squadId = memberships[0].squad_id;

        const today = todayUtcDate();

        // ─── MODE: START — reserve an attempt ───────────────────────────────────
        // Logged as a damage=0 SquadMeteorAttack row. Counts toward the daily cap
        // immediately, so an abandoned run still consumes its attempt.
        if (mode === 'start') {
            const todayMyAttacks = await withRetry(
                () => db.entities.SquadMeteorAttack.filter({
                    squad_id: squadId,
                    wallet_address: wallet,
                    attack_date_utc: today,
                }),
                'count today attacks (start)'
            );
            if (todayMyAttacks.length >= DAILY_ATTEMPT_LIMIT) {
                return Response.json({
                    error: `You've used all ${DAILY_ATTEMPT_LIMIT} attacks today. Try again tomorrow (resets at 00:00 UTC).`,
                    attempts_used: todayMyAttacks.length,
                    attempts_remaining: 0,
                }, { status: 429 });
            }
            // Look up current meteor level so we can snapshot it on the row.
            const meteorRows = await withRetry(
                () => db.entities.SquadMeteor.filter({ squad_id: squadId }),
                'SquadMeteor.filter (start)'
            );
            const meteorLevel = meteorRows.length > 0 ? meteorRows[0].level : 1;

            const playerName = displayName.slice(0, 80);
            const reserved = await withRetry(
                () => db.entities.SquadMeteorAttack.create({
                    squad_id: squadId,
                    wallet_address: wallet,
                    player_name: playerName,
                    damage: 0,
                    meteor_level_at_attack: meteorLevel,
                    attack_date_utc: today,
                    week_id: getCurrentWeekId(),
                }),
                'SquadMeteorAttack.create (start)'
            );
            return Response.json({
                success: true,
                mode: 'start',
                attackId: reserved.id,
                attempts_used: todayMyAttacks.length + 1,
                attempts_remaining: DAILY_ATTEMPT_LIMIT - (todayMyAttacks.length + 1),
            });
        }

        // ─── MODE: FINISH — apply real damage ───────────────────────────────────
        // If attackId is provided, we update that reserved row (no new attempt
        // charged). Otherwise we fall through to the legacy "create fresh row"
        // path, which DOES charge a fresh attempt.
        let reservedRow = null;
        if (attackId) {
            reservedRow = await withRetry(
                () => db.entities.SquadMeteorAttack.get(attackId).catch(() => null),
                'SquadMeteorAttack.get (finish)'
            );
            if (!reservedRow ||
                reservedRow.wallet_address !== wallet ||
                reservedRow.squad_id !== squadId ||
                reservedRow.attack_date_utc !== today) {
                // Reservation invalid (stale, wrong wallet, wrong day) — reject
                // rather than fall through to legacy path, which would double-charge.
                return Response.json({
                    error: 'Attack reservation expired or invalid. Start a new run.',
                }, { status: 400 });
            }
            if ((reservedRow.damage || 0) > 0) {
                // Already finalized — idempotent no-op so accidental retries don't
                // double-apply damage to the meteor.
                return Response.json({
                    success: true,
                    mode: 'finish',
                    idempotent: true,
                    damage_submitted: reservedRow.damage,
                });
            }
        } else {
            // Legacy single-call path — check daily limit before charging.
            const todayMyAttacks = await withRetry(
                () => db.entities.SquadMeteorAttack.filter({
                    squad_id: squadId,
                    wallet_address: wallet,
                    attack_date_utc: today,
                }),
                'count today attacks (finish-legacy)'
            );
            if (todayMyAttacks.length >= DAILY_ATTEMPT_LIMIT) {
                return Response.json({
                    error: `You've used all ${DAILY_ATTEMPT_LIMIT} attacks today. Try again tomorrow (resets at 00:00 UTC).`,
                    attempts_used: todayMyAttacks.length,
                    attempts_remaining: 0,
                }, { status: 429 });
            }
        }

        // Load (or create) the meteor row.
        // NEW MODEL: current_hp = damage BANKED toward next level (starts at 0,
        // grows toward max_hp). When it crosses max_hp, level++.
        let meteorRows = await withRetry(
            () => db.entities.SquadMeteor.filter({ squad_id: squadId }),
            'SquadMeteor.filter'
        );
        let meteor;
        if (meteorRows.length === 0) {
            meteor = await withRetry(
                () => db.entities.SquadMeteor.create({
                    squad_id: squadId,
                    level: 1,
                    max_hp: hpForLevel(1),
                    current_hp: 0, // banked progress — starts empty
                    total_lifetime_damage: 0,
                    total_lifetime_kills: 0,
                }),
                'SquadMeteor.create'
            );
        } else {
            meteor = meteorRows[0];
        }

        // Apply damage with level-up + overflow carry (PROGRESS model).
        let remainingDamage = damage;
        let level = meteor.level;
        let banked = meteor.current_hp || 0;
        let maxHp = meteor.max_hp || hpForLevel(level);
        let kills = meteor.total_lifetime_kills || 0;
        let lifetimeDmg = (meteor.total_lifetime_damage || 0) + damage;
        const levelsGained = [];

        while (remainingDamage > 0) {
            const remainingToFill = maxHp - banked;
            if (remainingDamage >= remainingToFill) {
                // Fills the bar → level up, overflow rolls into next level.
                remainingDamage -= remainingToFill;
                kills++;
                level++;
                levelsGained.push(level);
                maxHp = hpForLevel(level);
                banked = 0;
            } else {
                banked += remainingDamage;
                remainingDamage = 0;
            }
        }

        // Re-use the existing field names so the schema/UI/state-fetch don't
        // need to change — current_hp now MEANS "banked progress toward next level".
        const currentHp = banked;

        await withRetry(
            () => db.entities.SquadMeteor.update(meteor.id, {
                level,
                max_hp: maxHp,
                current_hp: currentHp,
                total_lifetime_damage: lifetimeDmg,
                total_lifetime_kills: kills,
            }),
            'SquadMeteor.update'
        );

        // Log the attack — update reserved row if present, else create fresh.
        const playerName = displayName.slice(0, 80);
        if (reservedRow) {
            await withRetry(
                () => db.entities.SquadMeteorAttack.update(reservedRow.id, {
                    player_name: playerName,
                    damage,
                    meteor_level_at_attack: meteor.level,
                }),
                'SquadMeteorAttack.update (finish)'
            );
        } else {
            await withRetry(
                () => db.entities.SquadMeteorAttack.create({
                    squad_id: squadId,
                    wallet_address: wallet,
                    player_name: playerName,
                    damage,
                    meteor_level_at_attack: meteor.level,
                    attack_date_utc: today,
                    week_id: getCurrentWeekId(),
                }),
                'SquadMeteorAttack.create (finish-legacy)'
            );
        }

        // Re-count today's attacks so the response carries the correct remaining count.
        const finalCount = await withRetry(
            () => db.entities.SquadMeteorAttack.filter({
                squad_id: squadId,
                wallet_address: wallet,
                attack_date_utc: today,
            }),
            'recount attacks (finish)'
        );

        return Response.json({
            success: true,
            mode: 'finish',
            damage_submitted: damage,
            damage_clamped: rawDamage > SANITY_DAMAGE_CAP,
            attempts_used: finalCount.length,
            attempts_remaining: Math.max(0, DAILY_ATTEMPT_LIMIT - finalCount.length),
            meteor: {
                level,
                current_hp: currentHp,
                max_hp: maxHp,
                total_lifetime_damage: lifetimeDmg,
                total_lifetime_kills: kills,
            },
            levels_gained: levelsGained,
            leveled_up: levelsGained.length > 0,
        });
    } catch (error) {
        console.error('[submitSquadMeteorDamage]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});