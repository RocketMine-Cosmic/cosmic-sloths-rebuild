import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { maskWallet } from '@/lib/maskWallet';
import { getOmenXUser, updateOmenXUser } from '@/lib/omenxUser';
import { Pencil, Check, X, ArrowLeft, Trophy, Crosshair, Users, Gift, Hexagon, BookOpen } from 'lucide-react';
import EmojiPicker, { PILOT_ICONS } from '../components/game/EmojiPicker';
import { SoundManager } from '../game/SoundManager';
import { SaveManager } from '../game/SaveManager';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import { useOmenXVip } from '@/hooks/useOmenXVip';
import moment from 'moment';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import OmenXAuthButton from '../components/game/OmenXAuthButton';
import OmenXGate from '../components/game/OmenXGate';
import RefreshOmenXDataButton from '../components/game/RefreshOmenXDataButton';
import { refreshVipLevel, getVipCooldownEnd, ensureVipFetched } from '@/lib/playerDataCache';
import { getTitleStyle } from '@/lib/playerTitles';


export default function Profile({ isCarousel }) {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState('');
    const [stats, setStats] = useState({
        highestScoreNormal: 0,
        highestScoreEndless: 0,
        totalKills: 0,
        leviathanKills: 0,
        globalRaidDamage: 0,
    });
    const [squad, setSquad] = useState(null);
    const [rewardsHistory, setRewardsHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showIconPicker, setShowIconPicker] = useState(false);
    const { vip: vipLevel } = useOmenXVip();
    const { user: omenxUser } = useOmenXUser();

    // Lazy-fetch VIP level only when this page mounts (deferred from boot)
    useEffect(() => { ensureVipFetched(); }, []);

    useEffect(() => {
        if (!omenxUser) {
            setLoading(false);
            return;
        }

        (async () => {
            try {
                setUser(omenxUser);
                const displayName = omenxUser?.player_name || omenxUser?.data?.player_name || omenxUser?.full_name || 'Anonymous';
                setNewName(displayName);

                if (omenxUser && omenxUser.walletAddress) {
                     // Fetch best scores — endless and normal — separately. 5min cache to avoid round-trips.
                     const SCORE_CACHE_KEY = `profile_top_scores_${omenxUser.walletAddress}`;
                     const SCORE_CACHE_TTL = 5 * 60 * 1000;
                     let maxNormal = 0, maxEndless = 0;
                     const fetchTopScores = async () => {
                         const [endlessTop, allTop] = await Promise.all([
                             base44.entities.RunScore.filter({ wallet_address: omenxUser.walletAddress, arena_id: 'endless' }, '-score', 1),
                             base44.entities.RunScore.filter({ wallet_address: omenxUser.walletAddress }, '-score', 20),
                         ]);
                         const endless = endlessTop.length > 0 ? endlessTop[0].score : 0;
                         const normalRow = allTop.find(r => r.arena_id !== 'endless');
                         const normal = normalRow ? normalRow.score : 0;
                         return { normal, endless };
                     };
                     try {
                         const cached = JSON.parse(localStorage.getItem(SCORE_CACHE_KEY));
                         if (cached && Date.now() - cached.ts < SCORE_CACHE_TTL) {
                             maxNormal = cached.normal || 0;
                             maxEndless = cached.endless || 0;
                         } else {
                             const res = await fetchTopScores();
                             maxNormal = res.normal; maxEndless = res.endless;
                             localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify({ normal: maxNormal, endless: maxEndless, ts: Date.now() }));
                         }
                     } catch {
                         const res = await fetchTopScores();
                         maxNormal = res.normal; maxEndless = res.endless;
                     }
                     const save = SaveManager.load();
                     const enemyKills = save.enemyKills || {};
                     const totalLeviathans = Object.keys(enemyKills)
                         .filter(id => id.startsWith('boss_') || id === 'world_boss')
                         .reduce((sum, id) => sum + (enemyKills[id] || 0), 0);
                     setStats({
                         highestScoreNormal: maxNormal,
                         highestScoreEndless: maxEndless,
                         totalKills: save.totalKills || 0,
                         leviathanKills: totalLeviathans,
                         globalRaidDamage: 0
                     });
                     // Fetch rewards in parallel (no dependency on score)
                     base44.entities.PayoutLog.filter({ player_name: displayName }, '-period_id', 50)
                         .then(rewards => setRewardsHistory(rewards))
                         .catch(() => {});
                     // Fetch squad membership in parallel
                     base44.entities.SquadMember.filter({ wallet_address: omenxUser.walletAddress })
                         .then(async (memberships) => {
                             if (memberships.length > 0) {
                                 try {
                                     const squadData = await base44.entities.Squad.get(memberships[0].squad_id);
                                     setSquad(squadData);
                                 } catch {}
                             } else {
                                 setSquad(null);
                             }
                         })
                         .catch(() => {});
                 }
                setLoading(false);
            } catch (e) {
                console.error('Failed to fetch profile data', e);
                setLoading(false);
            }
        })();

        const handleSaveUpdated = () => {
            setUser(prev => ({ ...prev }));
        };
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, [omenxUser]);

    // Profile edits (Option A, 2026-05-08): single writer is updateOmenXUser →
    // SaveManager.save → syncSave. Server-side mirrorProfileFanOut automation
    // handles propagation to RunScore / SquadMember / SquadMessage. No more
    // syncProfileName call, no more retry loops, no more pending-sync flags.
    const handleSaveIcon = async (icon) => {
        await updateOmenXUser({ pilot_icon: icon });
        setUser(prev => ({ ...prev, pilot_icon: icon, data: { ...prev?.data, pilot_icon: icon } }));
    };

    const handleSaveName = async () => {
        if (!newName.trim()) return;
        const updatedName = newName.trim();
        await updateOmenXUser({ player_name: updatedName });
        setUser(prev => ({ ...prev, player_name: updatedName, data: { ...prev?.data, player_name: updatedName } }));
        setIsEditingName(false);
    };



    const getVipTierName = (level) => {
        const tiers = ['Bronze 1', 'Bronze 2', 'Silver 1', 'Silver 2', 'Silver 3', 'Gold 1', 'Gold 2', 'Platinum 1', 'Platinum 2', 'Platinum 3', 'Diamond 1', 'Diamond 2', 'Diamond 3', 'Diamond 4'];
        return tiers[level - 1] || `Level ${level}`;
    };

    const getVipTierColor = (level) => {
        if (level <= 2) return { text: 'text-amber-700', border: 'border-amber-600/50', bg: 'bg-amber-950/40', shadow: 'shadow-[0_0_20px_rgba(180,83,9,0.2)]' };
        if (level <= 5) return { text: 'text-slate-300', border: 'border-slate-400/50', bg: 'bg-slate-800/40', shadow: 'shadow-[0_0_20px_rgba(148,163,184,0.2)]' };
        if (level <= 7) return { text: 'text-yellow-400', border: 'border-yellow-600/50', bg: 'bg-yellow-950/40', shadow: 'shadow-[0_0_20px_rgba(234,179,8,0.2)]' };
        if (level <= 10) return { text: 'text-cyan-300', border: 'border-cyan-500/50', bg: 'bg-cyan-950/40', shadow: 'shadow-[0_0_20px_rgba(6,182,212,0.2)]' };
        return { text: 'text-blue-300', border: 'border-blue-400/50', bg: 'bg-blue-950/40', shadow: 'shadow-[0_0_20px_rgba(96,165,250,0.25)]' };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'h-full flex flex-col' : 'h-[100dvh] flex flex-col'} relative text-slate-200 p-2 pb-2 md:p-6 font-sans overflow-hidden`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0 relative z-10">
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
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #0CA7B8, #06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(6,182,212,0.5))' }}>
                            PILOT PROFILE
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">View your career and statistics.</p>
                    </div>
                    <CurrencyHeader />
                </header>

                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="space-y-4 md:space-y-6 flex-1 overflow-y-auto pr-1 pb-10"
                >
                    {/* Header / Name Edit */}
                    <div className="relative z-20 bg-[#0b0416]/60 backdrop-blur-xl border border-cyan-500/30 rounded-xl md:rounded-2xl p-4 md:p-8 shadow-[0_0_30px_rgba(6,182,212,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="relative shrink-0">
                                <button
                                    onClick={() => setShowIconPicker(v => !v)}
                                    className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-800 border-2 border-cyan-500 flex items-center justify-center text-xl md:text-2xl hover:border-cyan-300 transition-colors overflow-hidden"
                                    title="Change pilot icon"
                                >
                                    {(() => {
                                        const icon = user?.data?.pilot_icon || user?.pilot_icon || '🦥';
                                        return icon.startsWith('http') ? <img src={icon} className="w-full h-full object-cover" alt="pilot" /> : icon;
                                    })()}
                                </button>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-cyan-600 rounded-full flex items-center justify-center pointer-events-none">
                                    <Pencil size={10} className="text-white" />
                                </div>
                                {showIconPicker && (
                                    <EmojiPicker
                                        options={PILOT_ICONS}
                                        selected={user?.data?.pilot_icon || user?.pilot_icon || '🦥'}
                                        onSelect={handleSaveIcon}
                                        onClose={() => setShowIconPicker(false)}
                                    />
                                )}
                            </div>
                            <div>
                                <h1 className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Pilot Identity</h1>
                                {isEditingName ? (
                                    <div className="flex items-center gap-1.5 md:gap-2">
                                    <input 
                                        type="text" 
                                        value={newName} 
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="bg-slate-950 text-white px-2 md:px-3 py-1 md:py-1.5 rounded-lg border border-cyan-500 outline-none text-base md:text-xl w-40 md:w-64 focus:shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                                    />
                                    <button onClick={handleSaveName} className="p-2 bg-green-900/30 text-green-400 hover:bg-green-900/50 rounded-lg transition-colors border border-green-500/30">
                                        <Check size={20} />
                                    </button>
                                    <button onClick={() => { setIsEditingName(false); setNewName(user?.player_name || user?.data?.player_name || user?.full_name || ''); }} className="p-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg transition-colors border border-red-500/30">
                                        <X size={20} />
                                    </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl md:text-3xl font-bold text-white">{user?.player_name || user?.data?.player_name || user?.full_name || 'Anonymous'}</span>
                                            <button onClick={() => setIsEditingName(true)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-md transition-colors border border-slate-700 hover:border-slate-500">
                                                <Pencil size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    {user?.data?.player_title ? (() => {
                                        const st = getTitleStyle(user.data.player_title);
                                        return (
                                            <span className={`text-[10px] ${st.bg} ${st.text} px-2 py-0.5 rounded border ${st.border} tracking-wider font-bold`}>
                                                {user.data.player_title}
                                            </span>
                                        );
                                    })() : (
                                        <span className="text-[10px] text-slate-500 italic">No Title Equipped</span>
                                    )}
                                    <button
                                        onClick={() => { SoundManager.playUIClick(); navigate('/?slide=15'); }}
                                        className="flex items-center gap-1 text-[10px] bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded border border-amber-700/50 hover:border-amber-500 tracking-wider font-bold transition-colors"
                                    >
                                        <Pencil size={10} /> Manage Titles
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="text-center md:text-right flex flex-col items-center md:items-end gap-2">
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Joined</div>
                                <div className="text-sm text-slate-300">{moment(user?.created_date).format('MMMM Do YYYY')}</div>
                            </div>
                            <RefreshOmenXDataButton
                                label="Refresh VIP"
                                title="Refresh VIP level from OmenX"
                                onRefresh={refreshVipLevel}
                                getCooldownEnd={getVipCooldownEnd}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        {/* Career Stats */}
                        <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-cyan-500/30 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-[0_0_30px_rgba(6,182,212,0.15)] flex flex-col justify-center">
                            <h2 className="text-lg md:text-xl font-bold text-cyan-400 mb-4 md:mb-6 flex items-center gap-2">
                                <Trophy className="w-5 h-5" /> Career Highlights
                            </h2>
                            <div className="space-y-3 md:space-y-6">
                                <div className="bg-slate-800/50 rounded-xl p-3 md:p-4 border border-slate-700/50 flex items-center gap-3 md:gap-4">
                                    <div className="p-3 bg-orange-900/30 rounded-lg text-orange-400 border border-orange-500/30">
                                        <Crosshair className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-sm text-slate-400 font-bold mb-1">Total Enemies Defeated</div>
                                        <div className="text-2xl font-mono font-bold text-white">{stats.totalKills.toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-3 md:p-4 border border-slate-700/50 flex items-center gap-3 md:gap-4">
                                    <div className="p-3 bg-cyan-900/30 rounded-lg text-cyan-400 border border-cyan-500/30">
                                        <Trophy className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-xs md:text-sm text-slate-400 font-bold mb-0.5 md:mb-1">Highest Score — Sectors</div>
                                        <div className="text-xl md:text-2xl font-mono font-bold text-white">{stats.highestScoreNormal.toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="bg-slate-800/50 rounded-xl p-3 md:p-4 border border-slate-700/50 flex items-center gap-3 md:gap-4">
                                    <div className="p-3 bg-fuchsia-900/30 rounded-lg text-fuchsia-400 border border-fuchsia-500/30">
                                        <Trophy className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-xs md:text-sm text-slate-400 font-bold mb-0.5 md:mb-1">Highest Score — Endless</div>
                                        <div className="text-xl md:text-2xl font-mono font-bold text-white">{stats.highestScoreEndless.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Squad Affiliation */}
                        <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-orange-500/30 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-[0_0_30px_rgba(249,115,22,0.15)]">
                            <h2 className="text-lg md:text-xl font-bold text-orange-400 mb-4 md:mb-6 flex items-center gap-2">
                                <Users className="w-5 h-5" /> Squad Affiliation
                            </h2>
                            {squad ? (
                                <div className="bg-slate-800/50 rounded-xl p-4 md:p-5 border border-orange-500/30 text-center">
                                    <div className="text-3xl md:text-4xl mb-2 md:mb-3 h-10 md:h-12 flex items-center justify-center">
                                        {(squad.icon || '🛡️').startsWith('http') ? <img src={squad.icon} className="h-full aspect-square rounded-md object-cover" alt="squad" /> : (squad.icon || '🛡️')}
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-bold text-white mb-1">{squad.name}</h3>
                                    <div className="text-xs md:text-sm font-bold text-orange-400 bg-orange-950/50 px-2 py-1 rounded inline-block border border-orange-900 mb-2 md:mb-3">
                                        [{squad.tag}]
                                    </div>
                                    <p className="text-slate-400 text-xs md:text-sm mb-3 md:mb-4">{squad.description}</p>
                                    <button 
                                        onClick={() => { SoundManager.playUIClick(); navigate('/?slide=5'); }}
                                        className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors w-full"
                                    >
                                        View Squad
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-slate-800/30 rounded-xl p-4 md:p-6 border border-slate-700/50 text-center h-[180px] md:h-[240px] flex flex-col items-center justify-center">
                                    <Users className="w-10 h-10 md:w-12 md:h-12 text-slate-600 mb-2 md:mb-3" />
                                    <div className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4">You are not currently in a squad.</div>
                                    <button 
                                        onClick={() => { SoundManager.playUIClick(); navigate('/?slide=5'); }}
                                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                                    >
                                        Find a Squad
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>



                    {/* VIP Status */}
                    <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-yellow-500/40 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
                        <h2 className="text-lg md:text-xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
                            ⭐ VIP Status
                        </h2>
                        {vipLevel > 0 ? (
                            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-8">
                                <div className={`flex flex-col items-center justify-center ${getVipTierColor(vipLevel).bg} border ${getVipTierColor(vipLevel).border} rounded-xl px-8 py-4 ${getVipTierColor(vipLevel).shadow} shrink-0`}>
                                    <div className={`text-3xl md:text-4xl font-black font-mono ${getVipTierColor(vipLevel).text}`}>{getVipTierName(vipLevel)}</div>
                                    <div className={`text-xs font-bold uppercase tracking-widest mt-1 ${getVipTierColor(vipLevel).text} opacity-60`}>VIP Tier</div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <p className="text-slate-400 text-sm mb-3">Your VIP level grants permanent in-game bonuses applied to every run:</p>
                                    <div className="bg-slate-800/60 rounded-lg p-3 border border-yellow-900/50 flex items-center gap-3">
                                        <span className="text-2xl">⚡</span>
                                        <div>
                                            <div className="font-bold text-white text-sm">Damage Boost</div>
                                            <div className="text-yellow-400 font-mono font-bold">+{vipLevel}% flat damage multiplier</div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-800/60 rounded-lg p-3 border border-yellow-900/50 flex items-center gap-3">
                                        <span className="text-2xl">❤️</span>
                                        <div>
                                            <div className="font-bold text-white text-sm">HP Boost</div>
                                            <div className="text-yellow-400 font-mono font-bold">+{vipLevel}% flat max HP bonus</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-4 text-slate-500 text-sm">
                                No VIP level detected. Earn VIP status on OmenX to unlock in-game bonuses.
                            </div>
                        )}
                    </div>

                    {/* Replay Welcome Tour */}
                    <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-slate-700/50 rounded-xl md:rounded-2xl p-3 md:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            <BookOpen className="w-5 h-5 text-cyan-400 shrink-0" />
                            <div>
                                <div className="font-bold text-white text-sm">Welcome Tour</div>
                                <div className="text-xs text-slate-400">Replay the new-player intro modal.</div>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                SoundManager.playUIClick();
                                // Clear the cloud-saved flag so the tour re-opens on next mount.
                                const s = SaveManager.load();
                                if (s.welcomeSeen) {
                                    delete s.welcomeSeen;
                                    SaveManager.save(s);
                                }
                                // Tell the (already-mounted) WelcomeModal to re-open.
                                window.dispatchEvent(new CustomEvent('replayWelcomeTour'));
                                navigate('/');
                            }}
                            className="bg-cyan-900/50 hover:bg-cyan-800/70 text-cyan-300 border border-cyan-700/60 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors w-full sm:w-auto"
                        >
                            Replay Tour
                        </button>
                    </div>

                    {/* Rewards History */}
                    <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-emerald-500/30 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                        <h2 className="text-lg md:text-xl font-bold text-emerald-400 mb-4 md:mb-6 flex items-center gap-2">
                            <Gift className="w-5 h-5" /> Rewards History
                        </h2>
                        
                        {rewardsHistory.length === 0 ? (
                            <div className="text-center text-sm md:text-base text-slate-500 py-6 md:py-8 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                No rewards claimed yet. Compete on the leaderboards to earn OMENX rewards!
                            </div>
                        ) : (
                            <div className="grid gap-2 md:gap-3 max-h-[200px] md:max-h-[300px] overflow-y-auto pr-2">
                                {rewardsHistory.map((reward) => {
                                    const lbLabel = reward.period_type === 'weekly' ? 'Weekly Leaderboard'
                                        : reward.period_type === 'seasonal' ? 'Seasonal Leaderboard'
                                        : reward.period_type === 'staff_weekly' ? 'Staff Payout'
                                        : reward.period_type || 'Leaderboard';
                                    const isStaff = reward.period_type === 'staff_weekly';
                                    const showRank = !isStaff && reward.rank && reward.rank > 0;
                                    return (
                                    <div key={reward.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center gap-3">
                                        <div className="min-w-0">
                                            <div className="font-bold text-white mb-1 truncate">{reward.reason || lbLabel}</div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] uppercase tracking-wider font-bold bg-cyan-900/40 text-cyan-300 border border-cyan-700/50 px-1.5 py-0.5 rounded">{lbLabel}</span>
                                                {showRank && (
                                                    <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-900/40 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded">Rank #{reward.rank}</span>
                                                )}
                                                <span className="text-xs text-slate-400">{reward.period_id}</span>
                                            </div>
                                        </div>
                                        <div className="bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shrink-0">
                                            <Hexagon className="w-4 h-4 fill-emerald-400 text-emerald-400" /> +{reward.amount.toLocaleString()}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
        </OmenXGate>
    );
}