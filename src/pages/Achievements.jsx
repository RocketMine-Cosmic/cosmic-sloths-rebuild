import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Trophy, Clock, Skull, Users, Star, Coins, ArrowUpCircle } from 'lucide-react';
import { SaveManager } from '../game/SaveManager';
import { CHARACTERS } from '../game/Constants';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';

export default function Achievements() {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());

    useEffect(() => {
        const handleSaveUpdated = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, []);

    const totalKills = save.totalKills || 0;
    const maxTimeSurvived = save.maxTimeSurvived || 0;
    const unlockedCharactersCount = save.unlockedCharacters?.length || 0;
    const totalCharacters = CHARACTERS.length;
    const totalGoldEarned = save.totalGoldEarned || 0;
    const maxLevelReached = save.maxLevelReached || 0;
    const totalUnlockedCosmetics = save.unlockedCosmetics?.length || 0;
    // Count talents across permanent/weekly/seasonal containers (current schema)
    // plus the legacy `unlockedTalents` field. Each container is { charId: [talentIds] }
    // with a `weekId`/`seasonId` key we must skip. Dedupe by `${charId}:${talentId}` so
    // the same talent picked in two periods doesn't double-count. (Texxy bug 2026-05-07:
    // talents_15 / talents_30 achievements never firing because they only read the
    // empty legacy field.)
    const totalUnlockedTalents = (() => {
        const keys = new Set();
        const add = (container, skipKey) => {
            if (!container || typeof container !== 'object') return;
            for (const charId of Object.keys(container)) {
                if (charId === skipKey) continue;
                const arr = container[charId];
                if (Array.isArray(arr)) arr.forEach(t => keys.add(`${charId}:${t}`));
            }
        };
        add(save.permanentTalents, null);
        add(save.weeklyTalents, 'weekId');
        add(save.seasonalTalents, 'seasonId');
        add(save.unlockedTalents, null); // legacy fallback
        return keys.size;
    })();

    const achievements = [
        // Survival
        { id: 'survive_3', category: 'survival', title: 'Survivor', desc: 'Survive for 3 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 180), target: 180, isUnlocked: maxTimeSurvived >= 180, points: 10, color: 'text-blue-400', bg: 'bg-blue-900/50', border: 'border-blue-500' },
        { id: 'survive_4', category: 'survival', title: 'Veteran', desc: 'Survive for 4 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 240), target: 240, isUnlocked: maxTimeSurvived >= 240, points: 20, color: 'text-purple-400', bg: 'bg-purple-900/50', border: 'border-purple-500' },
        { id: 'survive_5', category: 'survival', title: 'Master', desc: 'Survive for 5 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 300), target: 300, isUnlocked: maxTimeSurvived >= 300, points: 50, color: 'text-pink-400', bg: 'bg-pink-900/50', border: 'border-pink-500' },
        { id: 'survive_6', category: 'survival', title: 'Cosmic Legend', desc: 'Survive for 6 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 360), target: 360, isUnlocked: maxTimeSurvived >= 360, points: 100, color: 'text-rose-400', bg: 'bg-rose-900/50', border: 'border-rose-500' },
        { id: 'survive_7', category: 'survival', title: 'Time Lord', desc: 'Survive for 7 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 420), target: 420, isUnlocked: maxTimeSurvived >= 420, points: 200, color: 'text-fuchsia-400', bg: 'bg-fuchsia-900/50', border: 'border-fuchsia-500' },
        { id: 'survive_8', category: 'survival', title: 'Eternal', desc: 'Survive for 8 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 480), target: 480, isUnlocked: maxTimeSurvived >= 480, points: 300, color: 'text-indigo-400', bg: 'bg-indigo-900/50', border: 'border-indigo-500' },
        { id: 'survive_10', category: 'survival', title: 'Immortal Sloth', desc: 'Survive for 10 minutes in a single run.', icon: <Clock className="w-6 h-6" />, progress: Math.min(maxTimeSurvived, 600), target: 600, isUnlocked: maxTimeSurvived >= 600, points: 500, color: 'text-cyan-400', bg: 'bg-cyan-900/50', border: 'border-cyan-500' },

        // Combat
        { id: 'kills_100', category: 'combat', title: 'First Blood', desc: 'Defeat 100 enemies across all runs.', icon: <Skull className="w-6 h-6" />, progress: Math.min(totalKills, 100), target: 100, isUnlocked: totalKills >= 100, points: 10, color: 'text-red-400', bg: 'bg-red-900/50', border: 'border-red-500' },
        { id: 'kills_1000', category: 'combat', title: 'Exterminator', desc: 'Defeat 1,000 enemies across all runs.', icon: <Skull className="w-6 h-6" />, progress: Math.min(totalKills, 1000), target: 1000, isUnlocked: totalKills >= 1000, points: 20, color: 'text-orange-400', bg: 'bg-orange-900/50', border: 'border-orange-500' },
        { id: 'kills_10000', category: 'combat', title: 'Cosmic Destroyer', desc: 'Defeat 10,000 enemies across all runs.', icon: <Skull className="w-6 h-6" />, progress: Math.min(totalKills, 10000), target: 10000, isUnlocked: totalKills >= 10000, points: 50, color: 'text-amber-400', bg: 'bg-amber-900/50', border: 'border-amber-500' },
        { id: 'kills_50000', category: 'combat', title: 'Genocidal Sloth', desc: 'Defeat 50,000 enemies across all runs.', icon: <Skull className="w-6 h-6" />, progress: Math.min(totalKills, 50000), target: 50000, isUnlocked: totalKills >= 50000, points: 100, color: 'text-yellow-400', bg: 'bg-yellow-900/50', border: 'border-yellow-500' },
        { id: 'kills_100000', category: 'combat', title: 'Sloth God', desc: 'Defeat 100,000 enemies across all runs.', icon: <Skull className="w-6 h-6" />, progress: Math.min(totalKills, 100000), target: 100000, isUnlocked: totalKills >= 100000, points: 200, color: 'text-red-600', bg: 'bg-red-900/50', border: 'border-red-600' },
        { id: 'kills_250000', category: 'combat', title: 'Bringer of Extinction', desc: 'Defeat 250,000 enemies across all runs.', icon: <Skull className="w-6 h-6" />, progress: Math.min(totalKills, 250000), target: 250000, isUnlocked: totalKills >= 250000, points: 500, color: 'text-purple-600', bg: 'bg-purple-900/50', border: 'border-purple-600' },

        // Wealth
        { id: 'gold_10k', category: 'wealth', title: 'Pocket Change', desc: 'Earn 10,000 Gold across all runs.', icon: <Coins className="w-6 h-6" />, progress: Math.min(totalGoldEarned, 10000), target: 10000, isUnlocked: totalGoldEarned >= 10000, points: 20, color: 'text-yellow-300', bg: 'bg-yellow-900/50', border: 'border-yellow-400' },
        { id: 'gold_100k', category: 'wealth', title: 'Filthy Rich', desc: 'Earn 100,000 Gold across all runs.', icon: <Coins className="w-6 h-6" />, progress: Math.min(totalGoldEarned, 100000), target: 100000, isUnlocked: totalGoldEarned >= 100000, points: 50, color: 'text-yellow-400', bg: 'bg-yellow-900/50', border: 'border-yellow-500' },
        { id: 'gold_1m', category: 'wealth', title: 'Billionaire', desc: 'Earn 1,000,000 Gold across all runs.', icon: <Coins className="w-6 h-6" />, progress: Math.min(totalGoldEarned, 1000000), target: 1000000, isUnlocked: totalGoldEarned >= 1000000, points: 200, color: 'text-yellow-500', bg: 'bg-yellow-900/50', border: 'border-yellow-600' },
        { id: 'gold_5m', category: 'wealth', title: 'Sloth of Wall Street', desc: 'Earn 5,000,000 Gold across all runs.', icon: <Coins className="w-6 h-6" />, progress: Math.min(totalGoldEarned, 5000000), target: 5000000, isUnlocked: totalGoldEarned >= 5000000, points: 500, color: 'text-amber-500', bg: 'bg-amber-900/50', border: 'border-amber-600' },

        // Progression
        { id: 'level_10', category: 'progression', title: 'Power Up', desc: 'Reach Level 10 in a single run.', icon: <ArrowUpCircle className="w-6 h-6" />, progress: Math.min(maxLevelReached, 10), target: 10, isUnlocked: maxLevelReached >= 10, points: 30, color: 'text-green-400', bg: 'bg-green-900/50', border: 'border-green-500' },
        { id: 'level_20', category: 'progression', title: 'Ascended', desc: 'Reach Level 20 in a single run.', icon: <ArrowUpCircle className="w-6 h-6" />, progress: Math.min(maxLevelReached, 20), target: 20, isUnlocked: maxLevelReached >= 20, points: 100, color: 'text-teal-400', bg: 'bg-teal-900/50', border: 'border-teal-500' },
        { id: 'level_30', category: 'progression', title: 'Beyond Limits', desc: 'Reach Level 30 in a single run.', icon: <ArrowUpCircle className="w-6 h-6" />, progress: Math.min(maxLevelReached, 30), target: 30, isUnlocked: maxLevelReached >= 30, points: 200, color: 'text-cyan-400', bg: 'bg-cyan-900/50', border: 'border-cyan-500' },
        { id: 'level_40', category: 'progression', title: 'God Tier', desc: 'Reach Level 40 in a single run.', icon: <ArrowUpCircle className="w-6 h-6" />, progress: Math.min(maxLevelReached, 40), target: 40, isUnlocked: maxLevelReached >= 40, points: 400, color: 'text-blue-400', bg: 'bg-blue-900/50', border: 'border-blue-500' },
        { id: 'level_50', category: 'progression', title: 'Maximum Overdrive', desc: 'Reach Level 50 in a single run.', icon: <ArrowUpCircle className="w-6 h-6" />, progress: Math.min(maxLevelReached, 50), target: 50, isUnlocked: maxLevelReached >= 50, points: 600, color: 'text-indigo-400', bg: 'bg-indigo-900/50', border: 'border-indigo-500' },
        
        { id: 'unlock_half', category: 'progression', title: 'Growing Crew', desc: `Unlock ${Math.floor(totalCharacters / 2)} characters.`, icon: <Users className="w-6 h-6" />, progress: Math.min(unlockedCharactersCount, Math.floor(totalCharacters / 2)), target: Math.floor(totalCharacters / 2), isUnlocked: unlockedCharactersCount >= Math.floor(totalCharacters / 2), points: 50, color: 'text-emerald-400', bg: 'bg-emerald-900/50', border: 'border-emerald-500' },
        { id: 'unlock_all', category: 'progression', title: 'Completionist', desc: 'Unlock all characters.', icon: <Users className="w-6 h-6" />, progress: Math.min(unlockedCharactersCount, totalCharacters), target: totalCharacters, isUnlocked: unlockedCharactersCount >= totalCharacters, points: 150, color: 'text-emerald-500', bg: 'bg-emerald-900/50', border: 'border-emerald-600' },
        { id: 'cosmetics_all', category: 'progression', title: 'Fashionista', desc: 'Unlock all 6 cosmetic trails.', icon: <Star className="w-6 h-6" />, progress: Math.min(totalUnlockedCosmetics, 6), target: 6, isUnlocked: totalUnlockedCosmetics >= 6, points: 100, color: 'text-pink-400', bg: 'bg-pink-900/50', border: 'border-pink-500' },
        { id: 'talents_15', category: 'progression', title: 'Skillful', desc: 'Unlock 15 character talents.', icon: <Star className="w-6 h-6" />, progress: Math.min(totalUnlockedTalents, 15), target: 15, isUnlocked: totalUnlockedTalents >= 15, points: 50, color: 'text-violet-400', bg: 'bg-violet-900/50', border: 'border-violet-500' },
        { id: 'talents_30', category: 'progression', title: 'Omniscient', desc: 'Unlock 30 character talents.', icon: <Star className="w-6 h-6" />, progress: Math.min(totalUnlockedTalents, 30), target: 30, isUnlocked: totalUnlockedTalents >= 30, points: 150, color: 'text-purple-400', bg: 'bg-purple-900/50', border: 'border-purple-500' }
    ];

    const [activeTab, setActiveTab] = useState('all');

    const filteredAchievements = activeTab === 'all' 
        ? achievements 
        : achievements.filter(a => a.category === activeTab);

    const totalPoints = achievements.reduce((acc, ach) => acc + (ach.isUnlocked ? ach.points : 0), 0);
    const maxPoints = achievements.reduce((acc, ach) => acc + ach.points, 0);

    const formatProgress = (val, target, isTime) => {
        if (isTime) {
            const m1 = Math.floor(val / 60);
            const s1 = val % 60;
            const m2 = Math.floor(target / 60);
            return `${m1}:${s1.toString().padStart(2, '0')} / ${m2}:00`;
        }
        return `${val.toLocaleString()} / ${target.toLocaleString()}`;
    };

    return (
        <div className="min-h-screen relative text-slate-200 p-4 md:p-8 font-sans overflow-hidden">
            <SpaceBackground />

            <div className="max-w-4xl mx-auto relative z-10">
                <button 
                    onClick={() => navigate('/')}
                    className="mb-8 flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors font-bold"
                >
                    <ArrowLeft size={20} /> Back to Main Menu
                </button>

                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-[#0b0416]/60 backdrop-blur-xl border border-orange-500/30 rounded-2xl p-6 md:p-10 shadow-[0_0_50px_rgba(249,115,22,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]"
                >
                    <div className="flex flex-col items-end mb-4"><CurrencyHeader /></div>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-6">
                        <div className="flex items-center gap-4">
                            <Trophy className="w-10 h-10 text-yellow-400" />
                            <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                                ACHIEVEMENTS
                            </h1>
                        </div>
                        <div className="bg-slate-950 px-6 py-3 rounded-xl border border-slate-700 shadow-inner text-center w-full md:w-64">
                            <div className="text-sm text-slate-400 font-bold mb-1">ACHIEVEMENT POINTS</div>
                            <div className="text-2xl md:text-3xl font-black text-cyan-400">
                                {totalPoints} <span className="text-lg text-slate-500">/ {maxPoints}</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-cyan-400" style={{ width: `${(totalPoints / maxPoints) * 100}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
                        {['all', 'survival', 'combat', 'wealth', 'progression'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-lg font-bold text-sm md:text-base capitalize transition-all ${
                                    activeTab === tab ? 'bg-yellow-500 text-slate-900 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredAchievements.map((ach) => (
                            <div 
                                key={ach.id} 
                                className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${
                                    ach.isUnlocked ? `${ach.bg} ${ach.border} shadow-[0_0_15px_rgba(0,0,0,0.5)]` : 'bg-slate-800 border-slate-700 opacity-60 grayscale'
                                }`}
                            >
                                <div className={`p-3 rounded-full ${ach.isUnlocked ? ach.color : 'text-slate-500'} bg-slate-950`}>
                                    {ach.icon}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className={`font-bold text-lg ${ach.isUnlocked ? 'text-white' : 'text-slate-400'}`}>
                                            {ach.title}
                                        </h3>
                                        <span className={`font-bold text-sm px-2 py-0.5 rounded ${ach.isUnlocked ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-500'}`}>
                                            {ach.points} pts
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-400 mb-2">{ach.desc}</p>
                                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full ${ach.isUnlocked ? 'bg-yellow-400' : 'bg-slate-600'}`}
                                            style={{ width: `${(ach.progress / ach.target) * 100}%` }}
                                        />
                                    </div>
                                    <div className="text-xs text-right mt-1 text-slate-500 font-bold">
                                        {formatProgress(ach.progress, ach.target, ach.id.startsWith('survive'))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}