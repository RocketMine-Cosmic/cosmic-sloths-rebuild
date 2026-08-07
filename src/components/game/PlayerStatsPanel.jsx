import React from 'react';
import { CHARACTERS } from '../../game/Constants';

// Compact "live build" panel — shows current run stats with green deltas
// against the character's baseline so players can see how much they've
// gained from this run's upgrades. Read straight off the engine.
//
// Stats are categorised into multipliers (shown as %), flat values, and
// HP. We compute the *base* by looking up the unmodified character stats
// in CHARACTERS — anything above that came from upgrades / talents /
// relics / mastery accumulated during this run or previous progression.
export default function PlayerStatsPanel({ engineRef }) {
    const engine = engineRef?.current;
    if (!engine || !engine.player) return null;

    const p = engine.player;
    const baseChar = CHARACTERS.find(c => c.id === engine.characterId) || CHARACTERS[0];

    // Each row: { label, current, base, format, higherBetter }
    const formatPct = (v) => `${Math.round(v * 100)}%`;
    const formatNum = (v, digits = 0) => Number(v).toFixed(digits);

    const rows = [
        { label: 'Damage',       current: p.damageMult,     base: baseChar.damageMult || 1,    format: formatPct,           higherBetter: true },
        { label: 'Move Speed',   current: p.speedMult,      base: 1,                            format: formatPct,           higherBetter: true },
        { label: 'Cooldown',     current: p.cooldownMult,   base: baseChar.cooldownMult || 1,  format: formatPct,           higherBetter: false },
        { label: 'Area',         current: p.areaMult,       base: baseChar.areaMult || 1,      format: formatPct,           higherBetter: true },
        { label: 'Proj. Speed',  current: p.projSpeedMult,  base: baseChar.projSpeedMult || 1, format: formatPct,           higherBetter: true },
        { label: 'Magnet',       current: p.magnetRange,    base: (baseChar.magnetRange || 60) + 30, format: (v) => formatNum(v, 0), higherBetter: true },
        { label: 'Armor',        current: p.armor,          base: baseChar.armor || 0,         format: (v) => formatNum(v, 0), higherBetter: true },
        { label: 'Regen/s',      current: p.regen,          base: baseChar.regen || 0,         format: (v) => formatNum(v, 1), higherBetter: true },
        { label: 'Luck',         current: p.luck,           base: baseChar.luck || 0,          format: (v) => formatNum(v, 0), higherBetter: true },
        { label: 'Gold Bonus',   current: p.goldMult,       base: baseChar.goldMult || 1,      format: formatPct,           higherBetter: true },
        { label: 'XP Bonus',     current: p.xpMult,         base: baseChar.xpMult || 1,        format: formatPct,           higherBetter: true },
    ];

    const renderDelta = (row) => {
        const diff = row.current - row.base;
        if (Math.abs(diff) < 0.001) return null;
        // For "higher better" stats, positive diff is good (green).
        // For cooldown (lower better), negative diff is good (green).
        const isGain = row.higherBetter ? diff > 0 : diff < 0;
        const sign = diff > 0 ? '+' : '';
        return (
            <span className={`text-[10px] font-bold ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>
                {sign}{row.format(diff)}
            </span>
        );
    };

    return (
        <div className="bg-slate-950/70 border border-cyan-500/30 rounded-lg p-3 mt-4 text-left">
            <div className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase mb-2 text-center">
                Live Build · {p.name}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-400">{row.label}</span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-white font-mono font-bold">{row.format(row.current)}</span>
                            {renderDelta(row)}
                        </div>
                    </div>
                ))}
                <div className="flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded border border-slate-800 col-span-2">
                    <span className="text-slate-400">Max HP</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-white font-mono font-bold">{Math.round(p.maxHp)}</span>
                        {p.maxHp > baseChar.hp && (
                            <span className="text-[10px] font-bold text-emerald-400">
                                +{Math.round(p.maxHp - baseChar.hp)}
                            </span>
                        )}
                    </div>
                </div>
                {/* Pandypaws-only: scrap armor stack (hidden from HUD before this — players
                    couldn't see their +0.1 pickups accumulating. Each scrap = +0.1 armor,
                    capped at +10 per run. Shows stack count + bonus value next to base armor. */}
                {engine.characterId === 'pandypaws' && (
                    <div className="flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded border border-amber-700/50 col-span-2">
                        <span className="text-amber-300 flex items-center gap-1">⚙️ Scrap Armor</span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-white font-mono font-bold">
                                ×{Math.round((engine.characterMechanics?.scrapArmor || 0) * 10)}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-400">
                                +{(engine.characterMechanics?.scrapArmor || 0).toFixed(1)} armor
                            </span>
                            {(engine.characterMechanics?.scrapArmor || 0) >= 10 && (
                                <span className="text-[10px] font-bold text-amber-400">MAX</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 text-center italic">
                Green = gained from upgrades, talents, relics & mastery
            </div>
        </div>
    );
}