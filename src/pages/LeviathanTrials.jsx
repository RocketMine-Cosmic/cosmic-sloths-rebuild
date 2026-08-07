import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Skull, ArrowLeft, Trophy, Zap, Shield, Swords, FastForward, Heart, Anchor } from 'lucide-react';
import { SaveManager } from '../game/SaveManager';
import { ENEMIES } from '../game/Constants';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';

const BOSS_MODIFIERS = [
    { id: 'fury', name: 'Leviathan\'s Fury', desc: 'Bosses deal +50% Damage', rewardDesc: '+500 Boss Gold Drop', icon: Swords, color: 'text-red-500' },
    { id: 'hide', name: 'Thick Hide', desc: 'Bosses have +100% HP', rewardDesc: '+50% Boss XP Drop', icon: Shield, color: 'text-slate-400' },
    { id: 'frenzy', name: 'Frenzy', desc: 'Bosses move 50% faster', rewardDesc: '+1 Relic Fragment on Boss Kill', icon: FastForward, color: 'text-yellow-500' },
    { id: 'bullet_hell', name: 'Bullet Hell', desc: 'Bosses fire twice as many projectiles', rewardDesc: '+2 Relic Fragments on Boss Kill', icon: Zap, color: 'text-cyan-400' },
    { id: 'regen', name: 'Cellular Regeneration', desc: 'Boss heals 1% Max HP every second', rewardDesc: '+800 Boss Gold Drop', icon: Heart, color: 'text-green-500' },
    { id: 'unstoppable', name: 'Unstoppable Force', desc: 'Boss ignores slow and pushback', rewardDesc: '+1000 Boss Gold Drop', icon: Anchor, color: 'text-orange-500' }
];

export default function LeviathanTrials({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(() => SaveManager.load());

    useEffect(() => {
        const handleSaveUpdated = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, []);

    const [modifiers, setModifiers] = useState(save.bossModifiers || {});

    const enemyKills = save.enemyKills || {};
    const bossIds = ENEMIES.filter(e => e.isBoss).map(e => e.id);
    const totalLeviathanKills = bossIds.reduce((sum, id) => sum + (enemyKills[id] || 0), 0);

    const toggleModifier = (id) => {
        SoundManager.playUIClick();
        const newMods = { ...modifiers, [id]: !modifiers[id] };
        setModifiers(newMods);
        const currentSave = SaveManager.load();
        currentSave.bossModifiers = newMods;
        SaveManager.save(currentSave);
        setSave(currentSave);
    };

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
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #EF4444, #DC2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }}>
                            <Skull className="w-6 h-6 md:w-8 md:h-8 text-red-500" /> COSMIC MUTATIONS
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">
                            Total Bosses Slain: <span className="text-red-400 font-bold">{totalLeviathanKills}</span>
                        </p>
                    </div>
                    <CurrencyHeader />
                </header>

                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                    <p className="text-slate-300 text-xs md:text-base">Toggle cosmic mutations on Boss encounters to increase your rewards.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4">
                        {BOSS_MODIFIERS.map(mod => {
                            const isActive = modifiers[mod.id];
                            const Icon = mod.icon;
                            return (
                                <motion.div
                                    key={mod.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => toggleModifier(mod.id)}
                                    className={`p-2.5 md:p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 md:gap-4 ${
                                        isActive 
                                        ? 'bg-red-950/50 backdrop-blur-xl border-red-400 shadow-[0_0_40px_rgba(239,68,68,0.4)]' 
                                        : 'bg-[#0b0416]/50 backdrop-blur-xl border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.15)] hover:border-red-400/60'
                                    }`}
                                >
                                    <div className={`p-2 md:p-3 rounded-lg bg-slate-950 border border-slate-800 ${isActive ? mod.color : 'text-slate-600'}`}>
                                        <Icon className="w-5 h-5 md:w-8 md:h-8" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`font-bold text-sm md:text-lg truncate ${isActive ? 'text-white' : 'text-slate-400'}`}>{mod.name}</h3>
                                        <p className="text-[10px] md:text-xs text-slate-500 mb-0.5 md:mb-1 truncate">{mod.desc}</p>
                                        <div className="text-[10px] md:text-xs font-bold text-green-400 flex items-center gap-1">
                                            <Trophy className="w-3 h-3 shrink-0" /> <span className="truncate">Reward: {mod.rewardDesc}</span>
                                        </div>
                                    </div>
                                    <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                        isActive ? 'border-red-500 bg-red-500' : 'border-slate-700 bg-slate-950'
                                    }`}>
                                        {isActive && <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full" />}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
        </OmenXGate>
    );
}