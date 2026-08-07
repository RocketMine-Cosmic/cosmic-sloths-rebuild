import React, { useState } from 'react';
import { CheckCircle, Circle, Gift, Coins, Puzzle, Zap } from 'lucide-react';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { useToast } from "@/components/ui/use-toast";
import { base44 } from '@/api/base44Client';

export default function DailyTasksPanel({ save, setSave }) {
    const { toast } = useToast();
    const [claiming, setClaiming] = useState(null); // taskId | null

    // If the stored dailyTasks are from an earlier UTC day, treat the panel as
    // empty and prompt the player to play a run — saveScore will rebuild the
    // tasks fresh for today on next run completion. Without this, players saw
    // yesterday's progress (and "DONE" claimed badges) bleed into the new day.
    const todayUTC = new Date().toISOString().split('T')[0];
    const storedDate = save.dailyTasks?.date;
    const isStale = storedDate && storedDate !== todayUTC;
    const tasks = isStale ? [] : (save.dailyTasks?.tasks || []);
    if (tasks.length === 0) {
        return (
            <div className="bg-[#0b0416]/80 backdrop-blur-xl border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.15)] rounded-xl p-3 md:p-4 mt-2 md:mt-4">
                <h3 className="text-xl font-bold text-emerald-400 mb-2 flex items-center gap-2">
                    <Zap className="w-5 h-5" /> Daily Tasks
                </h3>
                <p className="text-xs text-slate-500 italic">
                    {isStale
                        ? "New day! Play a run to unlock today's fresh daily tasks."
                        : "Play a run to unlock today's daily tasks."}
                </p>
            </div>
        );
    }

    const applyServerResult = (data) => {
        const s = SaveManager.load();
        if (data.saveData.gold !== undefined) s.gold = data.saveData.gold;
        if (data.saveData.relicFragments !== undefined) s.relicFragments = data.saveData.relicFragments;
        if (data.saveData.dailyTasks) s.dailyTasks = data.saveData.dailyTasks;
        SaveManager.save(s);
        setSave(s);
    };

    const handleClaim = async (taskId) => {
        if (claiming) return;
        setClaiming(taskId);
        try {
            const res = await base44.functions.invoke('claimDailyTask', { taskId });
            const data = res.data;
            if (!data?.success) {
                toast({ title: 'Claim Failed', description: data?.error || 'Try again.' });
                return;
            }
            applyServerResult(data);
            SoundManager.playGoldPickup();
            const parts = [];
            if (data.reward.gold) parts.push(`${data.reward.gold} Gold`);
            if (data.reward.fragments) parts.push(`${data.reward.fragments} Fragments`);
            toast({ title: 'Task Complete!', description: `You received ${parts.join(' + ')}` });
        } catch (e) {
            toast({ title: 'Claim Failed', description: e.message || 'Network error.' });
        } finally {
            setClaiming(null);
        }
    };

    const completedCount = tasks.filter(t => t.claimed).length;
    const allDone = completedCount === tasks.length;

    return (
        <div className="bg-[#0b0416]/80 backdrop-blur-xl border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.15)] rounded-xl p-3 md:p-4 mt-2 md:mt-4">
            <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                    <Zap className="w-5 h-5" /> Daily Tasks
                </h3>
                <span className={`text-xs font-bold px-2 py-1 rounded border ${
                    allDone
                        ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 animate-pulse'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}>
                    {completedCount}/{tasks.length} complete
                </span>
            </div>

            <p className="text-xs text-slate-400 mb-3">
                Quick goals for today — most can be done in a single run!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                {tasks.map((task) => {
                    const isComplete = (task.progress || 0) >= (task.target || 0);
                    const isClaimed = task.claimed;
                    const isClaimingThis = claiming === task.id;
                    const progressPct = Math.min(100, ((task.progress || 0) / (task.target || 1)) * 100);

                    return (
                        <div
                            key={task.id}
                            className={`p-3 rounded-lg border transition-colors ${
                                isClaimed ? 'bg-slate-800/50 border-slate-700 opacity-60'
                                : isComplete ? 'bg-slate-800 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                : 'bg-slate-800 border-slate-700'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2 gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        {isComplete ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-slate-500 shrink-0" />}
                                        <span className={`font-bold text-sm ${isComplete ? 'text-white' : 'text-slate-300'}`}>
                                            {task.desc}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-[10px]">
                                            {Math.min(task.progress || 0, task.target)} / {task.target}
                                        </span>
                                        {task.rewardGold > 0 && (
                                            <span className="text-yellow-500 font-bold flex items-center gap-1">
                                                <Coins className="w-3 h-3 fill-yellow-500" /> {task.rewardGold}
                                            </span>
                                        )}
                                        {task.rewardFragments > 0 && (
                                            <span className="text-fuchsia-400 font-bold flex items-center gap-1">
                                                <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" /> {task.rewardFragments}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isComplete && !isClaimed && (
                                    <button
                                        onClick={() => handleClaim(task.id)}
                                        disabled={isClaimingThis}
                                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)] flex items-center gap-1 shrink-0"
                                    >
                                        <Gift className="w-3 h-3" /> {isClaimingThis ? '…' : 'CLAIM'}
                                    </button>
                                )}
                                {isClaimed && (
                                    <span className="text-emerald-500/50 text-xs font-bold border border-emerald-500/30 px-2 py-1 rounded shrink-0">
                                        DONE
                                    </span>
                                )}
                            </div>

                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-emerald-600/60'}`}
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}