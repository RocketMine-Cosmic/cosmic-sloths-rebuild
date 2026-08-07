import React, { useState } from 'react';
import { Gift, Flame, CheckCircle, Coins, Puzzle, Hexagon } from 'lucide-react';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { useToast } from "@/components/ui/use-toast";
import { base44 } from '@/api/base44Client';
import moment from 'moment';

const DAILY_REWARDS = [
    { day: 1, reward: 400,   currency: 'gold',  icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" /> },
    { day: 2, reward: 800,   currency: 'gold',  icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" /> },
    { day: 3, reward: 1000,  currency: 'gold',  icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" /> },
    { day: 4, reward: 1,     currency: 'fragment', icon: <Puzzle className="w-6 h-6 md:w-8 md:h-8 fill-fuchsia-400 text-fuchsia-400 mx-auto" /> },
    { day: 5, reward: 2000,  currency: 'gold',  icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" /> },
    { day: 6, reward: 2,     currency: 'fragment', icon: <Puzzle className="w-6 h-6 md:w-8 md:h-8 fill-fuchsia-400 text-fuchsia-400 mx-auto" /> },
    { day: 7, reward: 4000,  currency: 'gold',  icon: <Coins className="w-6 h-6 md:w-8 md:h-8 fill-yellow-500 text-yellow-500 mx-auto" />, bonus: true },
];

export default function DailyLoginPanel({ save, setSave }) {
    const { toast } = useToast();
    const [claiming, setClaiming] = useState(false);
    const today = moment.utc().format('YYYY-MM-DD');

    const login = save.dailyLogin || { lastDate: '', streak: 0, claimed: false };
    const alreadyClaimed = login.lastDate === today && login.claimed;

    // Calculate current streak (reset if missed a day) — display only.
    const yesterday = moment.utc().subtract(1, 'day').format('YYYY-MM-DD');
    const streakActive = login.lastDate === today || login.lastDate === yesterday;
    const streak = streakActive ? login.streak : 0;
    const dayIndex = (streak % 7);

    const handleClaim = async () => {
        if (claiming || alreadyClaimed) return;
        setClaiming(true);

        try {
            const res = await base44.functions.invoke('claimDailyLogin', {});
            const data = res.data;

            if (!data?.success) {
                if (data?.alreadyClaimed) {
                    // Sync local save with the truth so UI reflects it immediately
                    const s = SaveManager.load();
                    s.dailyLogin = { ...(s.dailyLogin || {}), lastDate: today, claimed: true };
                    SaveManager.save(s);
                    setSave(s);
                    toast({ title: 'Already Claimed', description: 'You can only claim once per day.' });
                } else {
                    toast({ title: 'Claim Failed', description: data?.error || 'Please try again.' });
                }
                return;
            }

            // Apply server-authoritative reward to local save.
            // Note: SaveManager.load() runs the daily-bounties rotation, so the
            // freshly-loaded `s` already has today's bounties. We then push it
            // back to the cloud so the server-side claim doesn't overwrite our
            // bounty state on next sync (was reverting bounties to yesterday's).
            const s = SaveManager.load();
            if (data.saveData.gold !== undefined) s.gold = data.saveData.gold;
            if (data.saveData.cosmicTokens !== undefined) s.cosmicTokens = data.saveData.cosmicTokens;
            if (data.saveData.relicFragments !== undefined) s.relicFragments = data.saveData.relicFragments;
            s.dailyLogin = data.saveData.dailyLogin;
            SaveManager.save(s);
            setSave(s);
            // Push immediately so today's bounty rotation is persisted to cloud.
            SaveManager.syncToBackendImmediate?.();
            SoundManager.playGoldPickup();

            toast({
                title: `Day ${data.streak} Reward Claimed!`,
                description: `+${data.reward.reward} ${data.reward.currency === 'gold' ? 'Gold' : data.reward.currency === 'token' ? 'Cosmic Tokens' : 'Relic Fragments'}`,
            });
        } catch (e) {
            toast({ title: 'Claim Failed', description: e.message || 'Network error.' });
        } finally {
            setClaiming(false);
        }
    };

    return (
        <div className="bg-[#0b0416]/80 backdrop-blur-xl border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.15)] rounded-xl p-3 md:p-4 mb-2 md:mb-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-400" />
                    Daily Login
                    {streak > 0 && (
                        <span className="text-sm font-bold text-orange-400 bg-orange-900/40 border border-orange-700/50 px-2 py-0.5 rounded-full">
                            🔥 {streak} day streak
                        </span>
                    )}
                </h3>
                {alreadyClaimed && (
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Claimed Today
                    </span>
                )}
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-1.5 mb-2 md:mb-4">
                {DAILY_REWARDS.map((r, i) => {
                    const isPast = i < (alreadyClaimed ? (login.streak % 7) : dayIndex);
                    const isCurrent = i === (alreadyClaimed ? (login.streak - 1) % 7 : dayIndex);
                    const isFuture = !isPast && !isCurrent;

                    return (
                        <div
                            key={r.day}
                            className={`flex flex-col items-center justify-center p-1.5 rounded-lg border text-center transition-all ${
                                isCurrent && alreadyClaimed
                                    ? 'bg-emerald-900/40 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                    : isCurrent
                                    ? 'bg-amber-900/40 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse'
                                    : isPast
                                    ? 'bg-slate-800/60 border-slate-600 opacity-70'
                                    : 'bg-slate-800/30 border-slate-700/50 opacity-40'
                            }`}
                        >
                            <div className="text-[9px] font-bold text-slate-400 mb-0.5">DAY {r.day}</div>
                            <div className="text-lg leading-none">{r.icon}</div>
                            <div className={`text-[9px] font-bold mt-0.5 ${r.bonus ? 'text-yellow-400' : 'text-slate-300'}`}>
                                {r.reward}{r.currency === 'fragment' ? '' : ''}
                            </div>
                            {(isPast || (isCurrent && alreadyClaimed)) && (
                                <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5" />
                            )}
                            {r.bonus && <div className="text-[8px] text-yellow-400 font-bold">BONUS</div>}
                        </div>
                    );
                })}
            </div>

            <button
                onClick={handleClaim}
                disabled={alreadyClaimed || claiming}
                className={`w-full py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all transform ${
                    alreadyClaimed || claiming
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:scale-[1.02] active:scale-95'
                }`}
            >
                <Gift className="w-5 h-5" />
                {claiming ? 'Claiming…' : alreadyClaimed ? 'Come Back Tomorrow!' : `Claim Day ${(dayIndex) + 1} Reward`}
            </button>
        </div>
    );
}