import React from 'react';

// Maps a Dynamic Difficulty spawn-rate multiplier (0.5×–3.5× live range) to a
// readable tier. Thresholds mirror the meaningful engine breakpoints documented
// in EnemySpawner.js:
//   • ≥ 1.5× — end-of-run grace taper exemption (whales keep their wave going)
//   • > 1.0× — elite-spawn DD boost kicks in
//   • ≥ 3.0× — burst-spawn (every spawn also drops a second mob)
// Showing tier names instead of raw numbers makes those mechanics legible —
// players can SEE when they crossed into "FRENZY" and understand why mobs are
// doubling up. See PLAN: Dynamic Difficulty pill — Option 1 (compact badge).
function getTier(mult) {
    if (mult >= 3.0)  return { label: 'FRENZY',      icon: '💀', color: 'red',     glow: true };
    if (mult >= 2.0)  return { label: 'IN THE ZONE', icon: '⚡', color: 'fuchsia', glow: true };
    if (mult >= 1.2)  return { label: 'HEATED',      icon: '🔥', color: 'orange',  glow: false };
    if (mult >= 0.8)  return { label: 'STEADY',      icon: '⚪', color: 'slate',   glow: false };
    return                  { label: 'CHILL',       icon: '❄️', color: 'cyan',    glow: false };
}

// Tailwind class lookup — kept as literal strings so the JIT picks them up.
const TIER_STYLES = {
    red:     { border: 'border-red-500/70',     text: 'text-red-300',     bg: 'bg-red-950/60',     ring: 'shadow-[0_0_10px_rgba(248,113,113,0.45)]' },
    fuchsia: { border: 'border-fuchsia-500/70', text: 'text-fuchsia-300', bg: 'bg-fuchsia-950/60', ring: 'shadow-[0_0_10px_rgba(217,70,239,0.45)]' },
    orange:  { border: 'border-orange-500/60',  text: 'text-orange-300',  bg: 'bg-orange-950/50',  ring: '' },
    slate:   { border: 'border-slate-600/60',   text: 'text-slate-300',   bg: 'bg-slate-900/60',   ring: '' },
    cyan:    { border: 'border-cyan-500/50',    text: 'text-cyan-300',    bg: 'bg-cyan-950/50',    ring: '' },
};

export default function DynamicDifficultyPill({ mult }) {
    if (typeof mult !== 'number' || !isFinite(mult)) return null;
    const tier = getTier(mult);
    const s = TIER_STYLES[tier.color];
    return (
        <div
            className={`mt-1 inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md border ${s.border} ${s.bg} ${tier.glow ? `${s.ring} animate-pulse` : ''}`}
            title={`Dynamic Difficulty — adapts to your performance. Current: ${mult.toFixed(2)}× spawn rate.`}
        >
            <span className="text-[9px] md:text-[10px]">{tier.icon}</span>
            <span className={`text-[8px] md:text-[10px] font-black tracking-widest uppercase ${s.text}`}>{tier.label}</span>
            <span className={`text-[7px] md:text-[9px] font-mono ${s.text} opacity-70`}>{mult.toFixed(1)}×</span>
        </div>
    );
}