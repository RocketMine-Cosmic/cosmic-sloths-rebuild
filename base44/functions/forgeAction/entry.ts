import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Server-authoritative Forge: handles Gold→Fragment conversion AND augment crafting.
// Locks starFragments, forgeWeaponAugments, forgeCharAugments, forgeConvertedToday cloud-only.
// 2026-05-04: added evolved weapon ids to VALID_WEAPON_IDS (Texxy 400 fix). v3
// 2026-05-04: 429-retry wrapper around PlayerSave reads/writes — during peak load
// the Base44 SDK returns 429 and the forge call would 500 with no recovery (Texxy v4).

async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 3) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[forgeAction] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

const GOLD_PER_FRAGMENT = 10000;
const DAILY_CONVERT_CAP = 30;

// S6 Phase 3b — Forge Lottery ("Mystery Forge").
// 5,000 gold per pull → grants ONE random unlocked weapon augment (T1/T2/T3) for the
// chosen weapon, weighted 60/30/10. Tier prereqs are still enforced server-side, so
// a T2/T3 roll downgrades to the next-needed tier in that branch (e.g. rolling area_3
// when you only own area_1 grants area_2). If every augment on the weapon is already
// owned, the call refunds with an error. S6+ only — pre-rollover returns 403.
const MYSTERY_FORGE_GOLD_COST = 5000;
// 2026-05-08 — fragments accepted as alt-payment (50 frags = 1 pull) so
// players sitting on dead fragment piles have a fun outlet without inflating
// the gold economy. See docs/S6_MASTER_PLAN.md §5b.
const MYSTERY_FORGE_FRAGMENT_COST = 50;

// ============================================================================
// Astral Lab (S6 endgame gold sink — Texxy proposal 2026-05-08)
// MUST mirror lib/astralLab.js. Each pull rolls a random stat buff at small
// per-pull magnitude, with a per-stat hard cap. Cost ramps each pull.
// ============================================================================
const ASTRAL_BASE_COST = 20000;
const ASTRAL_COST_GROWTH = 1.4;
function getAstralPullCost(pullCount) {
    return Math.floor(ASTRAL_BASE_COST * Math.pow(ASTRAL_COST_GROWTH, pullCount));
}
const ASTRAL_STATS = [
    { id: 'damageMult',    perPull: 0.02,  cap: 0.20 },
    { id: 'areaMult',      perPull: 0.02,  cap: 0.20 },
    { id: 'cooldownMult',  perPull: -0.01, cap: -0.10, invert: true },
    { id: 'speedMult',     perPull: 0.01,  cap: 0.10 },
    { id: 'projSpeedMult', perPull: 0.02,  cap: 0.20 },
    { id: 'regen',         perPull: 0.1,   cap: 1.0 },
    { id: 'magnetRange',   perPull: 5,     cap: 50 },
    { id: 'maxHp',         perPull: 5,     cap: 50 },
];
function rollAstralStat(buffs) {
    const eligible = ASTRAL_STATS.filter(s => {
        const cur = buffs?.[s.id] || 0;
        return s.invert ? cur > s.cap : cur < s.cap;
    });
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
}
// Locked design decision (per master plan §5b): T1 60% / T2 30% / T3 10%.
const MYSTERY_TIER_WEIGHTS = [
    { tier: 1, weight: 60 },
    { tier: 2, weight: 30 },
    { tier: 3, weight: 10 },
];
const MYSTERY_BRANCHES = ['damage', 'area', 'cd'];

// Proper ISO 8601 — mirrors lib/periodIds.js for the S6 gate + audit log fields.
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

function pickWeightedTier() {
    const total = MYSTERY_TIER_WEIGHTS.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of MYSTERY_TIER_WEIGHTS) {
        r -= t.weight;
        if (r <= 0) return t.tier;
    }
    return MYSTERY_TIER_WEIGHTS[0].tier;
}

