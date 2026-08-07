import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 429-aware retry wrapper — protects gold deductions and grants from being lost
// when Base44 hits its rate limit. The PlayerSave write is the critical step:
// if filter or update 500s, the player's gold is debited locally (UI optimism)
// but the cloud save is unchanged → next sync wipes the purchase. This retry
// loop ensures the read-deduct-write cycle completes even under heavy load.
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
            console.warn(`[spendGold] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

// Discord error webhook (fire-and-forget).
async function postDiscordError(title, error) {
    const url = Deno.env.get('DISCORD_ERROR_WEBHOOK');
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{
                title: title.slice(0, 256),
                description: `\`\`\`${(error?.message || String(error)).slice(0, 1500)}\`\`\``,
                color: 0xef4444,
                timestamp: new Date().toISOString(),
            }] }),
        });
    } catch {}
}

// Server-authoritative gold spending. Atomically deducts gold from cloud save
// and applies a grant (stat / weapon / talent / cosmetic).
//
// Cost tables MUST mirror UPGRADE_TYPES in pages/Upgrades.jsx.

// Talent prerequisite map — MUST mirror CHARACTER_TALENTS in game/Constants.js.
// Used to validate tier-2/3 unlocks require their parent tier-1/2 to be owned
// AND that exclusive sibling isn't already owned.
const TALENT_PREREQS = {
    neobyte: { neo_2a: { requires: 'neo_1', excludes: 'neo_2b' }, neo_2b: { requires: 'neo_1', excludes: 'neo_2a' }, neo_3a: { requires: 'neo_2a' }, neo_3b: { requires: 'neo_2b' } },
    pandypaws: { pan_2a: { requires: 'pan_1', excludes: 'pan_2b' }, pan_2b: { requires: 'pan_1', excludes: 'pan_2a' }, pan_3a: { requires: 'pan_2a' }, pan_3b: { requires: 'pan_2b' } },
    novabyte: { nova_2a: { requires: 'nova_1', excludes: 'nova_2b' }, nova_2b: { requires: 'nova_1', excludes: 'nova_2a' }, nova_3a: { requires: 'nova_2a' }, nova_3b: { requires: 'nova_2b' } },
    glitch: { gli_2a: { requires: 'gli_1', excludes: 'gli_2b' }, gli_2b: { requires: 'gli_1', excludes: 'gli_2a' }, gli_3a: { requires: 'gli_2a' }, gli_3b: { requires: 'gli_2b' } },
    holodrift: { holo_2a: { requires: 'holo_1', excludes: 'holo_2b' }, holo_2b: { requires: 'holo_1', excludes: 'holo_2a' }, holo_3a: { requires: 'holo_2a' }, holo_3b: { requires: 'holo_2b' } },
    codebreaker: { code_2a: { requires: 'code_1', excludes: 'code_2b' }, code_2b: { requires: 'code_1', excludes: 'code_2a' }, code_3a: { requires: 'code_2a' }, code_3b: { requires: 'code_2b' } },
    dataphantom: { data_2a: { requires: 'data_1', excludes: 'data_2b' }, data_2b: { requires: 'data_1', excludes: 'data_2a' }, data_3a: { requires: 'data_2a' }, data_3b: { requires: 'data_2b' } },
    neonvortex: { neon_2a: { requires: 'neon_1', excludes: 'neon_2b' }, neon_2b: { requires: 'neon_1', excludes: 'neon_2a' }, neon_3a: { requires: 'neon_2a' }, neon_3b: { requires: 'neon_2b' } },
    synthbeats: { syn_2a: { requires: 'syn_1', excludes: 'syn_2b' }, syn_2b: { requires: 'syn_1', excludes: 'syn_2a' }, syn_3a: { requires: 'syn_2a' }, syn_3b: { requires: 'syn_2b' } },
    skybyte: { sky_2a: { requires: 'sky_1', excludes: 'sky_2b' }, sky_2b: { requires: 'sky_1', excludes: 'sky_2a' }, sky_3a: { requires: 'sky_2a' }, sky_3b: { requires: 'sky_2b' } },
};

// Returns the unlocked talent ids for a character within a SINGLE tier
// (permanent / weekly / seasonal). Prereqs are tree-scoped — buying neo_1
// in permanent doesn't let you skip neo_1 in seasonal (Hugo bug 2026-05-02).
function getUnlockedTalentsForTier(save, charId, tier) {
    const key = tier === 'permanent' ? 'permanentTalents'
              : tier === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';
    const arr = save[key]?.[charId] || [];
    return new Set(arr);
}

