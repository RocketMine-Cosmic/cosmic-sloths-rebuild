import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ENEMIES, getEnemyMasteryMilestones } from '../game/Constants';
import { ENEMY_LORE } from '../game/Lore';
import { ArrowLeft, BookOpen, Skull, Shield, Zap, Activity, Swords, Star } from 'lucide-react';
import { SoundManager } from '../game/SoundManager';
import { SaveManager } from '../game/SaveManager';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';

function EnemySprite({ enemy, size = 64 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        const sprite = enemy.spriteImage;
        if (!sprite) return;

        let animationId;
        const draw = (time) => {
            if (sprite.complete && sprite.naturalWidth > 0) {
                const frameCount = enemy.frameCount || 16;
                const speed = enemy.animationSpeed || 0.15;
                const currentFrame = Math.floor(time / 1000 / speed) % frameCount;
                
                const cols = Math.ceil(Math.sqrt(frameCount));
                const rows = Math.ceil(frameCount / cols);
                const frameW = sprite.width / cols;
                const frameH = sprite.height / rows;
                
                const col = currentFrame % cols;
                const row = Math.floor(currentFrame / cols);
                
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(sprite, col * frameW, row * frameH, frameW, frameH, 0, 0, size, size);
            }
            animationId = requestAnimationFrame(draw);
        };

        if (sprite.complete) {
            animationId = requestAnimationFrame(draw);
        } else {
            sprite.onload = () => { animationId = requestAnimationFrame(draw); };
        }
        
        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [enemy, size]);

    return <canvas ref={canvasRef} width={size} height={size} className="object-contain" />;
}

