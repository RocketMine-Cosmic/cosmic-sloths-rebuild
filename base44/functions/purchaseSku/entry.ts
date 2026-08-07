import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.34';

// Discord webhook fire-and-forget. Never throws — any failure is swallowed.
async function postDiscord(envName, color, { title, description, fields }) {
    const url = Deno.env.get(envName);
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{
                title: title?.slice(0, 256),
                description: description?.slice(0, 4000),
                color,
                timestamp: new Date().toISOString(),
                fields: (fields || []).slice(0, 25).map(f => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline })),
            }] }),
        });
    } catch {}
}
const LARGE_OMENX_THRESHOLD = 1000; // ≥ 1,000 OMENX in a single purchase pings #economy-alerts

// In-memory cache for the OMENX purchases kill-switch flag. With dozens of
// concurrent purchases per minute, reading this AppConfig row on every call
// was a major rate-limit contributor. 15s TTL is short enough that admins
// can still kill purchases promptly during an incident.
let _purchasesDisabledCache = null;
let _purchasesDisabledExpiresAt = 0;
const PURCHASES_FLAG_TTL_MS = 15 * 1000;
const DEFAULT_DISABLED_MSG = 'OMENX purchases are temporarily disabled while the settlement service is being restored. Please try again shortly.';

// ============================================================================
// In-process circuit breaker for OmenX settlement outages (2026-05-18).
// When OmenX is flaking (502 PAYMENT_PENDING, RPC errors), our per-call retry
// loop multiplies the load on EVERY dependency — Base44 function quota,
// OmenX billable calls, isolate headroom that other functions need. The
// breaker tracks recent 5xx failures and short-circuits new calls when the
// failure rate crosses a threshold, returning a clean "try again shortly"
// without spending OmenX budget or burning isolate time.
//
// State lives in module scope so all requests handled by the same isolate
// share it (Deno keeps isolates warm for ~minutes). Across isolates it
// resets independently — that's fine because hot isolates are the ones
// generating most of the load.
// ============================================================================
const BREAKER_WINDOW_MS = 60_000;       // count failures from the last 60s
const BREAKER_TRIP_FAILURES = 5;        // 5+ failures in window → open
const BREAKER_COOLDOWN_MS = 30_000;     // stay open for 30s, then try again
let _breakerFailures = [];              // timestamps of recent 5xx failures
let _breakerOpenUntil = 0;              // ms timestamp; while > now, short-circuit

function recordBreakerFailure() {
    const now = Date.now();
    _breakerFailures.push(now);
    // prune anything older than the window
    _breakerFailures = _breakerFailures.filter(t => now - t < BREAKER_WINDOW_MS);
    if (_breakerFailures.length >= BREAKER_TRIP_FAILURES && now >= _breakerOpenUntil) {
        _breakerOpenUntil = now + BREAKER_COOLDOWN_MS;
        console.warn(`[purchaseSku] CIRCUIT BREAKER OPEN — ${_breakerFailures.length} failures in ${BREAKER_WINDOW_MS}ms, blocking new calls for ${BREAKER_COOLDOWN_MS}ms`);
        postDiscord('DISCORD_ERROR_WEBHOOK', 0xf59e0b, {
            title: '⚡ purchaseSku circuit breaker tripped',
            description: `Auto-blocking new purchases for ${BREAKER_COOLDOWN_MS / 1000}s — OmenX settlement is flaking.`,
            fields: [
                { name: 'Failures in window', value: `${_breakerFailures.length} in ${BREAKER_WINDOW_MS / 1000}s`, inline: true },
            ],
        });
    }
}
function isBreakerOpen() {
    return Date.now() < _breakerOpenUntil;
}
function recordBreakerSuccess() {
    // A success means OmenX is probably healthy again — flush the failure window
    // so transient blips don't accumulate forever.
    if (_breakerFailures.length > 0) _breakerFailures = [];
}

// In-run SKUs (rerolls/banishes/revives/squad-ult/xp-buff/bias-respec) are
// time-sensitive. A 20s+ retry storm mid-fight is WORSE UX than failing fast,
// and during an outage these are the calls that generate the bulk of retry
// pressure. Use MAX_RETRIES=1 for these (single attempt, no retries) and
// keep the full 3 for out-of-run purchases (talents/upgrades) where the
// player isn't waiting on a fight.
const IN_RUN_SKU_PREFIXES = ['ingame-', 'bias-respec'];
function isInRunSku(skuId) {
    return IN_RUN_SKU_PREFIXES.some(p => skuId === p || skuId.startsWith(p));
}

// OmenX error code semantics (per OmenX docs, refreshed 2026-05-18):
//   502 PAYMENT_PENDING       — on-chain tx broadcast, receipt not yet seen. Retry with same idempotencyKey.
//   503 BALANCE_CHECK_FAILED  — RPC error reading balance. Retry-safe.
//   504 GATEWAY_TIMEOUT       — generic upstream timeout. Retry-safe.
//   422 PAYMENT_FAILED        — on-chain tx reverted. TERMINAL — do not retry.
//   402 INSUFFICIENT_FUNDS    — balance below paymentAmount. TERMINAL.
//   404 SKU_NOT_FOUND         — SKU not configured. TERMINAL.
//   401 INVALID_API_KEY       — this key disabled/expired. Cycle to next key.
//   400 VALIDATION_ERROR      — malformed request. TERMINAL.
//   428 IDEMPOTENCY_KEY_REQ   — we always send one, should never happen.
function isRetryable5xx(msg) {
    // 502/503/504 are all retry-safe per OmenX spec
    return /\b50[234]\b/.test(msg) || /bad gateway|gateway timeout|service unavailable|balance_check_failed|payment_pending/i.test(msg);
}

// Client-side timeout for a single sdk.createPurchase call. The OmenX SDK has
// no built-in timeout, so a flaking settlement service can hang the call for
// 60+ seconds (Texxy 2026-05-18: saw a single /v1/purchases hang for 61.6s).
// During that time the circuit breaker can't trip because no error has been
// thrown yet — every concurrent player just stacks up waiting. 8s is well
// above the ~1-2s happy path but below the 60s isolate budget. The timeout
// throws a 504-shaped error so isRetryable5xx() catches it and the breaker
// records the failure normally.
const SDK_CALL_TIMEOUT_MS = 8_000;
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error(`504 GATEWAY_TIMEOUT — ${label} exceeded ${ms}ms client-side cap`)),
            ms,
        )),
    ]);
}

