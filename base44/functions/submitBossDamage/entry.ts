import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 429-aware retry wrapper — protects raid contributions from being silently lost
// when Base44's per-app rate limit fires during peak (e.g. when many raiders
// submit damage at once). Without this, the boss HP update or contribution row
// can 500 mid-sequence and the player's damage drops on the floor.
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
            console.warn(`[submitBossDamage] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

// Auth: Base44 session. Wallet: from linked User.wallet_address.

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
function getCurrentPeriodIds() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    const season_id = `${isoYear}-S${seasonNum}`;
    return { week_id, season_id };
}

// 5M cap — fully-upgraded top-tier players legitimately push 1-3M per raid run,
// so 500k was clipping real damage. 5M still blocks tampered clients from one-shotting
// high-level bosses (Lv.7 = 3.2M HP, Lv.8 = 6.4M) and milestone-farming via inflation.
const MAX_DAMAGE_PER_SUBMISSION = 5_000_000;
const BOSS_BASE_HP = 50000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to join the raid.' }, { status: 401 });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const { damage, is_sandbox } = await req.json();
        if (typeof damage !== 'number' || damage <= 0) {
            return Response.json({ error: 'Couldn\'t record your damage — please try again.' }, { status: 400 });
        }
        // S8 Sandbox — practice runs never contribute to the global raid boss.
        if (is_sandbox === true) {
            return Response.json({ success: false, sandbox: true });
        }

        const clampedDamage = Math.min(damage, MAX_DAMAGE_PER_SUBMISSION);
        const { week_id } = getCurrentPeriodIds();

        // Authoritative pilot name lookup — mirrors saveScore/squadActions/createSquad.
        // Bug 2026-05-13 (Anubis raid feed): client was passing user.player_name
        // OR user.full_name as a fallback. When player_name was empty, full_name leaked
        // through, and the server's anti-leak check correctly anonymized it to
        // Pilot_XXXXXX — so legit pilots with no profile name (or where the client
        // fallback fired) all showed as generic Pilot_XXXXXX in the contributors list.
        //
        // Fix: stop trusting any client-submitted name. Read PlayerSave.player_name
        // directly (that's the profile-set, trusted pilot name) and fall back to
        // Pilot_XXXXXX only when truly absent.
        const anonName = `Pilot_${walletAddress.slice(-6).toUpperCase()}`;
        let trustedPilotName = '';
        try {
            const saves = await with429Retry(
                () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress }),
                'PlayerSave.filter'
            );
            trustedPilotName = (saves[0]?.player_name || '').trim();
        } catch (e) {
            console.warn('[submitBossDamage] PlayerSave lookup failed, using anon:', e.message);
        }
        // Final safety: never display the raw OAuth full_name even if it somehow
        // ended up stored as player_name (legacy data).
        const realName = (me.full_name || '').trim().toLowerCase();
        const displayName = (!trustedPilotName || (realName && trustedPilotName.toLowerCase() === realName))
            ? anonName
            : trustedPilotName;

        // Look up squad membership so contributions can be aggregated for the squad raid leaderboard
        let squadInfo = { squad_id: '', squad_name: '', squad_tag: '', squad_icon: '' };
        try {
            const memberRecords = await with429Retry(
                () => base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletAddress }),
                'SquadMember.filter'
            );
            if (memberRecords.length > 0) {
                const sq = await with429Retry(
                    () => base44.asServiceRole.entities.Squad.get(memberRecords[0].squad_id),
                    'Squad.get'
                );
                if (sq) {
                    squadInfo = {
                        squad_id: sq.id,
                        squad_name: sq.name || '',
                        squad_tag: sq.tag || '',
                        squad_icon: sq.icon || '🛡️',
                    };
                }
            }
        } catch (e) {
            console.log('[submitBossDamage] Could not fetch squad membership:', e.message);
        }

        // Create GlobalBossEvent (live activity feed)
        try {
            await with429Retry(
                () => base44.asServiceRole.entities.GlobalBossEvent.create({
                    week_id,
                    player_name: displayName,
                    event_type: 'damage',
                    damage: clampedDamage,
                    message: `${displayName} dealt ${Math.floor(clampedDamage).toLocaleString()} damage!`
                }),
                'GlobalBossEvent.create'
            );
        } catch (e) {
            console.error('[submitBossDamage] Event creation failed:', e.message);
        }

        // Create GlobalBossContribution (per-run contribution log used for reward claims)
        try {
            await with429Retry(
                () => base44.asServiceRole.entities.GlobalBossContribution.create({
                    week_id,
                    user_id: walletAddress,
                    player_name: displayName,
                    damage: clampedDamage,
                    claimed: false,
                    ...squadInfo,
                }),
                'GlobalBossContribution.create'
            );
        } catch (e) {
            console.error('[submitBossDamage] Contribution failed:', e.message);
        }

        // Update the boss HP. If the boss reaches 0 HP, level it up and refill HP
        // (HP scales with level so each tier is harder than the last).
        let bossUpdate = null;
        try {
            const bossRecords = await with429Retry(
                () => base44.asServiceRole.entities.GlobalBoss.filter({ week_id }),
                'GlobalBoss.filter'
            );
            if (bossRecords.length > 0) {
                const boss = bossRecords[0];
                let newHp = (boss.current_hp || 0) - clampedDamage;
                let newLevel = boss.level || 1;
                let newMaxHp = boss.max_hp || BOSS_BASE_HP;
                let leveledUp = false;

                if (newHp <= 0) {
                    // Boss defeated — level up, scale HP, refill.
                    leveledUp = true;
                    newLevel += 1;
                    newMaxHp = Math.floor(BOSS_BASE_HP * Math.pow(2, newLevel - 1));
                    newHp = newMaxHp;

                    // Log a kill event
                    try {
                        await base44.asServiceRole.entities.GlobalBossEvent.create({
                            week_id,
                            player_name: displayName,
                            event_type: 'kill',
                            damage: clampedDamage,
                            level: newLevel - 1,
                            message: `${displayName} dealt the killing blow! Boss reached Lv.${newLevel}!`
                        });
                    } catch (e) {
                        console.error('[submitBossDamage] Kill event failed:', e.message);
                    }
                }

                bossUpdate = await with429Retry(
                    () => base44.asServiceRole.entities.GlobalBoss.update(boss.id, {
                        current_hp: newHp,
                        max_hp: newMaxHp,
                        level: newLevel,
                    }),
                    'GlobalBoss.update'
                );

                if (leveledUp) {
                    console.log('[submitBossDamage] Boss leveled up to', newLevel, 'new HP:', newMaxHp);
                }
            }
        } catch (e) {
            console.error('[submitBossDamage] Boss HP update failed:', e.message);
        }

        console.log('[submitBossDamage] Recorded damage:', clampedDamage, 'for wallet:', walletAddress);
        return Response.json({ success: true, damage: clampedDamage, boss: bossUpdate });
    } catch (error) {
        console.error('[submitBossDamage]', error.message);
        return Response.json({ error: 'Couldn\'t record your raid damage. Please try again.' }, { status: 500 });
    }
});