export default function Bestiary({ isCarousel }) {
    const navigate = useNavigate();
    const [selectedTier, setSelectedTier] = useState('all');
    const [save, setSave] = useState(SaveManager.load());

    useEffect(() => {
        const handleSaveUpdated = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, []);
    const [selectedEnemy, setSelectedEnemy] = useState(null);

    const encountered = ENEMIES.map(e => e.id); // save.encounteredEnemies || [];
    const enemyKills = save.enemyKills || {};

    const tiers = ['all', ...Array.from(new Set(ENEMIES.map(e => e.isBoss ? 'boss' : `tier_${e.tier}`)))];

    const filteredEnemies = selectedTier === 'all'
        ? ENEMIES
        : ENEMIES.filter(e => selectedTier === 'boss' ? e.isBoss : `tier_${e.tier}` === selectedTier);

    const encounteredCount = ENEMIES.filter(e => encountered.includes(e.id)).length;

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto h-full flex flex-col">
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
                            <BookOpen className="w-6 h-6 md:w-8 md:h-8 text-rose-400" /> GALACTIC BESTIARY
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">
                            {encounteredCount} / {ENEMIES.length} encountered
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <CurrencyHeader />
                        <div className="text-right text-xs text-slate-500">
                            <div className="text-fuchsia-400 font-bold">⚡ Mastery Milestones</div>
                            <div>up to +10% DMG</div>
                        </div>
                    </div>
                </header>

                <div 
                    className="mb-4 shrink-0 overflow-x-auto"
                    onPointerDownCapture={e => e.stopPropagation()}
                    onTouchStartCapture={e => e.stopPropagation()}
                >
                    <div className="flex gap-2 pb-1">
                        {tiers.map(tier => (
                            <button
                                key={tier}
                                onClick={() => { SoundManager.playUIClick(); setSelectedTier(tier); }}
                                className={`px-3 py-1.5 rounded-lg font-bold text-xs md:text-sm whitespace-nowrap transition-colors shrink-0 ${
                                    selectedTier === tier
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                {tier === 'all' ? 'All Threats' : tier === 'boss' ? '👑 Leviathans' : `Tier ${tier.split('_')[1]}`}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredEnemies.map(enemy => {
                            const isEncountered = encountered.includes(enemy.id);
                            const kills = enemyKills[enemy.id] || 0;
                            const milestones = getEnemyMasteryMilestones(enemy);
                            const maxMastery = milestones[milestones.length - 1].kills;
                            const isFullyMastered = kills >= maxMastery;
                            const progress = Math.min(kills / maxMastery, 1);
                            const isSelected = selectedEnemy?.id === enemy.id;

                            let currentBonus = 0;
                            let nextMilestone = milestones[0];
                            for (let i = 0; i < milestones.length; i++) {
                                if (kills >= milestones[i].kills) {
                                    currentBonus = milestones[i].bonus;
                                    nextMilestone = milestones[i + 1] || null;
                                } else {
                                    nextMilestone = milestones[i];
                                    break;
                                }
                            }

                            return (
                                <motion.div
                                    key={enemy.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => { SoundManager.playUIClick(); setSelectedEnemy(isSelected ? null : enemy); }}
                                    className={`bg-[#0b0416]/60 backdrop-blur-xl rounded-xl p-4 border flex flex-col cursor-pointer transition-all ${
                                        !isEncountered ? 'opacity-40 grayscale border-slate-800' :
                                        isFullyMastered ? 'border-fuchsia-400 shadow-[0_0_40px_rgba(217,70,239,0.4)]' :
                                        enemy.isBoss ? 'border-rose-400/60 shadow-[0_0_30px_rgba(244,63,94,0.3)]' :
                                        'border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:border-cyan-300/60'
                                    }`}
                                >
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-slate-950 border border-slate-700">
                                            {isEncountered ? (
                                                <EnemySprite enemy={enemy} size={56} />
                                            ) : (
                                                <span className="text-2xl text-slate-600">?</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start gap-1">
                                                <h3 className="font-bold text-white text-sm leading-tight truncate">
                                                    {isEncountered ? enemy.name : 'Unknown Threat'}
                                                </h3>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {isFullyMastered && <Star className="w-3 h-3 text-fuchsia-400 fill-fuchsia-400" />}
                                                    {enemy.isBoss ? (
                                                        <span className="text-[9px] bg-rose-950 text-rose-400 px-1 py-0.5 rounded border border-rose-900 font-bold">BOSS</span>
                                                    ) : (
                                                        <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded border border-slate-700 font-bold">T{enemy.tier}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-0.5 flex gap-2">
                                                {isEncountered && enemy.isTank && <span className="text-amber-400">Tank</span>}
                                                {isEncountered && enemy.isRanged && <span className="text-cyan-400">Ranged</span>}
                                                {isFullyMastered && <span className="text-fuchsia-400 font-bold">MASTERED</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {isEncountered && (
                                        <>
                                            <div className="grid grid-cols-2 gap-1.5 mb-3">
                                                <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50 flex items-center gap-1.5">
                                                    <Activity className="w-3 h-3 text-emerald-400 shrink-0" />
                                                    <div>
                                                        <div className="text-[9px] text-slate-500 font-bold">HP</div>
                                                        <div className="text-xs text-white font-mono">{enemy.hp.toLocaleString()}</div>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50 flex items-center gap-1.5">
                                                    <Skull className="w-3 h-3 text-rose-400 shrink-0" />
                                                    <div>
                                                        <div className="text-[9px] text-slate-500 font-bold">DMG</div>
                                                        <div className="text-xs text-white font-mono">{enemy.damage}</div>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50 flex items-center gap-1.5">
                                                    <Zap className="w-3 h-3 text-yellow-400 shrink-0" />
                                                    <div>
                                                        <div className="text-[9px] text-slate-500 font-bold">Speed</div>
                                                        <div className="text-xs text-white font-mono">{enemy.speed}</div>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50 flex items-center gap-1.5">
                                                    <Swords className="w-3 h-3 text-blue-400 shrink-0" />
                                                    <div>
                                                        <div className="text-[9px] text-slate-500 font-bold">Kills</div>
                                                        <div className="text-xs text-white font-mono">{kills.toLocaleString()}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Mastery Progress */}
                                            <div className="mb-3">
                                                <div className="flex justify-between items-end text-[10px] font-bold mb-1">
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-500">Mastery {currentBonus > 0 && <span className="text-fuchsia-400">+{currentBonus}% DMG</span>}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        {isFullyMastered ? (
                                                            <span className="text-fuchsia-400">MAXED</span>
                                                        ) : (
                                                            <span className="text-slate-400">Next: {kills.toLocaleString()} / {nextMilestone?.kills?.toLocaleString() || '???'}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex relative">
                                                    <div
                                                        className={`absolute top-0 left-0 h-full transition-all ${isFullyMastered ? 'bg-fuchsia-500' : 'bg-fuchsia-600/50'}`}
                                                        style={{ width: `${progress * 100}%`, zIndex: 5 }}
                                                    />
                                                    {/* Milestone markers */}
                                                    {milestones.map((m, i) => (
                                                        <div 
                                                            key={i}
                                                            className={`absolute top-0 h-full w-0.5 bg-slate-950 ${kills >= m.kills ? 'opacity-50' : 'opacity-100'}`}
                                                            style={{ left: `${(m.kills / maxMastery) * 100}%`, zIndex: 10 }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Lore - shown when selected */}
                                            {isSelected && ENEMY_LORE[enemy.id] && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    className="text-[11px] text-slate-400 italic border-t border-slate-800 pt-2 leading-relaxed"
                                                >
                                                    "{ENEMY_LORE[enemy.id]}"
                                                </motion.div>
                                            )}
                                            {!isSelected && (
                                                <div className="text-[10px] text-slate-600 text-center">tap for lore</div>
                                            )}
                                        </>
                                    )}
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