// Rotate across all 9 balance API keys (each 100 req/min). Returns shuffled list
// so callers retry on 429 across the pool — must mirror purchaseSku.js.
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

// Default starter is always owned. Otherwise check the save's unlockedCharacters
// list (set by milestone server-side) OR a live NFT lookup (NFT name = char id).
// Rotates through all 9 balance keys with 429 retry — was previously using a
// single key, which caused "haven't unlocked this character" errors when that
// key was rate-limited (Hugo bug 2026-04-30).
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
            // Retry only on rate-limit / server errors. 4xx (other than 429) → genuine miss.
            if (res.status !== 429 && res.status < 500) return false;
        }
        return false;
    } catch {
        return false;
    }
}

function validateTalentPrereqs(save, charId, talentId, tier) {
    const prereqs = TALENT_PREREQS[charId]?.[talentId];
    if (!prereqs) return; // tier 1 or unknown — no prereqs
    const owned = getUnlockedTalentsForTier(save, charId, tier);
    if (prereqs.requires && !owned.has(prereqs.requires)) {
        throw new Error(`You need to unlock the previous talent first.`);
    }
    if (prereqs.excludes && owned.has(prereqs.excludes)) {
        throw new Error(`You've already chosen the other path on this branch — only one is allowed.`);
    }
}

// Seasonal gold costs are ~⅔ of permanent (matching the OMENX ratio of 10/15)
// because seasonal upgrades reset every season — they should be cheaper, not
// pricier, than permanent ones (Hugo bug 2026-05-02).
const GOLD_COSTS = {
    stat: {
        permanent: [1000, 2000, 4000, 8000, 16000],
        weekly:    [500,  1000, 2000, 4000, 8000],
        seasonal:  [750,  1500, 3000, 6000, 12000],
    },
    weapon: {
        permanent: [1000, 2000, 4000, 8000, 16000],
        weekly:    [500,  1000, 2000, 4000, 8000],
        seasonal:  [750,  1500, 3000, 6000, 12000],
    },
    // talent cost = goldCosts[(tier-1)*2]
    talent: {
        permanent: [1000, 2000, 4000, 8000, 16000],
        weekly:    [500,  1000, 2000, 4000, 8000],
        seasonal:  [750,  1500, 3000, 6000, 12000],
    },
};

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

// Pool-bias respec: gold cost escalates each use (mirrors lib/poolBias.js).
const POOL_RESPEC_GOLD_TIERS = [2000, 4000, 8000, 16000];
function getPoolRespecCost(save) {
    const count = Number(save?.poolBiasGoldRespecCount || 0);
    return POOL_RESPEC_GOLD_TIERS[Math.min(count, POOL_RESPEC_GOLD_TIERS.length - 1)];
}

// Talent respec: flat gold fee per tier (mirrors lib/skuMap.js TALENT_RESPEC_GOLD_COSTS).
const TALENT_RESPEC_GOLD_COSTS = {
    permanent: 5000,
    weekly:    2000,
    seasonal:  8000,
};

// Compute server-authoritative gold cost for the requested grant.
function computeCost(grantInfo, save) {
    const { type } = grantInfo || {};
    if (type === 'pool_respec') {
        return getPoolRespecCost(save);
    }
    if (type === 'talent_respec') {
        const cost = TALENT_RESPEC_GOLD_COSTS[grantInfo.tier];
        if (!cost) throw new Error(`This respec isn't available. Please refresh and try again.`);
        return cost;
    }
    if (type === 'stat') {
        const { tier, level } = grantInfo;
        const costs = GOLD_COSTS.stat[tier];
        if (!costs || !level || level < 1 || level > costs.length) throw new Error(`This upgrade isn't available. Please refresh and try again.`);
        return costs[level - 1];
    }
    if (type === 'weapon') {
        const { tier, level } = grantInfo;
        const costs = GOLD_COSTS.weapon[tier];
        if (!costs || !level || level < 1 || level > costs.length) throw new Error(`This upgrade isn't available. Please refresh and try again.`);
        return costs[level - 1];
    }
    if (type === 'talent') {
        const { tier, talentTier } = grantInfo;
        const costs = GOLD_COSTS.talent[tier];
        if (!costs || !talentTier) throw new Error(`This talent isn't available. Please refresh and try again.`);
        const idx = Math.min((talentTier - 1) * 2, costs.length - 1);
        return costs[idx];
    }
    if (type === 'cosmetic') {
        const { goldCost } = grantInfo;
        if (typeof goldCost !== 'number' || goldCost < 0) throw new Error(`This cosmetic isn't available. Please refresh and try again.`);
        return goldCost;
    }
    throw new Error(`Something went wrong with this purchase. Please try again.`);
}

