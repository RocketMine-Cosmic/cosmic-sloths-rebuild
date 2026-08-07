// Curated preset loadouts for the Pool Bias system.
// Each preset distributes a player's available bias points across stat targets
// (we bias stats, not specific weapons, so presets work regardless of which
// weapons the player has discovered/unlocked). The allocator distributes points
// proportionally to the target weights below — any leftover points spill into
// the highest-weight stat.

export const POOL_BIAS_PRESETS = [
    {
        id: 'glass_cannon',
        name: 'Glass Cannon',
        icon: '⚔️',
        desc: 'Maximum damage output. Hit hard, dodge harder.',
        weights: {
            damageMult: 5,
            areaMult: 2,
            cooldownMult: 2,
            projSpeedMult: 1,
        },
    },
    {
        id: 'tank',
        name: 'Tanky',
        icon: '🛡️',
        desc: 'Soak up hits. Outlast everything.',
        weights: {
            maxHp: 4,
            armor: 3,
            regen: 2,
            damageMult: 1,
        },
    },
    {
        id: 'speedrunner',
        name: 'Speed Runner',
        icon: '🏃',
        desc: 'Move fast, level fast, scoop everything.',
        weights: {
            speedMult: 3,
            magnetRange: 3,
            xpMult: 2,
            cooldownMult: 2,
        },
    },
];

// Distribute `availablePoints` across `weights` proportionally.
// Returns a flat { [targetId]: points } map of additional allocations.
export function buildPresetAllocation(weights, availablePoints) {
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight <= 0 || availablePoints <= 0) return {};

    const out = {};
    let assigned = 0;
    const entries = Object.entries(weights).sort((a, b) => b[1] - a[1]);
    // First pass — floor-distribute proportional shares.
    for (const [id, w] of entries) {
        const share = Math.floor((w / totalWeight) * availablePoints);
        if (share > 0) {
            out[id] = share;
            assigned += share;
        }
    }
    // Spill leftover into the highest-weight target.
    const leftover = availablePoints - assigned;
    if (leftover > 0 && entries.length > 0) {
        const [topId] = entries[0];
        out[topId] = (out[topId] || 0) + leftover;
    }
    return out;
}