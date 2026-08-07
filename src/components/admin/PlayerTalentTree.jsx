import React from 'react';
import { CHARACTERS } from '../../game/Constants';

// Talent IDs per character — must mirror functions/purchaseSku.js TALENT_PREREQS.
// Tier 1: <prefix>_1   |   Tier 2: <prefix>_2a / _2b   |   Tier 3: <prefix>_3a / _3b
const TALENT_PREFIXES = {
    neobyte: 'neo', pandypaws: 'pan', novabyte: 'nova', glitch: 'gli',
    holodrift: 'holo', codebreaker: 'code', dataphantom: 'data',
    neonvortex: 'neon', synthbeats: 'syn', skybyte: 'sky',
};

function buildTalentIds(charId) {
    const p = TALENT_PREFIXES[charId];
    if (!p) return [];
    return [
        { tier: 1, ids: [`${p}_1`] },
        { tier: 2, ids: [`${p}_2a`, `${p}_2b`] },
        { tier: 3, ids: [`${p}_3a`, `${p}_3b`] },
    ];
}

function TalentChip({ id, active, onClick }) {
    return (
        <button onClick={onClick}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                active ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
            {active ? '✓ ' : ''}{id}
        </button>
    );
}

// Editor for a single talent tier (permanent / weekly / seasonal).
// Each character has 5 talent IDs across 3 tiers; values are arrays of unlocked ids.
export default function PlayerTalentTree({ tierKey, draft, setDraft }) {
    const tree = draft[tierKey] || {};

    const toggle = (charId, talentId) => {
        const arr = Array.isArray(tree[charId]) ? [...tree[charId]] : [];
        const next = arr.includes(talentId) ? arr.filter(t => t !== talentId) : [...arr, talentId];
        setDraft(d => ({ ...d, [tierKey]: { ...(d[tierKey] || {}), [charId]: next } }));
    };

    const grantAll = (charId) => {
        const all = buildTalentIds(charId).flatMap(t => t.ids);
        setDraft(d => ({ ...d, [tierKey]: { ...(d[tierKey] || {}), [charId]: all } }));
    };

    const clear = (charId) => {
        setDraft(d => ({ ...d, [tierKey]: { ...(d[tierKey] || {}), [charId]: [] } }));
    };

    return (
        <div className="space-y-3">
            <div className="text-[10px] text-slate-500 mb-1">
                Each char has 5 talents across 3 tiers: T1 (<span className="font-mono">_1</span>) → T2 (<span className="font-mono">_2a</span>/<span className="font-mono">_2b</span>) → T3 (<span className="font-mono">_3a</span>/<span className="font-mono">_3b</span>). T2/T3 are exclusive paths.
            </div>
            {CHARACTERS.map(c => {
                const owned = tree[c.id] || [];
                const tiers = buildTalentIds(c.id);
                if (tiers.length === 0) return null;
                return (
                    <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded p-2">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[11px] font-bold text-slate-300">{c.name} <span className="text-slate-500 font-normal">({owned.length}/5)</span></div>
                            <div className="flex gap-1">
                                <button onClick={() => grantAll(c.id)} className="text-[9px] bg-emerald-800 hover:bg-emerald-700 text-white px-2 py-0.5 rounded font-bold">Grant All</button>
                                <button onClick={() => clear(c.id)} className="text-[9px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-0.5 rounded font-bold">Clear</button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            {tiers.map(t => (
                                <div key={t.tier} className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-500 font-bold w-6">T{t.tier}</span>
                                    <div className="flex flex-wrap gap-1">
                                        {t.ids.map(id => (
                                            <TalentChip key={id} id={id} active={owned.includes(id)} onClick={() => toggle(c.id, id)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}