// Resolves what augment to actually grant, given a rolled (branch, tier) and what
// the player already owns on this weapon. If the rolled tier is too high (prereq
// missing), step down to the next-needed tier in the same branch. Returns null
// only if the entire branch is already maxed out.
function resolveGrantedAugment(branch, rolledTier, ownedSet) {
    for (let t = rolledTier; t >= 1; t--) {
        const augId = `${branch}_${t}`;
        if (ownedSet.has(augId)) continue;
        // Check prereq is met — if not, this isn't the augment to grant; keep stepping down.
        const prereq = WEAPON_AUGMENT_PREREQS[augId];
        if (prereq && !ownedSet.has(prereq)) continue;
        return augId;
    }
    return null;
}

// Mirrors WEAPON_AUGMENTS in components/game/ForgePanel
const WEAPON_AUGMENT_COSTS = {
    damage_1: 3,  damage_2: 8,  damage_3: 20,
    area_1:   3,  area_2:   8,  area_3:   20,
    cd_1:     3,  cd_2:     8,  cd_3:     20,
};

// Tier prereqs — tier 2 of each branch needs tier 1 of the SAME branch on the
// SAME weapon, tier 3 needs tier 2. Mirrors the talents prereq pattern in
// purchaseSku.js. Without this, a player could skip straight to tier 3 (Hugo
// bug 2026-05-06: paying for tier 1 on one weapon was wrongly opening tier 2
// on every weapon since there was no per-weapon tier check at all).
const WEAPON_AUGMENT_PREREQS = {
    damage_2: 'damage_1',
    damage_3: 'damage_2',
    area_2:   'area_1',
    area_3:   'area_2',
    cd_2:     'cd_1',
    cd_3:     'cd_2',
};

// Mirrors CHAR_AUGMENTS in components/game/ForgePanel — flat id→cost map.
const CHAR_AUGMENT_COSTS = {
    neo_crit: 5, neo_chain: 15, neo_surge: 30,
    pan_armor: 5, pan_stomp: 15, pan_fortress: 30,
    nova_aoe: 5, nova_chain: 15, nova_nuke: 30,
    glt_phase: 5, glt_corrupt: 15, glt_copy: 30,
    holo_regen: 5, holo_speed: 15, holo_revive: 30,
    code_xp: 5, code_hack: 15, code_virus: 30,
    dat_ghost: 5, dat_drain: 15, dat_shade: 30,
    neo_range: 5, neo_pierce: 15, neo_rail: 30,
    syn_gold: 5, syn_beat: 15, syn_amp: 30,
    sky_speed: 5, sky_twin: 15, sky_ace: 30,
};

// Per-character augment tier prereqs — tier 2 needs tier 1 of the SAME character.
// Same Hugo bug (2026-05-06) — paying first tier on one operative was opening
// tier 2 for ALL operatives because there was no per-character ownership check.
const CHAR_AUGMENT_PREREQS = {
    neo_chain:    'neo_crit',     neo_surge:    'neo_chain',
    pan_stomp:    'pan_armor',    pan_fortress: 'pan_stomp',
    nova_chain:   'nova_aoe',     nova_nuke:    'nova_chain',
    glt_corrupt:  'glt_phase',    glt_copy:     'glt_corrupt',
    holo_speed:   'holo_regen',   holo_revive:  'holo_speed',
    code_hack:    'code_xp',      code_virus:   'code_hack',
    dat_drain:    'dat_ghost',    dat_shade:    'dat_drain',
    neo_pierce:   'neo_range',    neo_rail:     'neo_pierce',
    syn_beat:     'syn_gold',     syn_amp:      'syn_beat',
    sky_twin:     'sky_speed',    sky_ace:      'sky_twin',
};

const VALID_CHAR_IDS = new Set([
    'neobyte','pandypaws','novabyte','glitch','holodrift',
    'codebreaker','dataphantom','neonvortex','synthbeats','skybyte'
]);

