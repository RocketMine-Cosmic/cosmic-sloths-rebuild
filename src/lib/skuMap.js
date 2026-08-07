/**
 * SKU mapping helpers — maps in-game purchase actions to OmenX developer portal SKU IDs.
 * SKU IDs match exactly what was registered in the OmenX developer portal.
 */

// In-game consumable SKUs
export const IN_GAME_SKUS = {
    banish:        'ingame-banish',    // T1 — 2 OMENX
    banishT2:      'ingame-banish-2',  // T2 — 4 OMENX
    banishT3:      'ingame-banish-3',  // T3 — 6 OMENX
    reroll:        'ingame-reroll',
    // Squad Ultimate has two tiers — lite (capped clone power) and full (scales with player upgrades).
    squadUltimateLite: 'ingame-squad-ult-lite', // 5 OMENX — capped clone
    squadUltimateFull: 'ingame-squad-ult-full', // 10 OMENX — full-power clone
    // Revive — flat 4 OMENX pre-S8. Escalation tiers (8/15/25) are selected
    // dynamically by lib/reviveTiers.js on S8+. Callers should use getReviveForRun
    // rather than picking a SKU manually.
    revive:        'ingame-revive',
    reviveT2:      'ingame-revive-8',    // S8+ mid-run (4–8 min)
    reviveT3:      'ingame-revive-15',   // S8+ deep sector (8–11 min)
    reviveT4:      'ingame-revive-25',   // S8+ podium / endless-any
    starFragments:      'ingame-star-fragments',    // S8 Fragment Express — 15 frags / 10 OMENX
    starFragmentsBulk:  'ingame-star-fragments-10', // S8 Fragment Express bulk — 150 frags / 100 OMENX
    xpSession:     'ingame-xp-buff',
    biasRespec:    'bias-respec', // ~10 OMENX — clears all allocated pool-bias points
};

// Stat upgrade SKUs — keyed by tier and level
const STAT_SKUS = {
    permanent: ['stat-upgrade-permanent-lvl1', 'stat-upgrade-permanent-lvl2', 'stat-upgrade-permanent-lvl3', 'stat-upgrade-permanent-lvl4', 'stat-upgrade-permanent-lvl5'],
    weekly:    ['stat-upgrade-weekly-lvl1',    'stat-upgrade-weekly-lvl2',    'stat-upgrade-weekly-lvl3',    'stat-upgrade-weekly-lvl4',    'stat-upgrade-weekly-lvl5'],
    seasonal:  ['stat-upgrade-seasonal-lvl1',  'stat-upgrade-seasonal-lvl2',  'stat-upgrade-seasonal-lvl3',  'stat-upgrade-seasonal-lvl4',  'stat-upgrade-seasonal-lvl5'],
};

// Weapon upgrade SKUs — keyed by tier and level
const WEAPON_SKUS = {
    permanent: ['weapon-upgrades-permanent-lvl1', 'weapon-upgrades-permanent-lvl2', 'weapon-upgrades-permanent-lvl3', 'weapon-upgrades-permanent-lvl4', 'weapon-upgrades-permanent-lvl5'],
    weekly:    ['weapon-upgrades-weekly-lvl1',    'weapon-upgrades-weekly-lvl2',    'weapon-upgrades-weekly-lvl3',    'weapon-upgrades-weekly-lvl4',    'weapon-upgrades-weekly-lvl5'],
    seasonal:  ['weapon-upgrades-seasonal-lvl1',  'weapon-upgrades-seasonal-lvl2',  'weapon-upgrades-seasonal-lvl3',  'weapon-upgrades-seasonal-lvl4',  'weapon-upgrades-seasonal-lvl5'],
};

// Talent SKUs — tiers 1/2/3 map to lvl1/lvl2/lvl3
const TALENT_SKUS = {
    permanent: ['character-talents-permanent-lvl1', 'character-talents-permanent-lvl2', 'character-talents-permanent-lvl3'],
    weekly:    ['character-talents-weekly-lvl1',    'character-talents-weekly-lvl2',    'character-talents-weekly-lvl3'],
    seasonal:  ['character-talents-seasonal-lvl1',  'character-talents-seasonal-lvl2',  'character-talents-seasonal-lvl3'],
};

// Cosmetic SKUs
const TRAIL_SKUS = {
    // goldCost tiers: 0=free, 3000=basic, 10000=advanced, 20000=epic, 30000=legendary
    3000:  'character-trails-basic',
    10000: 'character-trails-advanced',
    20000: 'character-trails-epic',
    30000: 'character-trails-leg',
};

const KILL_EFFECT_SKUS = {
    // goldCost tiers: 3000=basic, 12000=advanced, 25000=epic
    3000:  'character-kill-effects-basic',
    12000: 'character-kill-effects-advanced',
    25000: 'character-kill-effects-epic',
};

const SKIN_SKUS = {
    // goldCost tiers: 5000=basic, 20000=advanced
    5000:  'character-skins-basic',
    20000: 'character-skins-advance',
};