async function getOmenXPurchasesDisabled(base44) {
    const now = Date.now();
    if (_purchasesDisabledCache && now < _purchasesDisabledExpiresAt) {
        return _purchasesDisabledCache;
    }
    const records = await base44.asServiceRole.entities.AppConfig.filter({ key: 'omenx_purchases_disabled' });
    const v = records[0]?.value || {};
    const result = {
        disabled: !!v.disabled,
        message: v.message || DEFAULT_DISABLED_MSG,
    };
    _purchasesDisabledCache = result;
    _purchasesDisabledExpiresAt = now + PURCHASES_FLAG_TTL_MS;
    return result;
}

// Auth: Base44 session. Wallet: from linked User.wallet_address.
// Pricing: server-side via OmenX dev portal (cached in memory).
// Phase 3a: also applies the grant to PlayerSave server-side after charge confirmed.

// Talent prerequisite map — MUST mirror CHARACTER_TALENTS in game/Constants.js.
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

// Tier-scoped — prereqs check only the same tree (permanent/weekly/seasonal),
// so buying neo_1 in permanent doesn't unlock neo_2a in seasonal (Hugo bug 2026-05-02).
function getUnlockedTalentsForTier(save, charId, tier) {
    const key = tier === 'permanent' ? 'permanentTalents'
              : tier === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';
    const arr = save[key]?.[charId] || [];
    return new Set(arr);
}

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

// Strip the "_am" Asset Managers suffix so the new OmenX collection
// (e.g. "novabyte_am") still resolves to the same character ID as the
// original collection ("novabyte"). Mirrors lib/nftNameNormalize.js.
function normalizeNftCharacterName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    return rawName.toLowerCase().replace(/_am$/, '');
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
                return nfts.some(nft => normalizeNftCharacterName(nft?.metadata?.name) === charId);
            }
            // 404 is wallet-dependent, not key-dependent (all keys verified 200 on a
            // live wallet 2026-07-31) — retrying across keys just multiplies the 404s.
            if (res.status !== 429 && res.status < 500) return false;
        }
        return false;
    } catch {
        return false;
    }
}

function validateTalentPrereqs(save, charId, talentId, tier) {
    const prereqs = TALENT_PREREQS[charId]?.[talentId];
    if (!prereqs) return;
    const owned = getUnlockedTalentsForTier(save, charId, tier);
    if (prereqs.requires && !owned.has(prereqs.requires)) {
        throw new Error(`You need to unlock the previous talent first.`);
    }
    if (prereqs.excludes && owned.has(prereqs.excludes)) {
        throw new Error(`You've already chosen the other path on this branch — only one is allowed.`);
    }
}

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

let skuPriceCache = null;
let skuPriceCacheExpiresAt = 0;
const SKU_CACHE_TTL = 10 * 60 * 1000;

