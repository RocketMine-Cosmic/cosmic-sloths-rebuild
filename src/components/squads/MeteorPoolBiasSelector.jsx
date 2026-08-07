import React, { useState, useEffect } from 'react';
import { Wand2, Check, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import MeteorPoolBiasCustomEditor from './MeteorPoolBiasCustomEditor';
import { SoundManager } from '../../game/SoundManager';
import { POOL_BIAS_PRESETS, buildPresetAllocation } from '@/lib/poolBiasPresets';
import { getTotalBiasPoints } from '@/lib/poolBias';

// Same preset buttons as the Loadouts page, but saves to a SEPARATE field
// (meteorPoolBiasAllocations). GameEngine swaps poolBiasAllocations for this
// value when the run's arena is quantum_meteor, then reverts after the run.
// Players no longer have to manually respec before/after every meteor run.
export default function MeteorPoolBiasSelector() {
    const [save, setSave] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const local = SaveManager.load();
        if (local) { setSave(local); setLoading(false); }
        // Refresh from cloud in case local was missing the meteor field.
        (async () => {
            try {
                const user = await base44.auth.me();
                if (!user) return;
                const w = (user.wallet_address || '').toLowerCase();
                const rows = await base44.entities.PlayerSave.filter({ wallet_address: w });
                if (rows.length > 0 && !cancelled) {
                    const sd = typeof rows[0].save_data === 'string' ? JSON.parse(rows[0].save_data) : rows[0].save_data;
                    setSave(sd);
                }
            } catch (_) {}
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading || !save) return null;

    const totalPoints = getTotalBiasPoints(save);
    const currentMeteor = save.meteorPoolBiasAllocations || null;
    const activePresetId = currentMeteor && Object.keys(currentMeteor).length > 0
        ? POOL_BIAS_PRESETS.find(p => {
            const expected = buildPresetAllocation(p.weights, totalPoints);
            return JSON.stringify(expected) === JSON.stringify(currentMeteor);
        })?.id || 'custom'
        : null;

    const apply = (preset) => {
        SoundManager.playUIClick();
        const allocation = buildPresetAllocation(preset.weights, totalPoints);
        const next = { ...save, meteorPoolBiasAllocations: allocation };
        SaveManager.save(next);
        setSave(next);
    };

    const clear = () => {
        SoundManager.playUIClick();
        const next = { ...save };
        delete next.meteorPoolBiasAllocations;
        SaveManager.save(next);
        setSave(next);
    };

    return (
        <div className="mb-3 p-3 bg-slate-900/40 border border-purple-500/30 rounded-lg">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-fuchsia-300 font-bold text-xs uppercase tracking-wider">
                    <Wand2 className="w-3.5 h-3.5" /> Meteor Loadout
                </div>
                <div className="text-[10px] text-slate-400">
                    {totalPoints > 0 ? `${totalPoints} pts available` : 'No bias points yet'}
                </div>
            </div>
            <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                Auto-applies when you start a meteor run. Doesn't touch your main loadout.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {POOL_BIAS_PRESETS.map(p => {
                    const isActive = activePresetId === p.id;
                    return (
                        <button
                            key={p.id}
                            onClick={() => apply(p)}
                            disabled={totalPoints <= 0}
                            title={totalPoints <= 0 ? 'Earn bias points by leveling permanent upgrades' : p.desc}
                            className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors border ${
                                isActive
                                    ? 'bg-fuchsia-900/40 border-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.3)]'
                                    : 'bg-slate-900/60 hover:bg-fuchsia-900/30 border-slate-700 hover:border-fuchsia-500/60'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <span className="text-base shrink-0">{p.icon}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-fuchsia-200 truncate flex items-center gap-1">
                                    {p.name}
                                    {isActive && <Check className="w-3 h-3 text-emerald-400" />}
                                </div>
                                <div className="text-[9px] text-slate-400 leading-tight line-clamp-2">{p.desc}</div>
                            </div>
                        </button>
                    );
                })}
                <button
                    onClick={clear}
                    disabled={!activePresetId}
                    className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors border bg-slate-900/60 hover:bg-slate-800 border-slate-700 text-slate-300 text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Use your main loadout for meteor runs"
                >
                    <X className="w-3 h-3" /> Use Main
                </button>
            </div>
            <MeteorPoolBiasCustomEditor save={save} setSave={setSave} />
        </div>
    );
}