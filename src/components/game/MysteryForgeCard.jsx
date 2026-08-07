import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { Sparkles, Coins, Dices, Lock, Star } from 'lucide-react';
import { isS6OrLater } from '@/lib/seasonGate';
import { ASTRAL_STATS, getAstralPullCost, formatAstralValue } from '@/lib/astralLab';

// S6 Astral Lab — endgame gold sink (replaces the old Mystery Forge augment-lottery).
// Each pull = random small permanent stat buff. Cost ramps per pull (20k × 1.4^N).
// Per-stat hard cap. Pure RNG. Folds into existing player stat multipliers — so
// hitting the existing player.damageMult cap (4.0) means further astral damage pulls
// stop providing benefit (intentional whale prestige diminishing-returns curve).
// Component name kept as MysteryForgeCard so existing ForgePanel slot just works.

export default function MysteryForgeCard({ save, setSave }) {
    const isS6 = isS6OrLater();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [lastRoll, setLastRoll] = useState(null);

    const buffs = save.astralBuffs || {};
    const pullCount = save.astralPullCount || 0;
    const cost = useMemo(() => getAstralPullCost(pullCount), [pullCount]);
    const hasGold = (save.gold || 0) >= cost;

    // Are all stats fully capped?
    const allCapped = useMemo(() => ASTRAL_STATS.every(s => {
        const cur = buffs[s.id] || 0;
        return s.invert ? cur <= s.cap : cur >= s.cap;
    }), [buffs]);

    const handlePull = async () => {
        if (busy || !hasGold || allCapped) return;
        SoundManager.playUIClick();
        setBusy(true);
        setError(null);
        try {
            const res = await base44.functions.invoke('forgeAction', {
                action: 'astralPull',
                payload: {},
            });
            if (!res.data?.success) {
                setError(res.data?.error || 'Pull failed');
                return;
            }
            if (res.data.saveData) {
                const s = SaveManager.load();
                s.gold = res.data.saveData.gold ?? s.gold;
                s.astralBuffs = res.data.saveData.astralBuffs ?? s.astralBuffs;
                s.astralPullCount = res.data.saveData.astralPullCount ?? s.astralPullCount;
                SaveManager.save(s);
                setSave(s);
            }
            setLastRoll(res.data.astralResult);
            SoundManager.playLevelUp();
        } catch (e) {
            const msg = e?.response?.data?.error || e.message || 'Pull failed';
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    if (!isS6) {
        return (
            <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4 mt-4">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Lock className="w-4 h-4" />
                    <span className="font-bold text-xs uppercase tracking-widest">Astral Lab</span>
                    <span className="text-[9px] bg-purple-950/60 text-purple-300 border border-purple-700 px-1.5 py-0.5 rounded font-bold">S6 PREVIEW</span>
                </div>
                <p className="text-xs text-slate-500">Endgame gold sink — unlocks May 18. Pour gold into the lab to pull random permanent stat buffs.</p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-purple-950/40 via-slate-900/80 to-fuchsia-950/30 rounded-xl border-2 border-purple-500/40 p-3 md:p-4 mt-4 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-purple-300 fill-purple-400" />
                    <h3 className="font-black text-sm md:text-base text-purple-200 uppercase tracking-widest">Astral Lab</h3>
                    <span className="text-[9px] bg-purple-950/60 text-purple-300 border border-purple-500/50 px-1.5 py-0.5 rounded font-bold">ENDGAME</span>
                </div>
                <div className="flex items-center gap-1 bg-yellow-950/50 border border-yellow-700/50 px-2 py-1 rounded">
                    <Coins className="w-3 h-3 text-yellow-400 fill-yellow-500" />
                    <span className="text-[11px] font-bold text-yellow-300">{(save.gold || 0).toLocaleString()}</span>
                </div>
            </div>

            <p className="text-[11px] md:text-xs text-slate-300 mb-3 leading-snug">
                Pour gold into the lab for a <span className="text-purple-300 font-bold">random</span> permanent stat buff.
                Each pull costs more than the last. Each stat has a hard cap.
                <span className="block text-[10px] text-slate-400 mt-0.5">
                    Already-capped stats are skipped — but you still pay full price for whatever does roll.
                </span>
            </p>

            {/* Roll result banner */}
            {lastRoll && (
                <div className="mb-3 p-2.5 rounded-lg border-2 border-purple-500 bg-purple-950/60 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                    <Sparkles className="w-4 h-4 shrink-0 text-purple-200" />
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest font-bold opacity-80 text-purple-200">Pull #{pullCount} — granted</div>
                        <div className="font-bold text-xs md:text-sm text-purple-100">
                            {(ASTRAL_STATS.find(s => s.id === lastRoll.rolledStat)?.label) || lastRoll.rolledStat}{' '}
                            <span className="text-purple-300">{formatAstralValue(ASTRAL_STATS.find(s => s.id === lastRoll.rolledStat), lastRoll.delta)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Stat caps grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
                {ASTRAL_STATS.map(s => {
                    const cur = buffs[s.id] || 0;
                    const isCap = s.invert ? cur <= s.cap : cur >= s.cap;
                    const pct = s.invert ? (cur / s.cap) : (cur / s.cap);
                    const pctClamped = Math.max(0, Math.min(1, pct));
                    return (
                        <div key={s.id} className={`rounded-md border p-1.5 ${isCap ? 'bg-purple-950/60 border-purple-500' : 'bg-slate-900/60 border-slate-700'}`}>
                            <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-slate-300 truncate">{s.label}</span>
                                {isCap && <span className="text-[8px] font-bold text-purple-300 uppercase">MAX</span>}
                            </div>
                            <div className="text-[11px] font-mono font-bold text-purple-200 leading-tight">
                                {formatAstralValue(s, cur)}
                                <span className="text-slate-500"> / {formatAstralValue(s, s.cap)}</span>
                            </div>
                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400" style={{ width: `${pctClamped * 100}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {error && (
                <div className="mb-3 text-[11px] text-red-300 bg-red-950/40 border border-red-700/50 px-2 py-1.5 rounded">
                    ❌ {error}
                </div>
            )}

            <button
                onClick={handlePull}
                disabled={busy || !hasGold || allCapped}
                className={`w-full py-2.5 rounded-lg font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${
                    allCapped
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : !hasGold || busy
                            ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                            : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] active:scale-95'
                }`}
            >
                {allCapped ? '✓ All stats fully maxed' : busy ? 'Pulling…' : (
                    <>
                        <Dices className="w-4 h-4" /> Pull #{pullCount + 1}
                        <span className="flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded text-xs">
                            <Coins className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            {cost.toLocaleString()}
                        </span>
                    </>
                )}
            </button>
            <div className="text-center text-[9px] text-slate-500 mt-1.5 font-mono">
                Total pulls: {pullCount} · Next pull: {cost.toLocaleString()}g · After: {getAstralPullCost(pullCount + 1).toLocaleString()}g
            </div>
        </div>
    );
}