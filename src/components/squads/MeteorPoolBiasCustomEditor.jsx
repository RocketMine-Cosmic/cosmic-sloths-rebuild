import React, { useState } from 'react';
import { Plus, Minus, RotateCcw, ChevronDown, ChevronUp, Sword, Zap } from 'lucide-react';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import {
    BIAS_PER_POINT,
    getBiasTargets,
    getTotalBiasPoints,
} from '@/lib/poolBias';

// Custom per-stat point editor for the meteor-only pool bias loadout.
// Reads/writes save.meteorPoolBiasAllocations directly — no respec gating because
// changing this field doesn't affect the player's main loadout. Toggle stays
// collapsed by default so the presets remain the primary UX for casual users.
function Row({ target, points, onAdd, onRemove, canAdd, accent }) {
    const pct = points * BIAS_PER_POINT * 100;
    return (
        <div className={`flex items-center justify-between gap-2 bg-slate-900/60 border ${accent.border} rounded-lg px-2.5 py-1.5`}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-base shrink-0">{target.icon}</span>
                <span className={`text-xs font-bold truncate ${accent.text}`}>{target.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-slate-300 tabular-nums w-16 text-right">
                    {points} pts <span className="text-slate-500">+{pct.toFixed(0)}%</span>
                </span>
                <button
                    onClick={onRemove}
                    disabled={points <= 0}
                    className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white text-[10px] font-bold"
                    title="Remove 1 point"
                >
                    <Minus className="w-3 h-3" />
                </button>
                <button
                    onClick={onAdd}
                    disabled={!canAdd}
                    className={`px-1.5 py-0.5 rounded ${accent.btn} disabled:opacity-40 text-white text-[10px] font-bold`}
                    title="Add 1 point"
                >
                    <Plus className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}

export default function MeteorPoolBiasCustomEditor({ save, setSave }) {
    const [open, setOpen] = useState(false);

    const totalPoints = getTotalBiasPoints(save);
    const allocations = save.meteorPoolBiasAllocations || {};
    const spent = Object.values(allocations).reduce((a, b) => a + Number(b || 0), 0);
    const remaining = Math.max(0, totalPoints - spent);

    const writeAllocations = (next) => {
        const cleaned = { ...next };
        for (const k of Object.keys(cleaned)) {
            if (!cleaned[k]) delete cleaned[k];
        }
        const updated = { ...save, meteorPoolBiasAllocations: cleaned };
        SaveManager.save(updated);
        setSave(updated);
    };

    const addPoint = (id) => {
        if (remaining <= 0) return;
        SoundManager.playUIClick();
        writeAllocations({ ...allocations, [id]: Number(allocations[id] || 0) + 1 });
    };

    const removePoint = (id) => {
        const cur = Number(allocations[id] || 0);
        if (cur <= 0) return;
        SoundManager.playUIClick();
        writeAllocations({ ...allocations, [id]: cur - 1 });
    };

    const resetAll = () => {
        SoundManager.playUIClick();
        writeAllocations({});
    };

    const targets = getBiasTargets();
    const weaponAccent = { border: 'border-cyan-500/30',  text: 'text-cyan-300',   btn: 'bg-cyan-700 hover:bg-cyan-600' };
    const statAccent   = { border: 'border-amber-500/30', text: 'text-amber-300',  btn: 'bg-amber-700 hover:bg-amber-600' };

    return (
        <div className="mt-2 border-t border-slate-800 pt-2">
            <button
                onClick={() => { SoundManager.playUIClick(); setOpen(o => !o); }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-900/40 hover:bg-slate-800/60 border border-slate-700 transition-colors"
            >
                <span className="text-[11px] font-bold text-fuchsia-300 uppercase tracking-wider">
                    ✏️ Custom Loadout
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    {spent > 0 ? `${spent}/${totalPoints} pts spent` : 'Pick exact stats & weapons'}
                    {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </span>
            </button>

            {open && (
                <div className="mt-2 p-2 bg-slate-950/40 border border-slate-800 rounded-lg">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-[10px] text-slate-400">
                            <span className="text-cyan-300 font-mono font-bold">{remaining}</span>
                            <span className="text-slate-500"> / {totalPoints} available</span>
                        </div>
                        <button
                            onClick={resetAll}
                            disabled={spent === 0}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-[10px] font-bold flex items-center gap-1 border border-slate-700"
                            title="Clear all custom points"
                        >
                            <RotateCcw className="w-3 h-3" /> Reset
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                                <Sword className="w-3 h-3" /> Weapons
                            </div>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {targets.weapons.map(t => (
                                    <Row
                                        key={t.id}
                                        target={t}
                                        points={Number(allocations[t.id] || 0)}
                                        onAdd={() => addPoint(t.id)}
                                        onRemove={() => removePoint(t.id)}
                                        canAdd={remaining > 0}
                                        accent={weaponAccent}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[10px] uppercase tracking-wider mb-1">
                                <Zap className="w-3 h-3" /> Stats
                            </div>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {targets.stats.map(t => (
                                    <Row
                                        key={t.id}
                                        target={t}
                                        points={Number(allocations[t.id] || 0)}
                                        onAdd={() => addPoint(t.id)}
                                        onRemove={() => removePoint(t.id)}
                                        canAdd={remaining > 0}
                                        accent={statAccent}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {totalPoints <= 0 && (
                        <div className="mt-2 text-[10px] text-slate-500 text-center">
                            Earn bias points by leveling permanent upgrades.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}