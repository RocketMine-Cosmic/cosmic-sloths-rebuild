// Astral Lab — S6 endgame gold sink (Texxy proposal 2026-05-08).
// Each pull = random small permanent stat buff. Cost ramps per pull. Hard cap per stat.
// Pure RNG which stat. Shared by client UI and (via duplicated constants) server.
//
// Why this design:
//  • Whales reach the steep cost curve naturally; casuals never feel pressured.
//  • RNG distribution self-balances: chasing a specific stat = paying through the nose.
//  • Bonuses feed into existing player stat multipliers, so S6 caps still clamp them
//    (reaching damageMult=4.0 cap means further astral damage pulls show no benefit).
//  • Replaces the broken Mystery Forge augment-lottery (which broke at 100% ownership).

// Cost curve: 20k × 1.4^N. After 10 pulls (~1.6M gold) you've capped ~1/3 of one stat.
// Total to fully cap one stat ≈ 5–6M gold × 7 stats = 30–40M gold sink.
export const ASTRAL_BASE_COST = 20000;
export const ASTRAL_COST_GROWTH = 1.4;

export function getAstralPullCost(pullCount) {
    return Math.floor(ASTRAL_BASE_COST * Math.pow(ASTRAL_COST_GROWTH, pullCount));
}

// Stat catalog — id, label, per-pull bonus, hard cap (max sum per stat).
// Values calibrated against existing player stats so +20% damage feels meaningful
// but isn't a mandatory build (full cap = +20% on a base ~1.5–2.0 damageMult player).
// Cooldown is "lower is better" — bonus DECREASES cooldownMult (capped at -10%).
export const ASTRAL_STATS = [
    { id: 'damageMult',   label: 'Damage',         perPull: 0.02, cap: 0.20, fmt: '+%' },
    { id: 'areaMult',     label: 'Area',           perPull: 0.02, cap: 0.20, fmt: '+%' },
    { id: 'cooldownMult', label: 'Cooldown',       perPull: -0.01, cap: -0.10, fmt: '-%', invert: true },
    { id: 'speedMult',    label: 'Move Speed',     perPull: 0.01, cap: 0.10, fmt: '+%' },
    { id: 'projSpeedMult',label: 'Projectile Speed',perPull: 0.02, cap: 0.20, fmt: '+%' },
    { id: 'regen',        label: 'HP Regen',       perPull: 0.1,  cap: 1.0,  fmt: '+abs', unit: '/s' },
    { id: 'magnetRange',  label: 'Magnet Range',   perPull: 5,    cap: 50,   fmt: '+abs' },
    { id: 'maxHp',        label: 'Max HP',         perPull: 5,    cap: 50,   fmt: '+abs' },
];

// Helper for UI to format the current/cap values nicely.
export function formatAstralValue(stat, value) {
    if (!stat || !value) return '0';
    if (stat.fmt === '+%') return `+${(value * 100).toFixed(0)}%`;
    if (stat.fmt === '-%') return `${(value * 100).toFixed(0)}%`; // already negative
    if (stat.fmt === '+abs') return `+${value}${stat.unit || ''}`;
    return String(value);
}

// Returns the index of a stat that still has room left, weighted uniformly.
// Returns -1 if every stat is capped (caller should refund / block the pull).
export function rollAstralStat(currentBuffs) {
    const eligible = ASTRAL_STATS.filter(s => {
        const cur = currentBuffs?.[s.id] || 0;
        if (s.invert) return cur > s.cap; // cooldown: cap is negative, current must be > cap (closer to 0)
        return cur < s.cap;
    });
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
}