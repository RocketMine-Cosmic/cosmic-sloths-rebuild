import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import { CHARACTERS } from '../../game/Constants';

function NumericField({ label, value, onChange, min = 0, max }) {
    return (
        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800/50 last:border-0">
            <span className="text-xs text-slate-300">{label}</span>
            <div className="flex items-center gap-1.5">
                <button onClick={() => onChange(Math.max(min, (value || 0) - 1))} className="w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">
                    <Minus size={10} />
                </button>
                <input type="number" value={value || 0} min={min} max={max}
                    onChange={e => onChange(Number(e.target.value))}
                    className="w-24 bg-slate-800 border border-slate-600 text-white rounded px-2 py-0.5 text-xs text-center focus:outline-none focus:border-cyan-500 font-mono" />
                <button onClick={() => onChange((value || 0) + 1)} className="w-6 h-6 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">
                    <Plus size={10} />
                </button>
            </div>
        </div>
    );
}

function Section({ title, color = 'text-cyan-400', children }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-slate-700/60 rounded-lg overflow-hidden">
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 hover:bg-slate-800/60 transition-colors">
                <span className={`font-bold text-sm uppercase tracking-wider ${color}`}>{title}</span>
                {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {open && <div className="p-4 bg-slate-950/40">{children}</div>}
        </div>
    );
}

// Profile, NG+, VIP, session buffs, per-character kill counts.
export default function PlayerProfileFlags({ draft, setDraft }) {
    const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
    const xpExpiry = draft.sessionBuffs?.xpExpiry || 0;
    const xpActive = xpExpiry > Date.now();
    const minutesLeft = xpActive ? Math.round((xpExpiry - Date.now()) / 60000) : 0;

    return (
        <>
            <Section title="🪪 Profile & Flags" color="text-sky-400">
                <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Pilot Name</label>
                        <input type="text" value={draft.pilotName || ''} onChange={e => set('pilotName', e.target.value)}
                            placeholder="Pilot name"
                            className="bg-slate-800 border border-slate-600 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cyan-500" />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={!!draft.hasSetProfileName} onChange={e => set('hasSetProfileName', e.target.checked)} className="accent-cyan-500" />
                        Has Set Profile Name
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={!!draft.newGamePlusUnlocked} onChange={e => set('newGamePlusUnlocked', e.target.checked)} className="accent-cyan-500 mt-0.5" />
                        <span>
                            New Game+ Unlocked
                            <span className="block text-[9px] text-slate-500 normal-case">Player has beaten the final sector — the NG+ toggle is now visible in their Hub.</span>
                        </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={!!draft.isNGPlus} onChange={e => set('isNGPlus', e.target.checked)} className="accent-cyan-500 mt-0.5" />
                        <span>
                            NG+ Active (harder runs, better rewards)
                            <span className="block text-[9px] text-slate-500 normal-case">Player has the NG+ checkbox ticked in their Hub — every run starts in NG+ mode.</span>
                        </span>
                    </label>
                    <NumericField label="VIP Level (cached)" value={draft.vipLevel} onChange={v => set('vipLevel', v)} max={20} />
                </div>
            </Section>

            <Section title="⏱️ Session Buffs" color="text-emerald-400">
                <div className="space-y-2">
                    <div className="text-[11px] text-slate-400">
                        XP Buff: {xpActive ? <span className="text-emerald-300 font-bold">Active — {minutesLeft} min left</span> : <span className="text-slate-500">Inactive</span>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setDraft(d => ({ ...d, sessionBuffs: { ...(d.sessionBuffs || {}), xpExpiry: Date.now() + 60 * 60 * 1000 } }))}
                            className="text-xs bg-emerald-800 hover:bg-emerald-700 text-white px-3 py-1 rounded font-bold">Grant +50% XP (60 min)</button>
                        <button onClick={() => setDraft(d => ({ ...d, sessionBuffs: { ...(d.sessionBuffs || {}), xpExpiry: Date.now() + 24 * 60 * 60 * 1000 } }))}
                            className="text-xs bg-emerald-800 hover:bg-emerald-700 text-white px-3 py-1 rounded font-bold">Grant +50% XP (24 h)</button>
                        <button onClick={() => setDraft(d => ({ ...d, sessionBuffs: { ...(d.sessionBuffs || {}), xpExpiry: 0 } }))}
                            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded font-bold">Clear</button>
                    </div>
                </div>
            </Section>

            <Section title="🎯 Per-Character Kill Counts (Mastery)" color="text-purple-400">
                <div className="text-[10px] text-slate-500 mb-2">Drives mastery tiers. Values are cumulative kills per character.</div>
                {CHARACTERS.map(c => (
                    <NumericField key={c.id} label={c.name}
                        value={(draft.characterKills || {})[c.id] || 0}
                        onChange={v => setDraft(d => ({ ...d, characterKills: { ...(d.characterKills || {}), [c.id]: v } }))} />
                ))}
            </Section>
        </>
    );
}