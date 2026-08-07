import React, { useState, useEffect } from 'react';
import { SFXManager } from '../../game/SFXManager';
import { Volume2 } from 'lucide-react';

const SFX_CATEGORIES = [
    { id: 'weapons', label: 'Weapons', desc: 'Shots, lasers, projectiles' },
    { id: 'pickups', label: 'Pickups', desc: 'XP, gold, magnets' },
    { id: 'enemies', label: 'Enemies', desc: 'Spawns, hits, deaths' },
    { id: 'player', label: 'Player Hits', desc: 'Damage taken' },
    { id: 'ui', label: 'UI Clicks', desc: 'Menu interactions' },
    { id: 'events', label: 'Events', desc: 'Level up, victory, defeat' },
];

export default function SfxCategoryToggles() {
    const [cats, setCats] = useState({ ...SFXManager.categories });

    // Re-sync from SFXManager when the cloud save loads after this component
    // has already mounted (otherwise the panel would show stale local toggles).
    useEffect(() => {
        const onSaveUpdated = () => setCats({ ...SFXManager.categories });
        window.addEventListener('saveUpdated', onSaveUpdated);
        return () => window.removeEventListener('saveUpdated', onSaveUpdated);
    }, []);

    const toggle = (id) => {
        const next = !cats[id];
        SFXManager.setCategoryEnabled(id, next);
        setCats({ ...SFXManager.categories });
        if (next) SFXManager.playUIClick();
    };

    return (
        <div className="bg-[#0b0416]/60 border border-cyan-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <div className="text-xs font-bold tracking-widest text-cyan-300 uppercase">SFX Categories</div>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
                Mute specific sound types while keeping others on. Saved automatically.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SFX_CATEGORIES.map(cat => {
                    const on = cats[cat.id] !== false;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => toggle(cat.id)}
                            className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                                on
                                    ? 'bg-cyan-900/30 border-cyan-500/60 text-cyan-100 hover:bg-cyan-900/50'
                                    : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'
                            }`}
                        >
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                                <span>{on ? '✓' : '✕'}</span>
                                <span>{cat.label}</span>
                            </div>
                            <div className="text-[10px] opacity-70 mt-0.5">{cat.desc}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}