// Talent respec SKUs — flat OMENX fee per tier to clear all talents for a single character.
// Replace these with your real SKU IDs once registered in the OmenX portal.
const TALENT_RESPEC_SKUS = {
    permanent: 'talent-respec-permanent', // ~10 OMENX
    weekly:    'talent-respec-weekly',    // ~4 OMENX
    seasonal:  'talent-respec-seasonal',  // ~20 OMENX
};

/**
 * Returns the SKU for a talent respec.
 * @param {'permanent'|'weekly'|'seasonal'} tier
 */
export function getTalentRespecSku(tier) {
    return TALENT_RESPEC_SKUS[tier] || null;
}

// Gold cost for talent respec (per tier). Mirror in functions/spendGold.js.
export const TALENT_RESPEC_GOLD_COSTS = {
    permanent: 5000,
    weekly:    2000,
    seasonal:  8000,
};

/**
 * Returns the SKU for a stat upgrade.
 * @param {'permanent'|'weekly'|'seasonal'} tier
 * @param {string} statId  (unused — all stats share the same SKU per tier/level)
 * @param {number} level   1-indexed level being purchased
 */
export function getStatSku(tier, statId, level) {
    return STAT_SKUS[tier]?.[level - 1] || null;
}

/**
 * Returns the SKU for a weapon upgrade.
 * @param {'permanent'|'weekly'|'seasonal'} tier
 * @param {string} weaponName  (unused — all weapons share the same SKU per tier/level)
 * @param {'damage'|'area'|'cooldown'} stat  (unused)
 * @param {number} level  1-indexed
 */
export function getWeaponSku(tier, weaponName, stat, level) {
    return WEAPON_SKUS[tier]?.[level - 1] || null;
}

/**
 * Returns the SKU for a character talent purchase.
 * @param {'permanent'|'weekly'|'seasonal'} tier
 * @param {string} charName   (unused)
 * @param {string} talentName  (unused)
 * @param {number} talentTier  1, 2, or 3
 */
export function getTalentSku(tier, charName, talentName, talentTier = 1) {
    return TALENT_SKUS[tier]?.[talentTier - 1] || null;
}

/**
 * Returns the SKU for a cosmetic (trail, kill effect, or skin).
 * @param {'trail'|'kill'|'skin'} type
 * @param {string} name  (unused)
 * @param {number} goldCost  used to determine the tier
 */
export function getCosmeticSku(type, name, goldCost) {
    if (type === 'trail')  return TRAIL_SKUS[goldCost] || null;
    if (type === 'kill')   return KILL_EFFECT_SKUS[goldCost] || null;
    if (type === 'skin')   return SKIN_SKUS[goldCost] || null;
    return null;
}

/**
 * Returns the OMENX cost for an in-game consumable.
 * Mirror of OmenX dev portal prices — server is the source of truth, but UIs
 * use this for display.
 * @param {string} skuId - SKU ID (e.g., 'ingame-banish')
 */
export function getConsumableCost(skuId) {
    const costs = {
        'ingame-banish': 2,
        'ingame-banish-2': 4,
        'ingame-banish-3': 6,
        'ingame-reroll': 2,
        'ingame-revive': 4,
        'ingame-revive-8': 8,
        'ingame-revive-15': 15,
        'ingame-revive-25': 25,
        'ingame-star-fragments': 10,
        'ingame-star-fragments-10': 100,
        'ingame-squad-ult-lite': 5,
        'ingame-squad-ult-full': 10,
        'ingame-xp-buff': 10,
    };
    return costs[skuId] || 0;
}

/**
 * Returns the OMENX cost for a stat upgrade.
 * @param {number} level - 1-indexed level being purchased
 */
export function getStatUpgradeCost(level) {
    const costs = [5, 10, 20, 40, 80]; // OMENX costs per level
    return costs[Math.min(level - 1, costs.length - 1)] || 0;
}

/**
 * Returns the OMENX cost for a weapon upgrade.
 * @param {number} level - 1-indexed level being purchased
 */
export function getWeaponUpgradeCost(level) {
    const costs = [5, 10, 20, 40, 80];
    return costs[Math.min(level - 1, costs.length - 1)] || 0;
}

/**
 * Returns the OMENX cost for a talent.
 * @param {number} tier - 1, 2, or 3
 */
export function getTalentCost(tier) {
    const costs = [10, 20, 40];
    return costs[Math.min(tier - 1, costs.length - 1)] || 0;
}

/**
 * Returns the OMENX cost for a cosmetic based on gold tier.
 * @param {number} goldCost - Gold cost (determines tier)
 */
export function getCosmeticCost(goldCost) {
    const costs = {
        3000: 3,
        5000: 5,
        10000: 10,
        12000: 12,
        20000: 20,
        25000: 25,
        30000: 30,
    };
    return costs[goldCost] || 0;
}