// Load balance across multiple payment API keys (each 100 req/min). Returns a shuffled array
// so callers pick a different key per request and can retry on rate-limit (429).
function getPaymentKeys() {
    const keys = [
        Deno.env.get('OMENX_PAYMENT_API_KEY'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_2'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_3'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_4'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_5'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_6'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_7'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_8'),
    ].filter(Boolean);
    return keys.map(k => ({ k, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.k);
}

async function getSkuPrice(skuId, apiBaseUrl, apiKeys, forceRefresh = false) {
    const now = Date.now();
    if (forceRefresh || !skuPriceCache || now >= skuPriceCacheExpiresAt) {
        let res, lastStatus = 0;
        for (const key of apiKeys) {
            res = await fetch(`${apiBaseUrl}/v1/products`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) break;
            lastStatus = res.status;
            // Only retry on rate-limit / server errors
            if (res.status !== 429 && res.status < 500) break;
            console.warn('[purchaseSku] catalog HTTP', res.status, '— trying next key');
        }
        if (!res || !res.ok) throw new Error(`Couldn't load store prices right now. Please try again in a moment.`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.products || data?.skus || data?.items || []);
        skuPriceCache = {};
        for (const sku of list) {
            const id = sku.sku || sku.skuId || sku.id || sku.productId;
            const price = parseFloat(
                sku.pricesInCurrency?.OMENX ?? sku.priceInOmenx ?? sku.price ?? 0
            );
            if (id && price > 0) skuPriceCache[id] = price;
        }
        skuPriceCacheExpiresAt = now + SKU_CACHE_TTL;
        console.log(`[purchaseSku] SKU price cache refreshed (${Object.keys(skuPriceCache).length} entries)`);
    }
    return skuPriceCache[skuId] || 0;
}

// Cosmetic SKU ↔ goldCost binding — MUST mirror lib/skuMap.js. Used to verify the
// SKU the player is actually paying for matches the cosmeticId being granted, so
// a cheap SKU can't unlock an expensive cosmetic via tampered grantInfo.
const COSMETIC_SKU_COSTS = {
    'character-trails-basic':           3000,
    'character-trails-advanced':        10000,
    'character-trails-epic':            20000,
    'character-trails-leg':             30000,
    'character-kill-effects-basic':     3000,
    'character-kill-effects-advanced':  12000,
    'character-kill-effects-epic':      25000,
    'character-skins-basic':            5000,
    'character-skins-advance':          20000,
};

// S8 revive escalation — must mirror lib/reviveTiers.js on the client.
// Server picks the tier from run_time_sec + arena_id supplied in grantInfo,
// then validates the CALLER'S sku_id matches the tier price the server
// picked. That way a client can't send `ingame-revive` (4 OMENX) with
// grantInfo claiming 11-min bucket to cheat the escalation.
//
// Endless / world-boss runs → top tier straight away (any death in these
// long-form modes counts as a genuine "save my progress" moment).
const REVIVE_TIERS = [
    { maxTime: 4 * 60,  skuId: 'ingame-revive',    cost: 4  },
    { maxTime: 8 * 60,  skuId: 'ingame-revive-8',  cost: 8  },
    { maxTime: 11 * 60, skuId: 'ingame-revive-15', cost: 15 },
    { maxTime: Infinity, skuId: 'ingame-revive-25', cost: 25 },
];

// S8 Fragment Express Lane — 40 batches × 15 frags × 10 OMENX = 600 frags /
// 400 OMENX per player per ISO week. See docs/s8/PLAN_REVIVE_AND_FRAGMENTS.md.
const FRAGMENT_BATCH_SIZE   = 15;
const FRAGMENT_BATCH_COST   = 10;
const FRAGMENT_WEEKLY_CAP   = 40;

// S8 gate — mirrors lib/seasonGate.isS8OrLater. New sinks + sandbox reject
// gated by this so the in-flight S7 leaderboard isn't retroactively changed.
// Numeric season compare — string compare breaks at 2026-S10 vs 2026-S7 ('1' < '7').
function seasonAtLeast(seasonId, year, seas) {
    const m = String(seasonId || '').match(/^(\d{4})-S(\d{1,2})$/);
    if (!m) return false;
    const y = Number(m[1]);
    const s = Number(m[2]);
    if (y > year) return true;
    if (y < year) return false;
    return s >= seas;
}

function isS8OrLater(periodIds) {
    return seasonAtLeast(periodIds?.season_id, 2026, 8);
}

function getReviveTierForRun(timeSec, arenaId) {
    if (arenaId === 'endless' || arenaId === 'world_boss_arena') {
        return REVIVE_TIERS[REVIVE_TIERS.length - 1];
    }
    const t = Number(timeSec) || 0;
    for (const tier of REVIVE_TIERS) {
        if (t < tier.maxTime) return tier;
    }
    return REVIVE_TIERS[REVIVE_TIERS.length - 1];
}

// If the player's stored container is from a previous week/season, return a
// fresh empty container instead of the stale one. Without this, the first
// purchase after a reset fails — we'd compare new level=1 against last
// period's surviving levels (or last period's already-owned talents).
function rolloverContainer(obj, tier, periodIds) {
    if (!obj) return {};
    if (tier === 'weekly' && obj.weekId && obj.weekId !== periodIds.week_id) return {};
    if (tier === 'seasonal' && obj.seasonId && obj.seasonId !== periodIds.season_id) return {};
    return { ...obj };
}

// ---- Grant application ----
// Applies grantInfo to the player's cloud PlayerSave atomically. Returns the
// updated save_data. Validates that the SKU prefix matches the grant type so a
// cheap SKU can't be used to grant an expensive item.
function applyGrant(save, grantInfo, skuId, periodIds) {
    if (!grantInfo || !grantInfo.type) return save;
    const s = { ...save };
    const { type } = grantInfo;
    const skuPrefix = skuId.split('-lvl')[0]; // e.g. "stat-upgrade-permanent"

    switch (type) {
        case 'talent_respec': {
            // grantInfo: { type, tier, charId } — clears all talents for one character at one tier. No refund.
            const { tier, charId } = grantInfo;
            // Exact-match SKU↔tier check — previously a `talent-respec-weekly` (cheap)
            // SKU could clear `permanent` talents (expensive respec).
            if (skuId !== `talent-respec-${tier}`) {
                throw new Error(`This respec doesn't match. Please refresh and try again.`);
            }
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
            // grantInfo: { type, tier: 'permanent'|'weekly'|'seasonal', stat, level }
            const { tier, stat, level } = grantInfo;
            const expected = `stat-upgrade-${tier}`;
            if (skuPrefix !== expected) throw new Error(`This upgrade doesn't match your save. Please refresh and try again.`);
            const key = tier === 'permanent' ? 'permanentUpgrades'
                      : tier === 'weekly' ? 'weeklyUpgrades' : 'seasonalUpgrades';
            const obj = rolloverContainer(s[key], tier, periodIds);
            const currentLvl = Number(obj[stat] || 0);
            // Level being purchased must be exactly currentLvl + 1
            if (level !== currentLvl + 1) {
                throw new Error(`Your save is out of sync. Please refresh and try again.`);
            }
            obj[stat] = level;
            // Stamp period id
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'weapon': {
            // grantInfo: { type, tier, weaponId, stat, level }
            const { tier, weaponId, stat, level } = grantInfo;
            const expected = `weapon-upgrades-${tier}`;
            if (skuPrefix !== expected) throw new Error(`This upgrade doesn't match your save. Please refresh and try again.`);
            const key = tier === 'permanent' ? 'permanentWeaponUpgrades'
                      : tier === 'weekly' ? 'weeklyWeaponUpgrades' : 'seasonalWeaponUpgrades';
            const obj = rolloverContainer(s[key], tier, periodIds);
            const weaponObj = { ...(obj[weaponId] || {}) };
            const currentLvl = Number(weaponObj[stat] || 0);
            if (level !== currentLvl + 1) {
                throw new Error(`Your save is out of sync. Please refresh and try again.`);
            }
            weaponObj[stat] = level;
            obj[weaponId] = weaponObj;
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'talent': {
            // grantInfo: { type, tier, charId, talentId, talentTier }
            const { tier, charId, talentId, talentTier } = grantInfo;
            const expected = `character-talents-${tier}`;
            if (skuPrefix !== expected) throw new Error(`This talent doesn't match your save. Please refresh and try again.`);
            // Validate SKU level matches talent tier
            const skuLevel = parseInt(skuId.split('-lvl')[1] || '1', 10);
            if (skuLevel !== talentTier) {
                throw new Error(`This talent's tier doesn't match. Please refresh and try again.`);
            }
            const key = tier === 'permanent' ? 'permanentTalents'
                      : tier === 'weekly' ? 'weeklyTalents' : 'seasonalTalents';
            const obj = rolloverContainer(s[key], tier, periodIds);
            const charArr = Array.isArray(obj[charId]) ? [...obj[charId]] : [];
            if (charArr.includes(talentId)) {
                throw new Error('You already own this talent.');
            }
            // Enforce tier prerequisites scoped to THIS tree (permanent/weekly/seasonal).
            validateTalentPrereqs(s, charId, talentId, tier);
            charArr.push(talentId);
            obj[charId] = charArr;
            if (tier === 'weekly') obj.weekId = periodIds.week_id;
            if (tier === 'seasonal') obj.seasonId = periodIds.season_id;
            s[key] = obj;
            break;
        }
        case 'xp_buff': {
            // grantInfo: { type: 'xp_buff' } — sets sessionBuffs.xpExpiry to now+60min using server clock.
            // Reject if an existing buff is still active so players can't stack/double-buy.
            if (skuId !== 'ingame-xp-buff') {
                throw new Error(`This buff doesn't match the SKU. Please refresh and try again.`);
            }
            const now = Date.now();
            const existing = Number(s.sessionBuffs?.xpExpiry || 0);
            if (existing > now) {
                throw new Error(`You already have an XP buff active.`);
            }
            s.sessionBuffs = { ...(s.sessionBuffs || {}), xpExpiry: now + 60 * 60 * 1000 };
            break;
        }
        case 'pool_respec': {
            // grantInfo: { type: 'pool_respec' } — clears all pool-bias allocations.
            // Bound to the dedicated 'bias-respec' OMENX SKU so the server can verify
            // payment intent matches the grant (no piggy-backing on other SKUs).
            if (skuId !== 'bias-respec') {
                throw new Error(`This respec doesn't match the SKU. Please refresh and try again.`);
            }
            s.poolBiasAllocations = {};
            break;
        }
        case 'revive': {
            // S8 revive escalation. grantInfo: { type: 'revive', runTime, arenaId }.
            // Server picks the tier (never trusts the client-submitted SKU alone) and
            // validates that skuId matches the server-picked tier. Weekly-cap counter
            // is bumped at the PlayerSave top-level (weekly_revive_count) — done in
            // the atomic apply block below, not on save_data. See PLAN §Sink 1.
            //
            // Note: this branch only fires on S8+; pre-S8 callers keep hitting the flat
            // `ingame-revive` SKU with no grantInfo (unchanged legacy path — no server
            // save mutation, just a charge, exactly as before).
            const runTime = Number(grantInfo.runTime) || 0;
            const arenaId = String(grantInfo.arenaId || '');
            const tier = getReviveTierForRun(runTime, arenaId);
            if (skuId !== tier.skuId) {
                throw new Error(`This revive price is out of date. Please close this prompt and try again.`);
            }
            // Revive grant itself is a session action — no save mutation here beyond
            // the weekly-cap bump, which is handled at the top-level PlayerSave write
            // (revive counter is a top-level column, not a save_data field).
            break;
        }
        case 'star_fragments': {
            // S8 Fragment Express Lane. grantInfo: { type: 'star_fragments', quantity? }.
            // Two dedicated SKUs registered in the OmenX portal:
            //   ingame-star-fragments     — single batch (15 🌟 / 10 OMENX)
            //   ingame-star-fragments-10  — bulk bundle  (150 🌟 / 100 OMENX)
            // quantity MUST match the SKU tier so a cheap SKU can't grant a
            // bulk bundle. Weekly cap enforced at the top-level PlayerSave
            // write (rejects the WHOLE purchase if it would exceed cap —
            // never grants a partial bundle).
            const requestedBatches = Math.max(1, Math.min(10, Number(grantInfo.quantity) || 1));
            const expectedSku = requestedBatches === 10 ? 'ingame-star-fragments-10' : 'ingame-star-fragments';
            if (skuId !== expectedSku) {
                throw new Error(`This fragment purchase doesn't match the SKU. Please refresh and try again.`);
            }
            s.starFragments = Number(s.starFragments || 0) + FRAGMENT_BATCH_SIZE * requestedBatches;
            break;
        }
        case 'cosmetic': {
            // grantInfo: { type, slot: 'trail'|'kill'|'skin', cosmeticId, charId?, goldCost }
            const { slot, cosmeticId, charId, goldCost } = grantInfo;
            const validPrefixes = {
                trail: ['character-trails-'],
                kill:  ['character-kill-effects-'],
                skin:  ['character-skins-'],
            };
            const ok = (validPrefixes[slot] || []).some(p => skuId.startsWith(p));
            if (!ok) throw new Error(`This cosmetic doesn't match the slot. Please refresh and try again.`);
            // Verify the SKU's goldCost-tier matches grantInfo.goldCost — prevents
            // buying a cheap SKU and granting an expensive cosmetic via tampered grant.
            const skuGoldCost = COSMETIC_SKU_COSTS[skuId];
            if (skuGoldCost === undefined) {
                throw new Error(`This cosmetic SKU isn't recognised. Please refresh and try again.`);
            }
            if (Number(goldCost) !== skuGoldCost) {
                throw new Error(`This cosmetic doesn't match the SKU price. Please refresh and try again.`);
            }

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
    // Hoisted so the bottom catch can include identity in the Discord alert
    // (previously you'd see "purchaseSku failed" with no wallet/SKU and have
    // to guess who was hammering).
    let walletAddress = null;
    let skuId = null;
    let playerNameForAlert = null;
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS (doesn't return null) when there's no auth context.
        // Catch it and return a clean 401 — otherwise the outer catch fires a Discord
        // error alert for routine "user not signed in yet" page loads.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to continue.' }, { status: 401 });

        walletAddress = me.wallet_address;
        playerNameForAlert = me.full_name || null;
        if (!walletAddress) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        // Hard block — admins can globally disable OMENX purchases via AdminMaintenance.
        // Cached in-memory (15s TTL) so 100 concurrent purchases don't all read the same
        // AppConfig row. Admins flipping the kill-switch see effect within ~15s.
        try {
            const flag = await getOmenXPurchasesDisabled(base44);
            if (flag.disabled) {
                return Response.json({ error: flag.message, omenxPurchasesDisabled: true }, { status: 503 });
            }
        } catch (e) {
            // Fail CLOSED — when AppConfig is rate-limited during an incident we MUST NOT
            // let purchases through to OmenX. Each /v1/purchases call costs us money even
            // when it 502s, and during a settlement outage every blind call is wasted spend.
            // If the most-recent in-memory cache says "disabled", honor that; otherwise
            // block the request with a 503 and let the next attempt (post-cache-refresh)
            // through. Admins can flip the kill-switch OFF to restore normal flow.
            console.error('[purchaseSku] purchases-disabled read failed — failing CLOSED:', e?.message);
            return Response.json({
                error: 'Purchases are temporarily unavailable while we check status. Please try again in a moment.',
                omenxPurchasesDisabled: true,
            }, { status: 503 });
        }

        const body = await req.json();
        skuId = body.skuId;
        const quantity = body.quantity ?? 1;
        const playerNameParam = body.playerName;
        const grantInfo = body.grantInfo;
        if (playerNameParam) playerNameForAlert = playerNameParam;
        if (!skuId) return Response.json({ error: 'Missing item info — please refresh and try again.' }, { status: 400 });

        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;
        const apiKeys = getPaymentKeys();
        if (apiKeys.length === 0) {
            console.error('[purchaseSku] No payment API keys configured');
            return Response.json({ error: 'Payments are temporarily unavailable. Please try again shortly.' }, { status: 500 });
        }
        // `let` so we can rotate the suffix on nonce-too-low retries (see 422 handler).
        // Default flow keeps the same key across retries (correct for 502/503/504 where
        // we WANT idempotency to prevent double-charge).
        let idempotencyKey = `${walletAddress}-${skuId}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)}`;

        console.log(`[purchaseSku] SKU: ${skuId} x${quantity} wallet: ${walletAddress} grant: ${grantInfo?.type || 'none'}`);

        // Look up unit price BEFORE purchase so paymentAmount > 0 triggers on-chain settle.
        const unitPrice = await getSkuPrice(skuId, apiBaseUrl, apiKeys);
        if (!unitPrice || unitPrice <= 0) {
            const sampleKeys = skuPriceCache ? Object.keys(skuPriceCache).slice(0, 5) : [];
            console.error('[purchaseSku] Unknown SKU price for:', skuId, 'cache size:', skuPriceCache ? Object.keys(skuPriceCache).length : 'null', 'sample keys:', sampleKeys);
            return Response.json({ error: 'This item isn\'t available right now. Please try again shortly.', skuId }, { status: 500 });
        }
        const totalAmount = unitPrice * quantity;

        // --- Pre-validate grant against current cloud save BEFORE charging ---
        // This way an invalid grant (already unlocked / wrong level) fails fast
        // without spending OmenX.
        let saveRecord = null;
        let updatedSave = null;
        const periodIds = getCurrentPeriodIds();

        if (grantInfo) {
            const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() });
            if (records.length === 0) {
                return Response.json({ error: 'We couldn\'t find your save. Please play a run first to create one.' }, { status: 400 });
            }
            saveRecord = records[0];
            const saveData = typeof saveRecord.save_data === 'string'
                ? JSON.parse(saveRecord.save_data)
                : saveRecord.save_data;

            // Talents require the player to actually own the character (kill-milestone or NFT).
            if (grantInfo.type === 'talent') {
                const owns = await ownsCharacter(saveData, walletAddress, grantInfo.charId);
                if (!owns) {
                    return Response.json({ error: `You haven't unlocked this character yet.` }, { status: 403 });
                }
            }

            try {
                updatedSave = applyGrant(saveData, grantInfo, skuId, periodIds);
            } catch (e) {
                // applyGrant already throws human-friendly messages
                return Response.json({ error: e.message }, { status: 400 });
            }

            // Pre-charge weekly-cap enforcement for S8 sinks. Fail fast BEFORE we
            // spend OMENX so a capped player never gets charged for a batch they
            // can't receive. The post-charge write also re-checks, but by then
            // OMENX has already moved — this is the primary gate.
            if (grantInfo.type === 'star_fragments') {
                const storedWeek = saveRecord.weekly_fragment_batches_week_id || '';
                const currentBatches = storedWeek === periodIds.week_id
                    ? Number(saveRecord.weekly_fragment_batches || 0)
                    : 0;
                const requestedBatches = Math.max(1, Math.min(10, Number(grantInfo.quantity) || 1));
                // Reject the ENTIRE bundle if it would exceed the weekly cap —
                // never grants a partial batch. Client-side buttons pre-check
                // remaining capacity so this is the safety net.
                if (currentBatches + requestedBatches > FRAGMENT_WEEKLY_CAP) {
                    return Response.json({
                        error: `This purchase would exceed your weekly fragment cap (${FRAGMENT_WEEKLY_CAP} batches). You have ${FRAGMENT_WEEKLY_CAP - currentBatches} left this week.`,
                        weeklyFragmentCap: true,
                    }, { status: 429 });
                }
            }
        }

        // --- Circuit breaker fail-open for in-run items ---
        // If the breaker is open AND this is an in-run consumable, grant the item
        // FREE so the player isn't punished for an OmenX outage AND we don't
        // generate more retry pressure on a known-flaking upstream. Out-of-run
        // purchases (talents/upgrades) still go through normally — the breaker
        // just short-circuits with a clear error there.
        if (isBreakerOpen()) {
            if (isInRunSku(skuId) && grantInfo && saveRecord) {
                console.warn(`[purchaseSku] BREAKER OPEN — granting ${skuId} FREE to ${walletAddress} (OmenX flaking)`);
                try {
                    const freshRecords = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() });
                    if (freshRecords.length === 0) throw new Error('Save vanished');
                    const freshRecord = freshRecords[0];
                    const freshSave = typeof freshRecord.save_data === 'string' ? JSON.parse(freshRecord.save_data) : freshRecord.save_data;
                    const reAppliedSave = applyGrant(freshSave, grantInfo, skuId, periodIds);
                    await base44.asServiceRole.entities.PlayerSave.update(freshRecord.id, {
                        save_data: reAppliedSave,
                        updated_at: Date.now()
                    });
                    return Response.json({
                        success: true,
                        amount: 0,
                        grantApplied: true,
                        saveData: reAppliedSave,
                        freeGrant: true,
                    });
                } catch (err) {
                    console.error('[purchaseSku] breaker-open free-grant failed:', err.message);
                    return Response.json({ error: 'OMENX is recovering — try again in a moment.' }, { status: 503 });
                }
            }
            // Non-in-run purchase during outage — fail fast, no retries.
            return Response.json({
                error: 'OMENX settlement is recovering — please try again in 30 seconds.',
                breakerOpen: true,
            }, { status: 503 });
        }

        // --- Charge OmenX ---
        // Retry on 5xx (gateway timeout) and 429 (rate-limit) by cycling to the
        // next payment key. Idempotency key ensures retries don't double-charge
        // if a previous attempt actually settled on-chain.
        // In-run SKUs get 1 attempt (no retries) — mid-fight UX > retry success
        // rate, and these are the hot path during outages. Out-of-run gets 3.
        const MAX_RETRIES = isInRunSku(skuId) ? 1 : 3;
        const is422 = (msg) => /\b422\b/.test(msg);
        let purchaseData;
        let didPriceRecheck = false;
        let lastErr = null;
        const attempts = Math.min(MAX_RETRIES, apiKeys.length);
        for (let i = 0; i < attempts; i++) {
            const sdk = new OmenXServerSDK({ apiKey: apiKeys[i], apiBaseUrl });
            try {
                purchaseData = await withTimeout(
                    sdk.createPurchase({
                        playerWallet: walletAddress,
                        skuId,
                        quantity,
                        idempotencyKey,
                        paymentCurrency: 'OMENX',
                        paymentAmount: totalAmount,
                    }),
                    SDK_CALL_TIMEOUT_MS,
                    'sdk.createPurchase',
                );
                break; // success
            } catch (err) {
                lastErr = err;
                const msg = err?.message || String(err);

                // 404 PLAYER_NOT_FOUND — Omen refuses this wallet because it has no
                // recorded session in the last 30 days. This is NOT a SKU problem, but
                // it arrives as a 404 just like SKU_NOT_FOUND, so it must be matched
                // FIRST or it gets misreported as a missing SKU (and never heals).
                // Nothing was charged — the player just needs to reconnect their wallet.
                if (/player_not_found/i.test(msg) || (/\b404\b/.test(msg) && !/sku_not_found/i.test(msg))) {
                    console.warn(`[purchaseSku] OmenX 404 PLAYER_NOT_FOUND wallet=${walletAddress} sku=${skuId} — stale Omen session`);
                    postDiscord('DISCORD_ERROR_WEBHOOK', 0xf59e0b, {
                        title: '🔄 Purchase blocked — stale Omen session',
                        description: 'OmenX returned PLAYER_NOT_FOUND: this wallet has no recorded session in the last 30 days. Player was asked to reconnect. No charge was made.',
                        fields: [
                            { name: 'SKU', value: skuId, inline: true },
                            { name: 'Wallet', value: `\`${walletAddress}\``, inline: false },
                        ],
                    });
                    return Response.json({
                        error: 'Your OmenX session has expired. Please reconnect your wallet and try again — you have not been charged.',
                        omenSessionStale: true,
                    }, { status: 409 });
                }

                // 404 SKU_NOT_FOUND — terminal, SKU not configured on OmenX side.
                if (/sku_not_found/i.test(msg)) {
                    console.error(`[purchaseSku] OmenX 404 SKU_NOT_FOUND sku=${skuId}:`, msg.slice(0, 200));
                    postDiscord('DISCORD_ERROR_WEBHOOK', 0xef4444, {
                        title: '❌ SKU not found on OmenX',
                        description: 'SKU is missing from the OmenX developer portal — players cannot buy this item.',
                        fields: [
                            { name: 'SKU', value: skuId, inline: true },
                            { name: 'Wallet', value: `\`${walletAddress}\``, inline: false },
                        ],
                    });
                    return Response.json({ error: "This item isn't available right now. Please try again later." }, { status: 400 });
                }

                // 402 INSUFFICIENT_FUNDS — terminal, balance check confirmed too low.
                if (/\b402\b/.test(msg) || /insufficient_funds/i.test(msg)) {
                    return Response.json({ error: "You don't have enough OMENX to complete this purchase. Top up your balance and try again." }, { status: 400 });
                }

                // 401 INVALID_API_KEY — this key is dead. Cycle to next without
                // counting it as a real retry attempt against MAX_RETRIES.
                if (/\b401\b/.test(msg) || /invalid_api_key/i.test(msg)) {
                    if (i < attempts - 1) {
                        console.warn(`[purchaseSku] OmenX 401 INVALID_API_KEY on key ${i + 1} — cycling to next key`);
                        continue;
                    }
                    console.error('[purchaseSku] All payment keys returned 401 INVALID_API_KEY');
                    postDiscord('DISCORD_ERROR_WEBHOOK', 0xef4444, {
                        title: '🔑 All OMENX payment keys invalid',
                        description: 'Every configured payment key returned 401 — check OmenX dev portal.',
                    });
                    return Response.json({ error: 'Payments are temporarily unavailable. Please try again shortly.' }, { status: 500 });
                }

                // 502/503/504 = retry-safe per OmenX spec (PAYMENT_PENDING /
                // BALANCE_CHECK_FAILED / GATEWAY_TIMEOUT). Same idempotencyKey
                // protects against double-charge if a previous attempt settled.
                if (isRetryable5xx(msg)) {
                    if (i < attempts - 1) {
                        console.warn(`[purchaseSku] OmenX retry-safe 5xx on key ${i + 1} — retrying (${i + 2}/${attempts}):`, msg.slice(0, 120));
                        continue;
                    }
                    console.error(`[purchaseSku] OmenX 5xx after ${attempts} attempts:`, msg.slice(0, 200));
                    recordBreakerFailure();
                    // Breaker just tripped + this is in-run → fail-open with free grant
                    // so the player isn't punished and we stop retrying.
                    if (isBreakerOpen() && isInRunSku(skuId) && grantInfo && saveRecord) {
                        console.warn(`[purchaseSku] BREAKER TRIPPED — granting ${skuId} FREE to ${walletAddress}`);
                        try {
                            const freshRecords = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() });
                            if (freshRecords.length > 0) {
                                const freshRecord = freshRecords[0];
                                const freshSave = typeof freshRecord.save_data === 'string' ? JSON.parse(freshRecord.save_data) : freshRecord.save_data;
                                const reAppliedSave = applyGrant(freshSave, grantInfo, skuId, periodIds);
                                await base44.asServiceRole.entities.PlayerSave.update(freshRecord.id, { save_data: reAppliedSave, updated_at: Date.now() });
                                return Response.json({ success: true, amount: 0, grantApplied: true, saveData: reAppliedSave, freeGrant: true });
                            }
                        } catch (e) {
                            console.error('[purchaseSku] post-trip free-grant failed:', e.message);
                        }
                    }
                    return Response.json({
                        error: 'OMENX service is experiencing issues. Your balance is safe — please try again shortly.',
                        omenxServiceDown: true,
                    }, { status: 503 });
                }

                // 422 PAYMENT_FAILED with "nonce too low" — OmenX-side race condition
                // where their transaction signer reused a nonce. The player's tx never
                // landed on-chain (someone else's tx got that nonce first), so this is
                // safe to retry with a *fresh* idempotency key on the next available key.
                // Without a fresh key, OmenX would short-circuit the retry and return
                // the same 422 from their idempotency cache.
                if (is422(msg) && /nonce too low/i.test(msg)) {
                    if (i < attempts - 1) {
                        console.warn(`[purchaseSku] OmenX 422 nonce-too-low — rotating idempotencyKey and retrying (${i + 2}/${attempts})`);
                        // The previous tx never landed (someone else's tx grabbed that
                        // nonce), so we MUST issue a fresh idempotencyKey — otherwise
                        // OmenX returns the cached 422 from their idempotency store
                        // and the retry is pointless. Brief delay lets their nonce
                        // sequencer catch up.
                        idempotencyKey = `${walletAddress}-${skuId}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)}-r${i + 1}`;
                        await new Promise(r => setTimeout(r, 400));
                        continue;
                    }
                    console.error(`[purchaseSku] OmenX 422 nonce-too-low after ${attempts} attempts — wallet=${walletAddress} sku=${skuId}`);
                    return Response.json({
                        error: 'OMENX settlement is busy — please try again in a few seconds.',
                        omenxServiceDown: true,
                    }, { status: 503 });
                }

                // 422 = PAYMENT_FAILED. Try a one-shot price refresh in case the
                // cached price drifted. No retry beyond that.
                if (is422(msg)) {
                    if (!didPriceRecheck) {
                        didPriceRecheck = true;
                        try {
                            const freshUnitPrice = await getSkuPrice(skuId, apiBaseUrl, apiKeys, true);
                            console.warn(`[purchaseSku] OmenX 422 — refreshed price for ${skuId}: cached=${unitPrice} fresh=${freshUnitPrice}`);
                            if (freshUnitPrice > 0 && freshUnitPrice !== unitPrice) {
                                postDiscord('DISCORD_ERROR_WEBHOOK', 0xf59e0b, {
                                    title: '⚠️ SKU price drift detected',
                                    description: `Cached price was stale — purchase rejected by OmenX.`,
                                    fields: [
                                        { name: 'SKU', value: skuId, inline: true },
                                        { name: 'Cached', value: `${unitPrice} OMENX`, inline: true },
                                        { name: 'Fresh', value: `${freshUnitPrice} OMENX`, inline: true },
                                        { name: 'Wallet', value: `\`${walletAddress}\``, inline: false },
                                    ],
                                });
                                return Response.json({
                                    error: 'This item\'s price was updated. Please refresh and try again.',
                                    priceUpdated: true,
                                }, { status: 409 });
                            }
                        } catch (priceErr) {
                            console.error('[purchaseSku] price re-check failed:', priceErr.message);
                        }
                    }
                    console.warn(`[purchaseSku] OmenX 422 PAYMENT_FAILED — wallet=${walletAddress} sku=${skuId}: ${msg.slice(0, 200)}`);
                    const friendly422 = /insufficient/i.test(msg) ? "You don't have enough OMENX to complete this purchase. Top up your balance and try again."
                        : /balance/i.test(msg) ? "Couldn't confirm your OMENX balance. The service may be temporarily down — try again in a moment."
                        : "Your payment was rejected by the settlement service. Please try again shortly.";
                    return Response.json({ error: friendly422 }, { status: 400 });
                }

                // 429 = this key is rate-limited. Cycle to the next key.
                if (msg.includes('429') && i < attempts - 1) {
                    console.warn('[purchaseSku] payment key', i + 1, 'rate-limited — trying next key');
                    continue;
                }
                if (msg.includes('429')) return Response.json({ error: 'Too many purchases right now — please try again in a moment.' }, { status: 429 });

                console.error('[purchaseSku] SDK purchase failed:', msg);
                const friendly = /insufficient/i.test(msg) ? "You don't have enough OMENX to complete this purchase. Top up your balance and try again."
                    : /balance/i.test(msg) ? "Couldn't confirm your OMENX balance — the service may be temporarily down. Try again in a moment."
                    : "The settlement service encountered an error. Your purchase wasn't charged — please try again shortly.";
                return Response.json({ error: friendly, omenxServiceDown: true }, { status: 500 });
            }
        }
        if (!purchaseData) {
            console.error('[purchaseSku] No purchase data; lastErr:', lastErr?.message);
            return Response.json({ error: "Your purchase couldn't be completed. Please try again." }, { status: 500 });
        }

        const txHash = purchaseData?.transactionId || purchaseData?.transactionHash || purchaseData?.txHash || purchaseData?.paymentTxHash || null;
        const status = purchaseData?.status || 'unknown';
        console.log(`[purchaseSku] OmenX status=${status} txHash=${txHash || 'NONE'}`);
        if (status === 'confirmed') recordBreakerSuccess();
        if (status !== 'confirmed') {
            console.error('[purchaseSku] Purchase not confirmed:', JSON.stringify(purchaseData).slice(0, 500));
            return Response.json({ error: "Your payment didn't go through. Please try again — you haven't been charged." }, { status: 500 });
        }

        // --- Apply grant to PlayerSave (if any) ---
        // CRITICAL: re-fetch the save AFTER charge confirmed and re-apply the grant.
        // Otherwise two concurrent purchases could each pre-validate against the same
        // old snapshot, charge, and one would clobber the other on write — player gets
        // charged 2× OMENX but only 1 grant lands.
        if (grantInfo && saveRecord) {
            try {
                const freshRecords = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletAddress.toLowerCase() });
                if (freshRecords.length === 0) throw new Error('Save vanished mid-purchase');
                const freshRecord = freshRecords[0];
                const freshSave = typeof freshRecord.save_data === 'string'
                    ? JSON.parse(freshRecord.save_data)
                    : freshRecord.save_data;
                const reAppliedSave = applyGrant(freshSave, grantInfo, skuId, periodIds);

                // Top-level weekly-cap counters for S8 sinks. Bumped alongside the
                // save_data write so both land atomically (Base44's entity update is
                // a single row write regardless of how many fields we touch).
                //
                // Lazy reset: if the stored week id no longer matches the current ISO
                // week, treat the counter as 0 before bumping. Purely additive — never
                // decreases, so a client can't rewind. Only bumped on grant-type match.
                const updates: Record<string, unknown> = {
                    save_data: reAppliedSave,
                    updated_at: Date.now(),
                };
                if (grantInfo.type === 'star_fragments') {
                    const storedWeek = freshRecord.weekly_fragment_batches_week_id || '';
                    const currentBatches = storedWeek === periodIds.week_id
                        ? Number(freshRecord.weekly_fragment_batches || 0)
                        : 0;
                    const requestedBatches = Math.max(1, Math.min(10, Number(grantInfo.quantity) || 1));
                    if (currentBatches + requestedBatches > FRAGMENT_WEEKLY_CAP) {
                        console.warn(`[purchaseSku] fragment cap would be exceeded for ${walletAddress} (post-charge race) — grant still applied to avoid stealing OMENX`);
                    }
                    updates.weekly_fragment_batches = currentBatches + requestedBatches;
                    updates.weekly_fragment_batches_week_id = periodIds.week_id;
                }

                await base44.asServiceRole.entities.PlayerSave.update(freshRecord.id, updates);
                updatedSave = reAppliedSave;
                // Mirror the new counters into the response saveData so the client
                // can update its Forge UI without waiting for the next sync.
                if (grantInfo.type === 'star_fragments') {
                    updatedSave = {
                        ...reAppliedSave,
                        weekly_fragment_batches: Number(updates.weekly_fragment_batches ?? freshRecord.weekly_fragment_batches ?? 0),
                        weekly_fragment_batches_week_id: (updates.weekly_fragment_batches_week_id ?? freshRecord.weekly_fragment_batches_week_id ?? ''),
                    };
                }
                console.log(`[purchaseSku] Granted ${grantInfo.type} to ${walletAddress}`);
            } catch (err) {
                console.error('[purchaseSku] CRITICAL: charged but failed to apply grant:', err.message);
                // Charge already happened — log but tell client to retry sync to get state from server.
                return Response.json({
                    success: true,
                    amount: totalAmount,
                    grantApplied: false,
                    warning: 'Charge succeeded but grant write failed — your purchase will sync from server next time.',
                }, { status: 200 });
            }
        }

        const { week_id, season_id } = periodIds;

        // Owner self-purchases are logged for audit but excluded from the TokenPool —
        // it's counter-productive for the owner's own OMENX spend to be split back to
        // themselves + the player base via weekly/seasonal payouts. Other staff/admins
        // are NOT excluded (excluding them would be stealing from your own staff cut).
        let isAdminPurchase = false;
        try {
            const adminRecords = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: walletAddress.toLowerCase() });
            const perms = adminRecords[0]?.permissions || [];
            isAdminPurchase = perms.includes('owner');
        } catch (err) {
            console.error('[purchaseSku] AdminWallet lookup failed (treating as non-owner):', err.message);
        }

        // Log token spend.
        //
        // Two write paths to keep row volume sane:
        //
        // 1. IN-RUN SKUs (rerolls/revives/banishes/xp-buff/squad-ult) — high frequency,
        //    individually small (~2-10 OMENX). One row per purchase would be tens of
        //    thousands of rows per day. Instead we aggregate into ONE daily row per
        //    (wallet, sku, day_utc), incrementing amount + a purchase count.
        //
        // 2. OUT-OF-RUN SKUs (talents/upgrades/cosmetics) — low frequency, per-purchase
        //    audit detail matters. One row per purchase.
        if (isInRunSku(skuId)) {
            const dayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
            const aggKey = `agg-${walletAddress.toLowerCase()}-${skuId}-${dayUtc}`;
            try {
                const existingAgg = await base44.asServiceRole.entities.TokenSpendLog.filter({ idempotency_key: aggKey }, null, 1);
                if (existingAgg && existingAgg.length > 0) {
                    const row = existingAgg[0];
                    await base44.asServiceRole.entities.TokenSpendLog.update(row.id, {
                        amount: (row.amount || 0) + totalAmount,
                        grant_info: {
                            aggregate: true,
                            sku_id: skuId,
                            day_utc: dayUtc,
                            count: (row.grant_info?.count || 0) + 1,
                        },
                    });
                } else {
                    await base44.asServiceRole.entities.TokenSpendLog.create({
                        user_id: me.id,
                        player_name: playerNameParam || me.full_name || walletAddress,
                        wallet_address: walletAddress,
                        amount: totalAmount,
                        sku_id: skuId,
                        grant_info: { aggregate: true, sku_id: skuId, day_utc: dayUtc, count: 1 },
                        week_id,
                        season_id,
                        excluded_from_pool: isAdminPurchase,
                        idempotency_key: aggKey,
                    });
                }
            } catch (err) {
                console.error('[purchaseSku] TokenSpendLog aggregate upsert failed:', err.message);
            }
        } else {
            try {
                await base44.asServiceRole.entities.TokenSpendLog.create({
                    user_id: me.id,
                    player_name: playerNameParam || me.full_name || walletAddress,
                    wallet_address: walletAddress,
                    amount: totalAmount,
                    sku_id: skuId,
                    grant_info: grantInfo || null,
                    week_id,
                    season_id,
                    excluded_from_pool: isAdminPurchase,
                });
            } catch (err) {
                console.error('[purchaseSku] TokenSpendLog create failed:', err.message);
            }
        }

        // Alert #economy-alerts on large purchases (≥ threshold OMENX)
        if (totalAmount >= LARGE_OMENX_THRESHOLD) {
            postDiscord('DISCORD_ECONOMY_WEBHOOK', 0xf59e0b, {
                title: '💰 Large OMENX purchase',
                fields: [
                    { name: 'Player', value: playerNameParam || me.full_name || 'Unknown pilot', inline: true },
                    { name: 'Amount', value: `${totalAmount} OMENX`, inline: true },
                    { name: 'SKU', value: skuId, inline: true },
                    { name: 'Week', value: week_id, inline: true },
                ],
            });
        }

        // Update TokenPool (non-fatal). Skipped entirely for admin wallets so admin
        // self-purchases don't inflate the player/staff payout pool.
        if (!isAdminPurchase) {
            try {
                const [weeklyPools, seasonalPools] = await Promise.all([
                    base44.asServiceRole.entities.TokenPool.filter({ period_id: week_id, period_type: 'weekly' }),
                    base44.asServiceRole.entities.TokenPool.filter({ period_id: season_id, period_type: 'seasonal' }),
                ]);
                const weeklyPool = weeklyPools[0];
                const seasonalPool = seasonalPools[0];
                await Promise.all([
                    weeklyPool
                        ? base44.asServiceRole.entities.TokenPool.update(weeklyPool.id, { total_spent: (weeklyPool.total_spent || 0) + totalAmount })
                        : base44.asServiceRole.entities.TokenPool.create({ period_id: week_id, period_type: 'weekly', total_spent: totalAmount, distributed: false }),
                    seasonalPool
                        ? base44.asServiceRole.entities.TokenPool.update(seasonalPool.id, { total_spent: (seasonalPool.total_spent || 0) + totalAmount })
                        : base44.asServiceRole.entities.TokenPool.create({ period_id: season_id, period_type: 'seasonal', total_spent: totalAmount, distributed: false }),
                ]);
            } catch (err) {
                console.error('[purchaseSku] TokenPool upsert failed:', err.message);
            }
        } else {
            console.log(`[purchaseSku] Admin self-purchase ${walletAddress} ${totalAmount} OMENX — excluded from TokenPool.`);
        }

        return Response.json({
            success: true,
            amount: totalAmount,
            grantApplied: !!grantInfo,
            saveData: updatedSave || null,
        });
    } catch (error) {
        console.error(`[purchaseSku] Error wallet=${walletAddress || 'unknown'} sku=${skuId || 'unknown'}:`, error.message);
        // Skip noisy rate-limit alerts — they're routine and clutter the error channel.
        if (!/rate limit/i.test(error?.message || '')) {
            postDiscord('DISCORD_ERROR_WEBHOOK', 0xef4444, {
                title: '❌ purchaseSku failed',
                description: `\`\`\`${(error.message || String(error)).slice(0, 1500)}\`\`\``,
                fields: [
                    { name: 'Player', value: playerNameForAlert || 'Unknown pilot', inline: true },
                    { name: 'Wallet', value: walletAddress ? `\`${walletAddress}\`` : 'unknown', inline: true },
                    { name: 'SKU', value: skuId || 'unknown', inline: true },
                ],
            });
        }
        return Response.json({ error: 'Something went wrong with your purchase. Please try again.' }, { status: 500 });
    }
});