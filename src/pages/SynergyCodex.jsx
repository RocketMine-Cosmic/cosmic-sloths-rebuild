import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SaveManager } from '../game/SaveManager';
import { SYNERGIES, WEAPONS, EVOLUTIONS, UPGRADES } from '../game/Constants';
import { ArrowLeft, BookOpen, Lock, Sparkles, Crosshair } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import { SoundManager } from '../game/SoundManager';
import WeaponSimulation from '../components/game/WeaponSimulation';

export default function SynergyCodex({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());
    const [activeTab, setActiveTab] = useState('synergies'); // 'synergies' or 'evolutions'
    const [previewWeapon, setPreviewWeapon] = useState(null);

    useEffect(() => {
        const handleSaveUpdated = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, []);

    // Force reload save when page becomes visible (handles stale data when returning from game)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                setSave(SaveManager.load());
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const discovered = save.discoveredSynergies || [];
    const discoveredEvolutions = save.discoveredEvolutions || [];

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'h-full flex flex-col' : 'h-[100dvh] flex flex-col'} relative text-slate-200 p-2 pb-2 md:p-6 font-sans overflow-hidden`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4 shrink-0">
                    <div>
                        {!isCarousel && (
                            <button 
                                onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                            </button>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #F43F5E, #E11D48)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(244,63,94,0.5))' }}>
                            <BookOpen className="w-6 h-6 md:w-8 md:h-8 text-rose-500" /> COSMIC CODEX
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">
                            Synergies · Evolutions
                        </p>
                    </div>
                    <CurrencyHeader />
                </header>

                <div className="flex justify-center gap-2 mb-4 w-full max-w-2xl shrink-0 mx-auto">
                    <button onClick={() => { SoundManager.playUIClick(); setActiveTab('synergies'); setPreviewWeapon(null); }} className={`flex-1 px-2 md:px-4 py-2 md:py-3 font-bold uppercase tracking-widest text-[10px] md:text-sm rounded-lg border transition-all ${activeTab === 'synergies' ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>
                        Synergies
                    </button>
                    <button onClick={() => { SoundManager.playUIClick(); setActiveTab('evolutions'); setPreviewWeapon(null); }} className={`flex-1 px-2 md:px-4 py-2 md:py-3 font-bold uppercase tracking-widest text-[10px] md:text-sm rounded-lg border transition-all ${activeTab === 'evolutions' ? 'bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>
                        Evolutions
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-20">
                    {activeTab === 'synergies' && (
                        <>
                            <p className="text-slate-300 text-xs md:text-base text-center">Combine specific weapons during a run to create devastating synergies.</p>
                            <div className="text-center text-xs text-rose-400 font-bold mb-4">Discovered: {discovered.length} / {SYNERGIES.length}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                        {SYNERGIES.map((synergy, index) => {
                            const resultWeapon = WEAPONS[synergy.result];
                            const w1 = WEAPONS[synergy.weapon1];
                            const w2 = WEAPONS[synergy.weapon2];
                            const isDiscovered = discovered.includes(synergy.result);

                            return (
                                <div key={index} className={`p-3 md:p-4 rounded-xl border-2 transition-all flex flex-col h-full ${
                                    isDiscovered 
                                    ? 'bg-[#0b0416]/80 backdrop-blur-xl border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                                    : 'bg-slate-900/60 border-slate-800'
                                }`}>
                                    <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                                        <div className={`p-2 md:p-3 rounded-lg border shrink-0 ${isDiscovered ? 'bg-rose-950/50 border-rose-500/50 text-rose-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                            {isDiscovered ? <Sparkles className="w-5 h-5 md:w-6 md:h-6" /> : <Lock className="w-5 h-5 md:w-6 md:h-6" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className={`font-black text-base md:text-lg tracking-widest uppercase truncate ${isDiscovered ? 'text-white' : 'text-slate-500'}`}>
                                                {isDiscovered ? resultWeapon.name : 'Unknown Synergy'}
                                            </h3>
                                            <p className="text-[10px] md:text-xs text-slate-400 line-clamp-2">
                                                {isDiscovered ? resultWeapon.desc : 'Discover this synergy in a run to reveal its true power.'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-auto">
                                        <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-bold bg-slate-950/50 p-2 md:p-3 rounded-lg border border-slate-800">
                                            <div className={`flex-1 text-center truncate ${isDiscovered ? 'text-cyan-400' : 'text-slate-500'}`}>{w1.name}</div>
                                            <div className="text-slate-600">+</div>
                                            <div className={`flex-1 text-center truncate ${isDiscovered ? 'text-amber-400' : 'text-slate-500'}`}>{w2.name}</div>
                                        </div>

                                        {isDiscovered && (
                                            <div className="mt-2 md:mt-3 grid grid-cols-3 gap-1.5 md:gap-2 text-center text-[10px] md:text-xs">
                                                <div className="bg-slate-950 p-1.5 md:p-2 rounded border border-slate-800">
                                                    <div className="text-slate-500 mb-0.5 md:mb-1">Base Dmg</div>
                                                    <div className="font-mono text-rose-400">{resultWeapon.baseDamage}</div>
                                                </div>
                                                <div className="bg-slate-950 p-1.5 md:p-2 rounded border border-slate-800">
                                                    <div className="text-slate-500 mb-0.5 md:mb-1">Cooldown</div>
                                                    <div className="font-mono text-cyan-400">{resultWeapon.baseCooldown}s</div>
                                                </div>
                                                <div className="bg-slate-950 p-1.5 md:p-2 rounded border border-slate-800">
                                                    <div className="text-slate-500 mb-0.5 md:mb-1">Area</div>
                                                    <div className="font-mono text-amber-400">{resultWeapon.baseArea}x</div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="mt-3 pt-2 border-t border-slate-800/50">
                                            <button 
                                                onClick={() => {
                                                    SoundManager.playUIClick();
                                                    setPreviewWeapon(previewWeapon === resultWeapon.id ? null : resultWeapon.id);
                                                }}
                                                className={`w-full py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                                                    previewWeapon === resultWeapon.id 
                                                    ? 'bg-slate-700 text-white' 
                                                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                                                }`}
                                            >
                                                <Crosshair className="w-4 h-4" /> 
                                                {previewWeapon === resultWeapon.id ? 'Close Simulation' : 'Preview Synergy Power'}
                                            </button>
                                            
                                            {previewWeapon === resultWeapon.id && (
                                                <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <WeaponSimulation weaponId={resultWeapon.id} isMastered={true} />
                                                    <div className="text-[10px] text-slate-500 text-center mt-2 italic">
                                                        Previewing fully realized synergy power.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                            </div>
                        </>
                    )}

                    {activeTab === 'evolutions' && (
                        <>
                            <p className="text-slate-300 text-xs md:text-base text-center">Combine a base weapon with the right passive upgrade in a run to evolve it into a devastating ultimate form.</p>
                            <div className="text-center text-xs text-orange-400 font-bold mb-4">Discovered: {discoveredEvolutions.length} / {EVOLUTIONS.length}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                                {EVOLUTIONS.map((evolution, index) => {
                                    const baseWeapon = WEAPONS[evolution.baseWeapon];
                                    const evolvedWeapon = WEAPONS[evolution.evolvedWeapon];
                                    const passiveUpgrade = UPGRADES.find(u => u.id === evolution.passive);
                                    const isDiscovered = discoveredEvolutions.includes(evolution.evolvedWeapon);

                                    return (
                                        <div key={index} className={`p-3 md:p-4 rounded-xl border-2 transition-all flex flex-col h-full ${
                                            isDiscovered
                                            ? 'bg-[#0b0416]/80 backdrop-blur-xl border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.2)]'
                                            : 'bg-slate-900/60 border-slate-800'
                                        }`}>
                                            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                                                <div className={`p-2 md:p-3 rounded-lg border shrink-0 ${isDiscovered ? 'bg-orange-950/50 border-orange-500/50 text-orange-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                                    {isDiscovered ? <Sparkles className="w-5 h-5 md:w-6 md:h-6" /> : <Lock className="w-5 h-5 md:w-6 md:h-6" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className={`font-black text-base md:text-lg tracking-widest uppercase truncate ${isDiscovered ? 'text-white' : 'text-slate-500'}`}>
                                                        {isDiscovered ? evolvedWeapon.name : 'Unknown Evolution'}
                                                    </h3>
                                                    <p className="text-[10px] md:text-xs text-slate-400 line-clamp-2">
                                                        {isDiscovered ? evolvedWeapon.desc.replace('EVOLVED: ', '') : 'Trigger this evolution in a run to reveal its true power.'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-auto">
                                                <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-bold bg-slate-950/50 p-2 md:p-3 rounded-lg border border-slate-800">
                                                    <div className={`flex-1 text-center truncate ${isDiscovered ? 'text-cyan-400' : 'text-slate-500'}`}>{baseWeapon.name}</div>
                                                    <div className="text-slate-600">+</div>
                                                    <div className={`flex-1 text-center truncate ${isDiscovered ? 'text-emerald-400' : 'text-slate-500'}`}>{passiveUpgrade?.name || evolution.passive}</div>
                                                </div>

                                                {isDiscovered && (
                                                    <div className="mt-2 md:mt-3 grid grid-cols-3 gap-1.5 md:gap-2 text-center text-[10px] md:text-xs">
                                                        <div className="bg-slate-950 p-1.5 md:p-2 rounded border border-slate-800">
                                                            <div className="text-slate-500 mb-0.5 md:mb-1">Base Dmg</div>
                                                            <div className="font-mono text-orange-400">{evolvedWeapon.baseDamage}</div>
                                                        </div>
                                                        <div className="bg-slate-950 p-1.5 md:p-2 rounded border border-slate-800">
                                                            <div className="text-slate-500 mb-0.5 md:mb-1">Cooldown</div>
                                                            <div className="font-mono text-cyan-400">{evolvedWeapon.baseCooldown}s</div>
                                                        </div>
                                                        <div className="bg-slate-950 p-1.5 md:p-2 rounded border border-slate-800">
                                                            <div className="text-slate-500 mb-0.5 md:mb-1">Area</div>
                                                            <div className="font-mono text-amber-400">{evolvedWeapon.baseArea}x</div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="mt-3 pt-2 border-t border-slate-800/50">
                                                    <button
                                                        onClick={() => {
                                                            SoundManager.playUIClick();
                                                            setPreviewWeapon(previewWeapon === evolvedWeapon.id ? null : evolvedWeapon.id);
                                                        }}
                                                        className={`w-full py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                                                            previewWeapon === evolvedWeapon.id
                                                            ? 'bg-slate-700 text-white'
                                                            : 'bg-orange-600 hover:bg-orange-500 text-white'
                                                        }`}
                                                    >
                                                        <Crosshair className="w-4 h-4" />
                                                        {previewWeapon === evolvedWeapon.id ? 'Close Simulation' : 'Preview Evolution'}
                                                    </button>

                                                    {previewWeapon === evolvedWeapon.id && (
                                                        <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <WeaponSimulation weaponId={evolvedWeapon.id} isMastered={true} />
                                                            <div className="text-[10px] text-slate-500 text-center mt-2 italic">
                                                                Previewing fully evolved weapon power.
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                </div>
            </div>
        </div>
        </OmenXGate>
    );
}