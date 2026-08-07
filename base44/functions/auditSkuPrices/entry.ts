// Admin-only audit: compares every locally-known SKU price (lib/skuMap.js mirror)
// against the live OmenX dev-portal catalog. Flags any drift so we know exactly
// which SKU is causing 422s when paymentAmount disagrees with their catalog.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Mirror of the prices shown in the actual UI:
//   - pages/Upgrades.jsx → UPGRADE_TYPES (stat/weapon/talent tokenCosts per tier/level)
//   - lib/skuMap.js → getConsumableCost (in-game consumables)
// Talent SKUs use lvl1/lvl2/lvl3 to mean talent TIER (not stat-upgrade level),
// and Upgrades.jsx prices them at index [0, 2, 4] of tokenCosts (costTier = (tier-1)*2).
const STAT_WEAPON_TOKEN_COSTS = {
    permanent: [15, 30, 60, 120, 240],
    weekly:    [4, 8, 15, 30, 60],
    seasonal:  [10, 20, 40, 80, 160],
};
const TALENT_TIER_INDICES = [0, 2, 4]; // lvl1/2/3 → tokenCosts index 0/2/4

const EXPECTED_PRICES = {
    // In-game consumables (from lib/skuMap.js getConsumableCost)
    'ingame-banish': 2,
    'ingame-banish-2': 4,
    'ingame-banish-3': 6,
    'ingame-reroll': 2,
    'ingame-revive': 4,
    'ingame-squad-ult-lite': 5,
    'ingame-squad-ult-full': 10,
    'ingame-xp-buff': 10,
    'bias-respec': 10,

    // Talent respecs (from pages/Upgrades.jsx handleRespecTalents omenxCosts)
    'talent-respec-permanent': 10,
    'talent-respec-weekly': 4,
    'talent-respec-seasonal': 20,

    // Cosmetics — actual UI tokenCost from game/Constants.js:
    //   TRAIL_COSMETICS (4 tiers): 30 / 100 / 200 / 300
    //   KILL_COSMETICS (3 tiers):  30 / 120 / 250
    //   SKIN_COSMETICS (2 tiers):  50 / 200
    'character-trails-basic': 30,
    'character-trails-advanced': 100,
    'character-trails-epic': 200,
    'character-trails-leg': 300,
    'character-kill-effects-basic': 30,
    'character-kill-effects-advanced': 120,
    'character-kill-effects-epic': 250,
    'character-skins-basic': 50,
    'character-skins-advance': 200,
};

// Stat + weapon upgrades — same curve per tier, 5 levels each
for (const tier of ['permanent', 'weekly', 'seasonal']) {
    const costs = STAT_WEAPON_TOKEN_COSTS[tier];
    for (let lvl = 1; lvl <= 5; lvl++) {
        EXPECTED_PRICES[`stat-upgrade-${tier}-lvl${lvl}`] = costs[lvl - 1];
        EXPECTED_PRICES[`weapon-upgrades-${tier}-lvl${lvl}`] = costs[lvl - 1];
    }
    // Character talents — lvl1/2/3 = talent tier 1/2/3, priced at tokenCosts[0/2/4]
    for (let tier_i = 0; tier_i < 3; tier_i++) {
        EXPECTED_PRICES[`character-talents-${tier}-lvl${tier_i + 1}`] = costs[TALENT_TIER_INDICES[tier_i]];
    }
}

// Tolerance for floating-point drift in the dev portal (e.g. 5.999999999... vs 6).
const EPSILON = 0.001;

function getCatalogKeys() {
    const keys = [
        Deno.env.get('OMENX_PAYMENT_API_KEY'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_2'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_3'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_4'),
    ].filter(Boolean);
    return keys;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });

        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;

        const keys = getCatalogKeys();
        if (keys.length === 0) return Response.json({ error: 'No payment API keys configured' }, { status: 500 });

        // Fetch the live catalog
        let res, lastStatus = 0;
        for (const key of keys) {
            res = await fetch(`${apiBaseUrl}/v1/products`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) break;
            lastStatus = res.status;
            if (res.status !== 429 && res.status < 500) break;
        }
        if (!res || !res.ok) {
            return Response.json({ error: `Couldn't fetch OmenX catalog (HTTP ${lastStatus || res?.status})` }, { status: 502 });
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.products || data?.skus || data?.items || []);

        // Build live price map
        const livePrices = {};
        for (const sku of list) {
            const id = sku.sku || sku.skuId || sku.id || sku.productId;
            const price = parseFloat(sku.pricesInCurrency?.OMENX ?? sku.priceInOmenx ?? sku.price ?? 0);
            if (id) livePrices[id] = price;
        }

        // Compare
        const matches = [];
        const mismatches = [];
        const missingFromLive = [];
        for (const [skuId, expected] of Object.entries(EXPECTED_PRICES)) {
            if (!(skuId in livePrices)) {
                missingFromLive.push({ skuId, expected });
            } else if (Math.abs(livePrices[skuId] - expected) > EPSILON) {
                mismatches.push({ skuId, expected, live: livePrices[skuId] });
            } else {
                matches.push({ skuId, price: expected, live: livePrices[skuId] });
            }
        }

        // Live SKUs we don't know about locally
        const extraOnLive = [];
        for (const [skuId, live] of Object.entries(livePrices)) {
            if (!(skuId in EXPECTED_PRICES)) {
                extraOnLive.push({ skuId, live });
            }
        }

        return Response.json({
            summary: {
                totalExpected: Object.keys(EXPECTED_PRICES).length,
                totalLive: Object.keys(livePrices).length,
                matches: matches.length,
                mismatches: mismatches.length,
                missingFromLive: missingFromLive.length,
                extraOnLive: extraOnLive.length,
            },
            mismatches,
            missingFromLive,
            extraOnLive,
            matches,
        });
    } catch (error) {
        console.error('[auditSkuPrices] error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});