// Base weapons + evolved/synergy weapons. The Forge UI lets players upgrade
// any weapon they can equip in a run, including evolutions like Orbital Defense
// Network. Pre-fix this list only had the 9 base weapons, so every player on
// an evolved weapon hit "Invalid weaponId" → 400 (Texxy 2026-05-04).
const VALID_WEAPON_IDS = new Set([
    // base
    'neoBlaster','napBeam','vineWhip','slothSwarm','napalm',
    'novaPulse','shieldBubble','bouncingBlade','toxicCloud',
    // evolved / synergy
    'orbitalDefense','supernovaBeam','aegisMatrix','quantumCollapse',
    'hellfire','vampiricLash','buzzsawSwarm',
]);

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

// Rotate across all 9 balance API keys (each 100 req/min) so a single rate-limited
// key doesn't make ownsCharacter fail and block the player from forging augments.
function getBalanceKeys() {
    const keys = [
        Deno.env.get('OMENX_BALANCE_API_KEY'),
        Deno.env.get('OMENX_BALANCE_API_KEY_2'),
        Deno.env.get('OMENX_BALANCE_API_KEY_3'),
        Deno.env.get('OMENX_BALANCE_API_KEY_4'),
        Deno.env.get('OMENX_BALANCE_API_KEY_5'),
        Deno.env.get('OMENX_BALANCE_API_KEY_6'),
        Deno.env.get('OMENX_BALANCE_API_KEY_7'),
        Deno.env.get('OMENX_BALANCE_API_KEY_8'),
        Deno.env.get('OMENX_BALANCE_API_KEY_9'),
    ].filter(Boolean);
    return keys.map(k => ({ k, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.k);
}

async function ownsCharacter(save, walletAddress, charId) {
    if (charId === 'neobyte') return true;
    const unlocked = save.unlockedCharacters || ['neobyte'];
    if (unlocked.includes(charId)) return true;
    try {
        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;
        const keys = getBalanceKeys();
        for (const key of keys) {
            const res = await fetch(`${apiBaseUrl}/v1/players/${walletAddress}?chainId=56`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) {
                const data = await res.json();
                const nfts = data?.nfts || [];
                return nfts.some(nft => (nft?.metadata?.name || '').toLowerCase() === charId);
            }
            // Retry only on rate-limit / server errors. Other 4xx → genuine miss.
            if (res.status !== 429 && res.status < 500) return false;
        }
        return false;
    } catch {
        return false;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'No wallet linked to user' }, { status: 400 });

        const { action, payload } = await req.json();
        if (!action) return Response.json({ error: 'action required' }, { status: 400 });

        const walletLower = wallet.toLowerCase();
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) {
            return Response.json({ error: 'PlayerSave not found — sync your save first' }, { status: 400 });
        }
        const saveRecord = records[0];
        const save = typeof saveRecord.save_data === 'string'
            ? JSON.parse(saveRecord.save_data)
            : saveRecord.save_data;

        const updated = { ...save };

        if (action === 'convert') {
            const amount = Math.max(1, Math.floor(Number(payload?.amount) || 0));
            if (amount <= 0) return Response.json({ error: 'amount must be > 0' }, { status: 400 });

            const today = getToday();
            const convertedToday = save.forgeConvertedToday?.date === today
                ? Number(save.forgeConvertedToday.count || 0)
                : 0;

            if (convertedToday + amount > DAILY_CONVERT_CAP) {
                return Response.json({ error: `Daily cap reached (${convertedToday}/${DAILY_CONVERT_CAP})` }, { status: 400 });
            }

            const goldCost = amount * GOLD_PER_FRAGMENT;
            const gold = Number(save.gold || 0);
            if (gold < goldCost) {
                return Response.json({ error: `Not enough gold (need ${goldCost}, have ${gold})` }, { status: 400 });
            }

            updated.gold = gold - goldCost;
            updated.starFragments = Number(save.starFragments || 0) + amount;
            updated.forgeConvertedToday = { date: today, count: convertedToday + amount };
        } else if (action === 'forgeWeaponAugment') {
            const weaponId = payload?.weaponId;
            const augmentId = payload?.augmentId;
            const overforge = !!payload?.overforge;
            if (!VALID_WEAPON_IDS.has(weaponId)) {
                return Response.json({ error: 'Invalid weaponId' }, { status: 400 });
            }
            const baseCost = WEAPON_AUGMENT_COSTS[augmentId];
            if (!baseCost) return Response.json({ error: 'Invalid augmentId' }, { status: 400 });

            const owned = save.forgeWeaponAugments?.[weaponId] || [];
            let cost = baseCost;

            if (overforge) {
                // Outer Galaxy "Overforge": tier-3 only, max 2 copies, 2× fragment cost.
                // The 2nd copy is stored as a duplicate ID in the array — engine's
                // getWeaponStatsAndMastery counts duplicates on Outer Galaxy runs
                // (Inner Galaxy still dedups via Set, so legacy balance is preserved).
                if (!augmentId.endsWith('_3')) {
                    return Response.json({ error: 'Only tier-3 augments can be overforged.' }, { status: 400 });
                }
                const ownCount = owned.filter(x => x === augmentId).length;
                if (ownCount === 0) {
                    return Response.json({ error: 'Forge the tier-3 augment first before overforging.' }, { status: 400 });
                }
                if (ownCount >= 2) {
                    return Response.json({ error: 'Augment already overforged (max 2).' }, { status: 400 });
                }
                cost = baseCost * 2;
            } else {
                if (owned.includes(augmentId)) {
                    return Response.json({ error: 'Augment already owned' }, { status: 400 });
                }
                // Tier gating — must own the previous tier of the same branch on this weapon.
                const wPrereq = WEAPON_AUGMENT_PREREQS[augmentId];
                if (wPrereq && !owned.includes(wPrereq)) {
                    return Response.json({ error: 'You need to forge the previous tier first.' }, { status: 400 });
                }
            }
            const fragments = Number(save.starFragments || 0);
            if (fragments < cost) {
                return Response.json({ error: `Not enough Star Fragments (need ${cost}, have ${fragments})` }, { status: 400 });
            }

            updated.starFragments = fragments - cost;
            updated.forgeWeaponAugments = {
                ...(save.forgeWeaponAugments || {}),
                [weaponId]: [...owned, augmentId],
            };
        } else if (action === 'forgeCharAugment') {
            const charId = payload?.charId;
            const augmentId = payload?.augmentId;
            if (!VALID_CHAR_IDS.has(charId)) {
                return Response.json({ error: 'Invalid charId' }, { status: 400 });
            }
            const cost = CHAR_AUGMENT_COSTS[augmentId];
            if (!cost) return Response.json({ error: 'Invalid augmentId' }, { status: 400 });

            // Player must own the character (kill-milestone unlock or NFT).
            const owns = await ownsCharacter(save, wallet, charId);
            if (!owns) {
                return Response.json({ error: `Character not unlocked: ${charId}` }, { status: 403 });
            }

            const owned = save.forgeCharAugments?.[charId] || [];
            if (owned.includes(augmentId)) {
                return Response.json({ error: 'Augment already owned' }, { status: 400 });
            }
            // Tier gating — must own the previous tier on THIS character.
            const cPrereq = CHAR_AUGMENT_PREREQS[augmentId];
            if (cPrereq && !owned.includes(cPrereq)) {
                return Response.json({ error: 'You need to forge the previous tier first.' }, { status: 400 });
            }
            const fragments = Number(save.starFragments || 0);
            if (fragments < cost) {
                return Response.json({ error: `Not enough Star Fragments (need ${cost}, have ${fragments})` }, { status: 400 });
            }

            updated.starFragments = fragments - cost;
            updated.forgeCharAugments = {
                ...(save.forgeCharAugments || {}),
                [charId]: [...owned, augmentId],
            };
        } else if (action === 'mysteryForge') {
            // S6+ gate — pre-rollover unavailable.
            const { season_id, week_id } = getCurrentPeriodIds();
            if (season_id === '2026-S5') {
                return Response.json({ error: 'Mystery Forge unlocks in Season 6.' }, { status: 403 });
            }
            const weaponId = payload?.weaponId;
            if (!VALID_WEAPON_IDS.has(weaponId)) {
                return Response.json({ error: 'Invalid weaponId' }, { status: 400 });
            }
            // Accept either 'gold' (default) or 'fragments' as payment.
            const paymentMode = payload?.paymentMode === 'fragments' ? 'fragments' : 'gold';
            const gold = Number(save.gold || 0);
            const fragments = Number(save.relicFragments || 0);
            if (paymentMode === 'gold' && gold < MYSTERY_FORGE_GOLD_COST) {
                return Response.json({
                    error: `Not enough gold — Mystery Forge costs ${MYSTERY_FORGE_GOLD_COST.toLocaleString()} (you have ${gold.toLocaleString()}).`
                }, { status: 400 });
            }
            if (paymentMode === 'fragments' && fragments < MYSTERY_FORGE_FRAGMENT_COST) {
                return Response.json({
                    error: `Not enough relic fragments — Mystery Forge costs ${MYSTERY_FORGE_FRAGMENT_COST} (you have ${fragments}).`
                }, { status: 400 });
            }

            const ownedArr = save.forgeWeaponAugments?.[weaponId] || [];
            const owned = new Set(ownedArr);
            // If every augment on this weapon is already forged, no point rolling.
            const allOwned = MYSTERY_BRANCHES.every(b => [1, 2, 3].every(t => owned.has(`${b}_${t}`)));
            if (allOwned) {
                return Response.json({ error: 'This weapon has every augment forged — nothing left to roll.' }, { status: 400 });
            }

            // Roll branch (uniform among branches that still have something to grant)
            // + tier (weighted). If the rolled (branch, tier) can't grant anything
            // (whole branch maxed), pick a different branch.
            const branchPool = MYSTERY_BRANCHES.filter(b => ![1, 2, 3].every(t => owned.has(`${b}_${t}`)));
            const branch = branchPool[Math.floor(Math.random() * branchPool.length)];
            const rolledTier = pickWeightedTier();
            const grantedAugId = resolveGrantedAugment(branch, rolledTier, owned);
            if (!grantedAugId) {
                // Fallback shouldn't trigger (branchPool guarantees at least one ungranted).
                return Response.json({ error: 'Couldn\'t pick a reward — please try again.' }, { status: 500 });
            }

            // Apply: deduct chosen currency, append augment.
            if (paymentMode === 'fragments') {
                updated.relicFragments = fragments - MYSTERY_FORGE_FRAGMENT_COST;
            } else {
                updated.gold = gold - MYSTERY_FORGE_GOLD_COST;
            }
            updated.forgeWeaponAugments = {
                ...(save.forgeWeaponAugments || {}),
                [weaponId]: [...ownedArr, grantedAugId],
            };

            // Audit log — only logged for gold payments since GoldSpendLog tracks gold flow.
            // Fragment payments are still tracked via the PlayerSave update + console log.
            if (paymentMode === 'gold') {
                try {
                    await base44.asServiceRole.entities.GoldSpendLog.create({
                        wallet_address: walletLower,
                        player_name: saveRecord.player_name || updated.player_name || '',
                        amount: MYSTERY_FORGE_GOLD_COST,
                        balance_before: gold,
                        balance_after: updated.gold,
                        grant_info: { type: 'mystery_forge', weaponId, rolledTier, granted: grantedAugId, paymentMode: 'gold' },
                        week_id,
                        season_id,
                    });
                } catch {}
            }

            // Persist + return early so we can include the roll result in the response
            // without leaking the helper field into the saved object.
            updated.updated_at = Date.now();
            await with429Retry(
                () => base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                    save_data: updated,
                    updated_at: Date.now()
                }),
                'PlayerSave.update'
            );
            const costStr = paymentMode === 'fragments'
                ? `${MYSTERY_FORGE_FRAGMENT_COST} frags`
                : `${MYSTERY_FORGE_GOLD_COST} gold`;
            console.log(`[forgeAction] ${walletLower} mysteryForge ${weaponId} → ${grantedAugId} (rolled T${rolledTier}, paid ${costStr})`);
            return Response.json({
                success: true,
                saveData: updated,
                mysteryResult: {
                    weaponId,
                    rolledTier,
                    granted: grantedAugId,
                    cost: paymentMode === 'fragments' ? MYSTERY_FORGE_FRAGMENT_COST : MYSTERY_FORGE_GOLD_COST,
                    paymentMode,
                },
            });
        } else if (action === 'astralPull') {
            // S6+ gate
            const { season_id, week_id } = getCurrentPeriodIds();
            if (season_id === '2026-S5') {
                return Response.json({ error: 'Astral Lab unlocks in Season 6.' }, { status: 403 });
            }

            const buffs = save.astralBuffs && typeof save.astralBuffs === 'object' ? { ...save.astralBuffs } : {};
            const pullCount = Math.max(0, Math.floor(Number(save.astralPullCount) || 0));
            const cost = getAstralPullCost(pullCount);
            const gold = Number(save.gold || 0);

            if (gold < cost) {
                return Response.json({
                    error: `Not enough gold — next pull costs ${cost.toLocaleString()} (you have ${gold.toLocaleString()}).`
                }, { status: 400 });
            }

            // Roll a random uncapped stat. Block the pull if every stat is maxed.
            const rolled = rollAstralStat(buffs);
            if (!rolled) {
                return Response.json({ error: 'All Astral stats are fully maxed — nothing left to roll.' }, { status: 400 });
            }

            const before = buffs[rolled.id] || 0;
            // Clamp at cap so the last pull lands cleanly even if perPull would overshoot.
            let after;
            if (rolled.invert) {
                after = Math.max(rolled.cap, before + rolled.perPull);
            } else {
                after = Math.min(rolled.cap, before + rolled.perPull);
            }
            const actualDelta = after - before;
            buffs[rolled.id] = after;

            updated.gold = gold - cost;
            updated.astralBuffs = buffs;
            updated.astralPullCount = pullCount + 1;

            try {
                await base44.asServiceRole.entities.GoldSpendLog.create({
                    wallet_address: walletLower,
                    player_name: saveRecord.player_name || updated.player_name || '',
                    amount: cost,
                    balance_before: gold,
                    balance_after: updated.gold,
                    grant_info: {
                        type: 'astral_pull',
                        pullNumber: pullCount + 1,
                        rolledStat: rolled.id,
                        delta: actualDelta,
                        newTotal: after,
                    },
                    week_id,
                    season_id,
                });
            } catch {}

            updated.updated_at = Date.now();
            await with429Retry(
                () => base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                    save_data: updated,
                    updated_at: Date.now()
                }),
                'PlayerSave.update'
            );
            console.log(`[forgeAction] ${walletLower} astralPull #${pullCount + 1} → ${rolled.id} ${actualDelta > 0 ? '+' : ''}${actualDelta} (paid ${cost}g)`);
            return Response.json({
                success: true,
                saveData: updated,
                astralResult: {
                    rolledStat: rolled.id,
                    delta: actualDelta,
                    newTotal: after,
                    cost,
                    nextCost: getAstralPullCost(pullCount + 1),
                },
            });
        } else {
            return Response.json({ error: 'Unknown action' }, { status: 400 });
        }

        updated.updated_at = Date.now();
        await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                save_data: updated,
                updated_at: Date.now()
            }),
            'PlayerSave.update'
        );

        console.log(`[forgeAction] ${walletLower} ${action} OK`);
        return Response.json({ success: true, saveData: updated });
    } catch (error) {
        console.error('[forgeAction]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});