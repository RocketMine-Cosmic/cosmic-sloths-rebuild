import React from 'react';

// Compact stat pill row for the Sloth Command character carousel.
// Shows every base stat that varies across characters so players can compare
// operatives at a glance. Each pill is colour-coded vs the baseline (NeoByte)
// — green = better, red = worse, white = same.
//
// Stats covered (in order): HP, SPD, ARM, REGEN, DMG, CD, AREA, MAGNET, LUCK,
// GOLD, XP, PROJ SPD. Only stats that actually differ from baseline get the
// up/down arrow indicator — equal stats render plain so the row stays readable.

const formatPercent = (v) => `${Math.round(v * 100)}%`;

// `compare` controls colour: 'higher_better' (green when char value > baseline)
// or 'lower_better' (green when char value < baseline — used for Cooldown).
const STATS = [
    { key: 'hp',           label: 'HP',     compare: 'higher_better', format: (v) => `${v}` },
    { key: 'speed',        label: 'SPD',    compare: 'higher_better', format: (v) => v.toFixed(1) },
    { key: 'armor',        label: 'ARM',    compare: 'higher_better', format: (v) => `${v}` },
    { key: 'regen',        label: 'REGEN',  compare: 'higher_better', format: (v) => `${v.toFixed(1)}/s` },
    { key: 'damageMult',   label: 'DMG',    compare: 'higher_better', format: formatPercent },
    { key: 'cooldownMult', label: 'CD',     compare: 'lower_better',  format: formatPercent },
    { key: 'areaMult',     label: 'AREA',   compare: 'higher_better', format: formatPercent },
    { key: 'magnetRange',  label: 'MAG',    compare: 'higher_better', format: (v) => `${v}` },
    { key: 'luck',         label: 'LUCK',   compare: 'higher_better', format: (v) => `${v}` },
    { key: 'goldMult',     label: 'GOLD',   compare: 'higher_better', format: formatPercent },
    { key: 'xpMult',       label: 'XP',     compare: 'higher_better', format: formatPercent },
    { key: 'projSpeedMult',label: 'PROJ',   compare: 'higher_better', format: formatPercent },
];

export default function CharacterStatPills({ char, baseline }) {
    if (!char || !baseline) return null;
    return (
        <div className="flex flex-wrap gap-1 md:gap-1.5 text-[9px] md:text-[10px] mb-1 bg-[#0b0416]/80 px-1.5 py-1 md:px-2 md:py-1.5 rounded border border-cyan-500/30 shadow-[inset_0_0_10px_rgba(6,182,212,0.1)] max-w-full">
            {STATS.map(({ key, label, compare, format }) => {
                const v = char[key];
                const base = baseline[key];
                if (v === undefined || base === undefined) return null;
                const isHigher = v > base;
                const isLower = v < base;
                const isEqual = !isHigher && !isLower;
                const isBetter = compare === 'higher_better' ? isHigher : isLower;
                const isWorse  = compare === 'higher_better' ? isLower  : isHigher;
                const colorClass = isEqual
                    ? 'text-white'
                    : isBetter
                        ? 'text-green-400 font-bold'
                        : 'text-red-400 font-bold';
                const arrow = isEqual ? '' : isHigher ? '↑' : '↓';
                return (
                    <span key={key} className="text-slate-300 whitespace-nowrap">
                        {label}: <span className={colorClass}>{format(v)}{arrow}</span>
                    </span>
                );
            })}
        </div>
    );
}