// Validates the grant against current cloud save and returns updated save_data.
// Throws on mismatch (already unlocked / wrong level / unknown ids).
// NOTE: character-ownership for talents is checked separately (async) before calling this.
// If the player's stored container is from a previous week/season, return a
// fresh empty container instead of the stale one. Without this, the first
// purchase after a reset fails with "save out of sync" because we'd compare
// the new level=1 against last period's surviving levels.
function rolloverContainer(obj, tier, periodIds) {
    if (!obj) return {};
    if (tier === 'weekly' && obj.weekId && obj.weekId !== periodIds.week_id) return {};
    if (tier === 'seasonal' && obj.seasonId && obj.seasonId !== periodIds.season_id) return {};
    return { ...obj };
}

function applyGrant(save, grantInfo, periodIds) {
    const s = { ...save };
    const { type } = grantInfo;

    switch (type) {
        case 'pool_respec': {
            // Clear allocations and bump the respec counter (drives next cost tier).
            s.poolBiasAllocations = {};
            s.poolBiasGoldRespecCount = Number(s.poolBiasGoldRespecCount || 0) + 1;
            break;
        }
        case 'talent_respec': {
            // Clear all talents for one character at one tier (permanent / weekly / seasonal). No refund.
            const { tier, charId } = grantInfo;
            const key = tier === 'permanent' ? 'permanentTalents'
                      : tier === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';
            const obj = rolloverContainer(s[key], tier, periodIds);
            obj[charId] = [];
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'stat': {
            const { tier, stat, level } = grantInfo;
            const key = tier === 'permanent' ? 'permanentUpgrades'
                      : tier === 'weekly' ? 'weeklyUpgrades' : 'seasonalUpgrades';
            const obj = rolloverContainer(s[key], tier, periodIds);
            const currentLvl = Number(obj[stat] || 0);
            if (level !== currentLvl + 1) throw new Error(`Your save is out of sync. Please refresh and try again.`);
            obj[stat] = level;
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'weapon': {
            const { tier, weaponId, stat, level } = grantInfo;
            const key = tier === 'permanent' ? 'permanentWeaponUpgrades'
                      : tier === 'weekly' ? 'weeklyWeaponUpgrades' : 'seasonalWeaponUpgrades';
            const obj = rolloverContainer(s[key], tier, periodIds);
            const weaponObj = { ...(obj[weaponId] || {}) };
            const currentLvl = Number(weaponObj[stat] || 0);
            if (level !== currentLvl + 1) throw new Error(`Your save is out of sync. Please refresh and try again.`);
            weaponObj[stat] = level;
            obj[weaponId] = weaponObj;
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'talent': {
            const { tier, charId, talentId } = grantInfo;
            const key = tier === 'permanent' ? 'permanentTalents'
                      : tier === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';
            const obj = rolloverContainer(s[key], tier, periodIds);
            const charArr = Array.isArray(obj[charId]) ? [...obj[charId]] : [];
            if (charArr.includes(talentId)) throw new Error('You already own this talent.');
            // Enforce tier prerequisites scoped to THIS tree (permanent/weekly/seasonal):
            // tier 2 needs tier 1 in same tree, tier 3 needs tier 2, exclusive sibling locked.
            validateTalentPrereqs(s, charId, talentId, tier);
            charArr.push(talentId);
            obj[charId] = charArr;
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'cosmetic': {
            const { slot, cosmeticId, charId } = grantInfo;
            if (slot === 'trail') {
                const arr = Array.isArray(s.unlockedCosmetics) ? [...s.unlockedCosmetics] : [];
                if (!arr.includes(cosmeticId)) arr.push(cosmeticId);
                s.unlockedCosmetics = arr;
                s.cosmetics = { ...(s.cosmetics || {}), trail: cosmeticId };
            } else if (slot === 'kill') {
                const arr = Array.isArray(s.unlockedKillEffects) ? [...s.unlockedKillEffects] : [];
                if (!arr.includes(cosmeticId)) arr.push(cosmeticId);
                s.unlockedKillEffects = arr;
                s.cosmetics = { ...(s.cosmetics || {}), killEffect: cosmeticId };
            } else if (slot === 'skin') {
                const arr = Array.isArray(s.unlockedSkins) ? [...s.unlockedSkins] : [];
                if (!arr.includes(cosmeticId)) arr.push(cosmeticId);
                s.unlockedSkins = arr;
                const skins = { ...((s.cosmetics || {}).skins || {}) };
                if (charId) skins[charId] = cosmeticId;
                s.cosmetics = { ...(s.cosmetics || {}), skins };
            } else {
                throw new Error(`This cosmetic isn't available. Please refresh and try again.`);
            }
            break;
        }
        default:
            throw new Error(`Something went wrong with this purchase. Please try again.`);
    }
    s.updated_at = Date.now();
    return s;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS (doesn't return null) when there's no auth context.
        // Catch it and surface a clean 401 — otherwise the outer catch fires a Discord
        // error alert for routine "user not signed in yet" page loads.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to continue.' }, { status: 401 });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const { grantInfo } = await req.json();
        if (!grantInfo || !grantInfo.type) {
            return Response.json({ error: 'Missing upgrade info — please refresh and try again.' }, { status: 400 });
        }

        // Load current save (needed before computing cost for pool_respec).
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() }),
            'PlayerSave.filter'
        );
        if (records.length === 0) {
            return Response.json({ error: 'We couldn\'t find your save. Please play a run first to create one.' }, { status: 400 });
        }
        const saveRecord = records[0];
        const saveData = typeof saveRecord.save_data === 'string'
            ? JSON.parse(saveRecord.save_data)
            : saveRecord.save_data;

        // Compute cost server-side
        let cost;
        try {
            cost = computeCost(grantInfo, saveData);
        } catch (e) {
            // computeCost already throws human-friendly messages
            return Response.json({ error: e.message }, { status: 400 });
        }

        // Verify funds
        const currentGold = Number(saveData.gold || 0);
        if (currentGold < cost) {
            return Response.json({ error: `Not enough gold — you need ${cost.toLocaleString()} but have ${currentGold.toLocaleString()}.` }, { status: 400 });
        }

        // Apply grant
        const periodIds = getCurrentPeriodIds();

        // For talent grants, verify the player actually owns the character (kill-milestone or NFT).
        if (grantInfo.type === 'talent') {
            const owns = await ownsCharacter(saveData, walletAddress, grantInfo.charId);
            if (!owns) {
                return Response.json({ error: `You haven't unlocked this character yet.` }, { status: 403 });
            }
        }

        let updatedSave;
        try {
            updatedSave = applyGrant(saveData, grantInfo, periodIds);
        } catch (e) {
            // applyGrant already throws human-friendly messages
            return Response.json({ error: e.message }, { status: 400 });
        }

        // Deduct gold
        updatedSave.gold = currentGold - cost;

        // Persist
        await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                save_data: updatedSave,
                updated_at: Date.now()
            }),
            'PlayerSave.update'
        );

        // Audit log — never block the purchase if logging fails.
        try {
            await base44.asServiceRole.entities.GoldSpendLog.create({
                wallet_address: walletAddress.toLowerCase(),
                player_name: saveRecord.player_name || updatedSave.player_name || updatedSave.pilotName || '',
                amount: cost,
                balance_before: currentGold,
                balance_after: updatedSave.gold,
                grant_info: grantInfo,
                week_id: periodIds.week_id,
                season_id: periodIds.season_id,
            });
        } catch (logErr) {
            console.error('[spendGold] GoldSpendLog write failed (non-fatal):', logErr.message);
        }

        console.log(`[spendGold] ${walletAddress} spent ${cost} gold on ${grantInfo.type}`);
        return Response.json({ success: true, cost, saveData: updatedSave });
    } catch (error) {
        console.error('[spendGold]', error.message);
        // Skip noisy rate-limit alerts — they're routine and clutter the error channel.
        if (!/rate limit/i.test(error?.message || '')) {
            postDiscordError('❌ spendGold failed', error);
        }
        return Response.json({ error: 'Something went wrong with your purchase. Please try again.' }, { status: 500 });
    }
});