import React, { useState } from 'react';
import { CHARACTERS } from '../../game/Constants';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

// Mirrors WEAPON_AUGMENTS in components/game/ForgePanel — just id + label for the editor.
const WEAPON_AUGMENT_IDS = [
    'damage_1', 'damage_2', 'damage_3',
    'area_1',   'area_2',   'area_3',
    'cd_1',     'cd_2',     'cd_3',
];
const WEAPON_IDS = [
    'neoBlaster', 'napBeam', 'vineWhip', 'slothSwarm', 'napalm',
    'novaPulse', 'shieldBubble', 'bouncingBlade', 'toxicCloud',
];

// Mirrors CHAR_AUGMENTS in components/game/ForgePanel — id + name + character.
const CHAR_AUGMENTS_BY_CHAR = {
    neobyte:     [['neo_crit', 'Overclocked Circuits'], ['neo_chain', 'Chain Reaction'], ['neo_surge', 'Voltage Surge']],
    pandypaws:   [['pan_armor', 'Reactive Plating'], ['pan_stomp', 'Seismic Stomp'], ['pan_fortress', 'Iron Fortress']],
    novabyte:    [['nova_aoe', 'Overpressure'], ['nova_chain', 'Fragmentation'], ['nova_nuke', 'Tactical Nuke']],
    glitch:      [['glt_phase', 'Phase Shift'], ['glt_corrupt', 'Data Corruption'], ['glt_copy', 'Mirror Copy']],
    holodrift:   [['holo_regen', 'Holographic Repair'], ['holo_speed', 'Drift Boosters'], ['holo_revive', 'Emergency Protocol']],
    codebreaker: [['code_xp', 'XP Exploit'], ['code_hack', 'System Hack'], ['code_virus', 'Cascade Virus']],
    dataphantom: [['dat_ghost', 'Ghost Protocol'], ['dat_drain', 'Life Drain'], ['dat_shade', 'Shadow Realm']],
    neonvortex:  [['neo_range', 'Extended Barrel'], ['neo_pierce', 'Tungsten Rounds'], ['neo_rail', 'Railgun Cal.']],
    synthbeats:  [['syn_gold', 'Gold Frequency'], ['syn_beat', 'Bass Cannon'], ['syn_amp', 'Amp Overload']],
    skybyte:     [['sky_speed', 'Afterburners'], ['sky_twin', 'Twin Laser'], ['sky_ace', 'Ace Maneuver']],
};

function Chip({ label, active, onClick }) {
    return (
        <button onClick={onClick}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors flex items-center gap-1 ${
                active ? 'bg-yellow-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
            {active ? <Check size={10} /> : null}
            {label}
        </button>
    );
}

export default function PlayerForgeAugments({ draft, setDraft }) {
    const [open, setOpen] = useState(false);

    const toggleWeaponAug = (weaponId, augId) => {
        const map = draft.forgeWeaponAugments || {};
        const owned = map[weaponId] || [];
        const updated = owned.includes(augId) ? owned.filter(x => x !== augId) : [...owned, augId];
        setDraft(d => ({ ...d, forgeWeaponAugments: { ...map, [weaponId]: updated } }));
    };

    const toggleCharAug = (charId, augId) => {
        const map = draft.forgeCharAugments || {};
        const owned = map[charId] || [];
        const updated = owned.includes(augId) ? owned.filter(x => x !== augId) : [...owned, augId];
        setDraft(d => ({ ...d, forgeCharAugments: { ...map, [charId]: updated } }));
    };

    const grantAllWeapon = () => {
        const map = {};
        WEAPON_IDS.forEach(w => { map[w] = [...WEAPON_AUGMENT_IDS]; });
        setDraft(d => ({ ...d, forgeWeaponAugments: map }));
    };
    const grantAllChar = () => {
        const map = {};
        Object.entries(CHAR_AUGMENTS_BY_CHAR).forEach(([cid, augs]) => { map[cid] = augs.map(a => a[0]); });
        setDraft(d => ({ ...d, forgeCharAugments: map }));
    };
    const clearAll = () => setDraft(d => ({ ...d, forgeWeaponAugments: {}, forgeCharAugments: {} }));

    return (
        <div className="border border-slate-700/60 rounded-lg overflow-hidden">
            <button onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 hover:bg-slate-800/60 transition-colors">
                <span className="font-bold text-sm uppercase tracking-wider text-yellow-400">🔨 Forge Augments</span>
                {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {open && (
                <div className="p-4 bg-slate-950/40 space-y-4">
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={grantAllWeapon} className="text-xs bg-yellow-800 hover:bg-yellow-700 text-white px-3 py-1 rounded font-bold">Grant All Weapon Augments</button>
                        <button onClick={grantAllChar} className="text-xs bg-yellow-800 hover:bg-yellow-700 text-white px-3 py-1 rounded font-bold">Grant All Char Augments</button>
                        <button onClick={clearAll} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded font-bold">Clear All</button>
                    </div>

                    <div>
                        <div className="text-[11px] font-bold text-yellow-300 uppercase tracking-wider mb-2">⚔️ Weapon Augments</div>
                        <div className="space-y-2">
                            {WEAPON_IDS.map(wid => {
                                const owned = (draft.forgeWeaponAugments || {})[wid] || [];
                                return (
                                    <div key={wid}>
                                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">{wid}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {WEAPON_AUGMENT_IDS.map(aid => (
                                                <Chip key={aid} label={aid} active={owned.includes(aid)}
                                                    onClick={() => toggleWeaponAug(wid, aid)} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="text-[11px] font-bold text-yellow-300 uppercase tracking-wider mb-2">🧬 Character Augments</div>
                        <div className="space-y-2">
                            {CHARACTERS.map(c => {
                                const augs = CHAR_AUGMENTS_BY_CHAR[c.id];
                                if (!augs) return null;
                                const owned = (draft.forgeCharAugments || {})[c.id] || [];
                                return (
                                    <div key={c.id}>
                                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">{c.name}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {augs.map(([aid, name]) => (
                                                <Chip key={aid} label={name} active={owned.includes(aid)}
                                                    onClick={() => toggleCharAug(c.id, aid)} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}