import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SaveManager } from '../game/SaveManager';
import { CHARACTERS, CHARACTER_MASTERY_LEVELS, CHARACTER_MASTERY_SIGNATURE, getCharacterMastery, WEAPONS } from '../game/Constants';
import { ArrowLeft, Award, Lock, CheckCircle2, Crosshair, Zap, Sparkles, Timer } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import { SoundManager } from '../game/SoundManager';
import WeaponSimulation from '../components/game/WeaponSimulation';

export default function Mastery({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());
    const [activeTab, setActiveTab] = useState('characters'); // 'characters' or 'weapons'
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

    const characterKills = save.characterKills || {};

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
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #F59E0B, #D97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }}>
                            <Award className="w-6 h-6 md:w-8 md:h-8 text-amber-500" /> PILOT MASTERY
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">
                            Characters · Weapons
                        </p>
                    </div>
                    <CurrencyHeader />
                </header>

                <div className="flex justify-center gap-2 mb-4 w-full max-w-2xl shrink-0 mx-auto">
                    <button
                        onClick={() => { SoundManager.playUIClick(); setActiveTab('characters'); setPreviewWeapon(null); }}
                        className={`flex-1 px-2 md:px-4 py-2 md:py-3 font-bold uppercase tracking-widest text-[10px] md:text-sm rounded-lg border transition-all ${activeTab === 'characters' ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Characters
                    </button>
                    <button
                        onClick={() => { SoundManager.playUIClick(); setActiveTab('weapons'); }}
                        className={`flex-1 px-2 md:px-4 py-2 md:py-3 font-bold uppercase tracking-widest text-[10px] md:text-sm rounded-lg border transition-all ${activeTab === 'weapons' ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Weapons
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-20">
                    {activeTab === 'characters' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {CHARACTERS.map((char) => {
                                const kills = characterKills[char.id] || 0;
                                const mastery = getCharacterMastery(kills, char.id);
                                const next = mastery.next;
                                const progressPercent = next ? Math.min(100, Math.max(0, (kills / next.killsRequired) * 100)) : 100;
                                // Build the visible bonus list: shared tiers 2-5 + character-specific tiers 6-7
                                const sig = CHARACTER_MASTERY_SIGNATURE[char.id];
                                const allTiersForChar = [...CHARACTER_MASTERY_LEVELS.slice(1)];
                                if (sig?.tier6) allTiersForChar.push({ level: 6, killsRequired: 50000, ...sig.tier6 });
                                if (sig?.tier7) allTiersForChar.push({ level: 7, killsRequired: 100000, ...sig.tier7 });
                                
                                return (
                                    <div key={char.id} className="bg-slate-900/60 border-slate-800 rounded-xl border-2 p-4 flex flex-col gap-4 transition-all hover:bg-slate-900/80">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 rounded-full overflow-hidden border-2 shrink-0 bg-slate-800 shadow-lg" style={{ borderColor: char.color }}>
                                                {char.image ? <img src={char.image} alt={char.name} className="w-full h-full object-cover" /> : null}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-black text-xl tracking-widest uppercase truncate" style={{ color: char.color, textShadow: `0 0 10px ${char.color}80` }}>
                                                    {char.name}
                                                </h3>
                                                <div className="text-xs text-slate-400 italic mb-1 break-words whitespace-normal leading-snug">
                                                    {char.desc}
                                                </div>
                                                {char.skillDesc && (
                                                    <div className="text-xs font-semibold mb-2 break-words whitespace-normal leading-snug" style={{ color: char.color }}>
                                                        Skill: {char.skillDesc}
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mb-2 text-[10px]">
                                                    {[
                                                        { label: 'HP', value: char.hp, base: CHARACTERS[0].hp, higherBetter: true },
                                                        { label: 'SPD', value: char.speed, base: CHARACTERS[0].speed, higherBetter: true },
                                                        { label: 'ARM', value: char.armor, base: CHARACTERS[0].armor, higherBetter: true },
                                                        { label: 'DMG', value: `${Math.round(char.damageMult * 100)}%`, raw: char.damageMult, base: CHARACTERS[0].damageMult, higherBetter: true },
                                                        { label: 'CD', value: `${Math.round(char.cooldownMult * 100)}%`, raw: char.cooldownMult, base: CHARACTERS[0].cooldownMult, higherBetter: false },
                                                        { label: 'AOE', value: `${Math.round(char.areaMult * 100)}%`, raw: char.areaMult, base: CHARACTERS[0].areaMult, higherBetter: true },
                                                    ].map(s => {
                                                        const cmp = s.raw !== undefined ? s.raw : s.value;
                                                        const isUp = s.higherBetter ? cmp > s.base : cmp < s.base;
                                                        const isDown = s.higherBetter ? cmp < s.base : cmp > s.base;
                                                        const cls = isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-slate-300';
                                                        return (
                                                            <div key={s.label} className="bg-slate-950/60 border border-slate-800 rounded px-1.5 py-1 text-center">
                                                                <div className="text-slate-500 font-bold">{s.label}</div>
                                                                <div className={`font-mono font-bold ${cls}`}>{s.value}{isUp ? '↑' : isDown ? '↓' : ''}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                                    <span className="font-bold text-white">{kills.toLocaleString()}</span> Total Kills
                                                </div>
                                                <div className="mt-1">
                                                    <span className="text-xs bg-slate-950 px-2 py-1 rounded border border-slate-700 font-bold flex items-center w-fit gap-1 text-white shadow-sm">
                                                        {mastery.current.badge} {mastery.current.title}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 shadow-inner">
                                            {next ? (
                                                <>
                                                    <div className="flex justify-between text-xs font-bold mb-1.5">
                                                        <span className="text-slate-400">Next: {next.badge} {next.title}</span>
                                                        <span className="text-slate-300">{kills.toLocaleString()} / {next.killsRequired.toLocaleString()}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full transition-all duration-500 shadow-[0_0_10px_currentColor]" 
                                                            style={{ width: `${progressPercent}%`, backgroundColor: char.color, color: char.color }}
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-center font-black tracking-widest text-amber-400 py-1.5 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                                                    MAXIMUM MASTERY ACHIEVED
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5 mt-1">
                                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 border-b border-slate-800/50 pb-1">Mastery Bonuses</div>
                                            {allTiersForChar.map((lvl) => {
                                                const isUnlocked = kills >= lvl.killsRequired;
                                                return (
                                                    <div key={lvl.level} className={`flex justify-between items-center p-2.5 rounded-lg text-xs transition-colors ${isUnlocked ? 'bg-amber-950/30 border border-amber-500/30 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 'bg-slate-950/50 border border-slate-800 text-slate-500'}`}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm">{lvl.badge}</span>
                                                            <span className="font-bold">{lvl.title}</span>
                                                        </div>
                                                        <div className="flex-1 flex justify-end items-center gap-3">
                                                            <div className="text-[10px] text-right truncate opacity-80" title={lvl.bonusDesc}>
                                                                {lvl.bonusDesc}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 opacity-90 w-24 justify-end font-mono">
                                                                {lvl.killsRequired >= 1000 ? `${(lvl.killsRequired/1000)}k` : lvl.killsRequired}
                                                                {isUnlocked ? <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" /> : <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'weapons' && (
                        <>
                            <p className="text-slate-300 text-xs md:text-base text-center mb-4">Upgrade your weapons in the <strong className="text-white">Lounge Armory</strong> to unlock their final Mastery forms.</p>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {Object.values(WEAPONS).filter(w => !w.isSynergy && !w.isEvolution).map((weapon, index) => {
                                    // Mastery is unlocked by PERMANENT weapon upgrades only.
                                    const getWeaponUpgrade = (wId, stat) => {
                                        return save.permanentWeaponUpgrades?.[wId]?.[stat] || 0;
                                    };

                                    const dmgLvl = getWeaponUpgrade(weapon.id, 'damage');
                                    const areaLvl = getWeaponUpgrade(weapon.id, 'area');
                                    const cdLvl = getWeaponUpgrade(weapon.id, 'cooldown');

                                    const isMastered = dmgLvl >= 5 && areaLvl >= 5 && cdLvl >= 5;
                                    const isPreviewing = previewWeapon === weapon.id;

                                    return (
                                        <div key={index} className={`p-4 rounded-xl border-2 transition-all flex flex-col h-full ${
                                            isMastered
                                            ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                                            : 'bg-slate-900/60 border-slate-800'
                                        }`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h3 className={`font-black text-xl tracking-widest uppercase flex items-center gap-2 ${isMastered ? 'text-amber-400' : 'text-slate-300'}`}>
                                                        {weapon.name} {isMastered && <CheckCircle2 className="w-5 h-5 text-amber-500" />}
                                                    </h3>
                                                    <p className="text-xs text-slate-400">{weapon.desc}</p>
                                                </div>
                                                {isMastered && (
                                                    <span className="text-[10px] font-bold text-amber-900 bg-amber-500 px-2 py-1 rounded">MASTERED</span>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between gap-2 mb-4 bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                                                <div className="flex flex-col items-center">
                                                    <Zap className={`w-4 h-4 mb-1 ${dmgLvl >= 5 ? 'text-amber-400' : 'text-slate-500'}`} />
                                                    <div className="text-[10px] text-slate-500 uppercase font-bold">Damage</div>
                                                    <div className="text-xs font-mono text-white">{dmgLvl}/5</div>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <Sparkles className={`w-4 h-4 mb-1 ${areaLvl >= 5 ? 'text-amber-400' : 'text-slate-500'}`} />
                                                    <div className="text-[10px] text-slate-500 uppercase font-bold">Area</div>
                                                    <div className="text-xs font-mono text-white">{areaLvl}/5</div>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <Timer className={`w-4 h-4 mb-1 ${cdLvl >= 5 ? 'text-amber-400' : 'text-slate-500'}`} />
                                                    <div className="text-[10px] text-slate-500 uppercase font-bold">Cooldown</div>
                                                    <div className="text-xs font-mono text-white">{cdLvl}/5</div>
                                                </div>
                                            </div>

                                            <div className="mb-4">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Mastery Effect</div>
                                                {isMastered ? (
                                                    <div className="text-sm font-bold text-amber-300 bg-amber-900/30 p-2 rounded border border-amber-500/30">
                                                        ✨ {weapon.masteryDesc?.replace('MASTERY: ', '') || 'Unlocks devastating potential.'}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm font-bold text-slate-600 bg-slate-950 p-2 rounded border border-slate-800 select-none blur-sm pointer-events-none opacity-50">
                                                        ✨ {weapon.masteryDesc?.replace('MASTERY: ', '') || 'Unlocks devastating potential.'}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-auto pt-2 border-t border-slate-800/50">
                                                <button
                                                    onClick={() => {
                                                        SoundManager.playUIClick();
                                                        setPreviewWeapon(isPreviewing ? null : weapon.id);
                                                    }}
                                                    className={`w-full py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                                                        isPreviewing
                                                        ? 'bg-slate-700 text-white'
                                                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                                                    }`}
                                                >
                                                    <Crosshair className="w-4 h-4" />
                                                    {isPreviewing ? 'Close Simulation' : 'Preview Mastery Form'}
                                                </button>

                                                {isPreviewing && (
                                                    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <WeaponSimulation weaponId={weapon.id} isMastered={true} />
                                                        <div className="text-[10px] text-slate-500 text-center mt-2 italic">
                                                            Previewing fully mastered potential.
                                                        </div>
                                                    </div>
                                                )}
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