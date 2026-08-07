// Per-weapon synergy / evolution preview shown inside the Armory tab.
//
// Answers Simon's 2026-05-22 Discord ask: "the upgrading system shows evolution
// now — can we also have synergies, and which weapon they give?" Compact summary
// of every SYNERGIES / EVOLUTIONS entry where this weapon is the base / partner.
//
// Discovered combos (recorded on save.discoveredSynergies / discoveredEvolutions
// by GameEngine when they actually fire mid-run) reveal the result weapon name;
// undiscovered ones show as Locked so there's still a discovery loop in-run.
//
// Pure UI — no business logic, no SDK calls. Renders nothing when this weapon
// has no synergies AND no evolutions (e.g. utility-only weapons / synergy-only
// results that aren't pickable from the base armory).

import React from 'react';
import { SYNERGIES, EVOLUTIONS, WEAPONS, UPGRADES } from '../../game/Constants';
import { Sparkles, Lock, Beaker, Zap } from 'lucide-react';

export default function WeaponSynergyInfo({ weaponId, save }) {
    const synergies = (SYNERGIES || []).filter(s => s.weapon1 === weaponId || s.weapon2 === weaponId);
    const evolutions = (EVOLUTIONS || []).filter(e => e.baseWeapon === weaponId);
    if (synergies.length === 0 && evolutions.length === 0) return null;

    const discoveredSyn = save?.discoveredSynergies || [];
    const discoveredEvo = save?.discoveredEvolutions || [];

    return (
        <div className="mt-2 md:mt-3 bg-slate-950/60 border border-purple-700/30 rounded-lg p-2 md:p-2.5 space-y-1.5">
            {synergies.length > 0 && (
                <div>
                    <div className="text-[9px] md:text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                        <Beaker className="w-3 h-3" /> Synergies
                    </div>
                    <div className="space-y-0.5">
                        {synergies.map((syn, i) => {
                            const partnerId = syn.weapon1 === weaponId ? syn.weapon2 : syn.weapon1;
                            const partner = WEAPONS?.[partnerId];
                            const result = WEAPONS?.[syn.result];
                            const isDiscovered = discoveredSyn.includes(syn.result);
                            return (
                                <div key={`s-${i}`} className="flex items-center gap-1.5 text-[10px] md:text-xs leading-tight">
                                    <span className="text-cyan-400 font-bold truncate">+ {partner?.name || partnerId}</span>
                                    <span className="text-slate-600 shrink-0">→</span>
                                    {isDiscovered ? (
                                        <span className="text-rose-400 font-bold truncate flex items-center gap-1">
                                            <Sparkles className="w-2.5 h-2.5 shrink-0" /> {result?.name || syn.result}
                                        </span>
                                    ) : (
                                        <span className="text-slate-500 italic flex items-center gap-1 shrink-0">
                                            <Lock className="w-2.5 h-2.5" /> Locked
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {evolutions.length > 0 && (
                <div className={synergies.length > 0 ? 'pt-1.5 border-t border-purple-700/20' : ''}>
                    <div className="text-[9px] md:text-[10px] font-bold text-orange-300 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                        <Zap className="w-3 h-3" /> Evolves With
                    </div>
                    <div className="space-y-0.5">
                        {evolutions.map((evo, i) => {
                            const passive = (UPGRADES || []).find(u => u.id === evo.passive);
                            const evolved = WEAPONS?.[evo.evolvedWeapon];
                            const isDiscovered = discoveredEvo.includes(evo.evolvedWeapon);
                            return (
                                <div key={`e-${i}`} className="flex items-center gap-1.5 text-[10px] md:text-xs leading-tight">
                                    <span className="text-emerald-400 font-bold truncate">+ {passive?.name || evo.passive}</span>
                                    <span className="text-slate-600 shrink-0">⟶</span>
                                    {isDiscovered ? (
                                        <span className="text-orange-400 font-bold truncate flex items-center gap-1">
                                            <Sparkles className="w-2.5 h-2.5 shrink-0" /> {evolved?.name || evo.evolvedWeapon}
                                        </span>
                                    ) : (
                                        <span className="text-slate-500 italic flex items-center gap-1 shrink-0">
                                            <Lock className="w-2.5 h-2.5" /> Locked
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}