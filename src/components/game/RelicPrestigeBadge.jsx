import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { Coins, Sparkles, Lock, ShieldCheck, Puzzle } from 'lucide-react';
import { isS6OrLater } from '@/lib/seasonGate';

// S6 Phase 3a — Prestige Relics UI. Renders inline on each relic card after L5
// is reached. 1.5M gold + 100 relic fragments per prestige tier (PL1–PL5),
// each adding +5% to the relic's effect. Hard-gated to S6+ via seasonGate.
// Fragment cost added 2026-05-08 to drain existing fragment stockpiles.
// Tiered prestige costs — MUST match functions/prestigeRelic.js PRESTIGE_GOLD_COSTS.
const PRESTIGE_GOLD_COSTS = [500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000];
const PRESTIGE_FRAGMENT_COST = 100;
const PRESTIGE_MAX = 5;
const getPrestigeCost = (tier) => PRESTIGE_GOLD_COSTS[Math.min(tier, PRESTIGE_MAX - 1)];

export default function RelicPrestigeBadge({ relic, save, setSave }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const isS6 = isS6OrLater();

    const unlocked = save.unlockedRelics || [];
    const level = (save.relicLevels || {})[relic.id] || 0;
    const isOwnedAtMax = unlocked.includes(relic.id) && level >= 5;

    // Don't render at all if relic isn't yet at L5 — keeps the card clean.
    if (!isOwnedAtMax) return null;

    const prestige = (save.relicPrestige || {})[relic.id] || 0;
    const isMaxPrestige = prestige >= PRESTIGE_MAX;
    const nextCost = getPrestigeCost(prestige);
    const hasGold = (save.gold || 0) >= nextCost;
    const hasFragments = (save.relicFragments || 0) >= PRESTIGE_FRAGMENT_COST;
    const canAfford = hasGold && hasFragments;

    // S5 — preview-only. Show locked tease so players know it's coming.
    if (!isS6) {
        return (
            <div className="mt-2 px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900/40 flex items-center gap-2 text-[11px]">
                <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="text-slate-400 flex-1">Prestige unlocks Season 6 — 500K → 2.5M gold + 100 frags per tier, +5% effect (PL1–PL5)</span>
            </div>
        );
    }

    const handlePrestige = async () => {
        if (busy || !canAfford || isMaxPrestige) return;
        SoundManager.playUIClick();
        setBusy(true);
        setError(null);
        try {
            const res = await base44.functions.invoke('prestigeRelic', { relicId: relic.id });
            if (!res.data?.success) {
                setError(res.data?.error || 'Prestige failed');
                return;
            }
            if (res.data.saveData) {
                const s = SaveManager.load();
                s.gold = res.data.saveData.gold ?? s.gold;
                s.relicFragments = res.data.saveData.relicFragments ?? s.relicFragments;
                s.relicPrestige = res.data.saveData.relicPrestige ?? s.relicPrestige;
                SaveManager.save(s);
                setSave(s);
            }
            SoundManager.playLevelUp();
        } catch (e) {
            const msg = e?.response?.data?.error || e.message || 'Prestige failed';
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2 p-2 rounded-lg border-2 border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-amber-950/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">Prestige</span>
                    {prestige > 0 && (
                        <span className="text-[10px] font-bold bg-amber-500/30 text-amber-100 px-1.5 py-0.5 rounded border border-amber-500/50">
                            PL{prestige}
                        </span>
                    )}
                </div>
                {/* Pip row — visualises 0/5 → 5/5 prestige progression */}
                <div className="flex gap-0.5">
                    {Array.from({ length: PRESTIGE_MAX }).map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full border ${i < prestige ? 'bg-amber-400 border-amber-300 shadow-[0_0_5px_rgba(251,191,36,0.8)]' : 'border-amber-700/50 bg-amber-950/30'}`} />
                    ))}
                </div>
            </div>

            <div className="text-[10px] text-amber-100/80 mb-1.5 leading-snug">
                {isMaxPrestige
                    ? <span className="font-bold text-amber-300">✨ PL5 — maximum prestige reached (+25% bonus active)</span>
                    : <>Each tier adds <span className="font-bold text-amber-300">+5%</span> to {relic.name}'s effect (current bonus: <span className="font-bold text-amber-200">+{prestige * 5}%</span>).</>
                }
            </div>

            {error && (
                <div className="mb-1.5 text-[10px] text-red-300 bg-red-950/40 border border-red-700/50 px-1.5 py-1 rounded">
                    ❌ {error}
                </div>
            )}

            {!isMaxPrestige && (
                <>
                    <button
                        onClick={handlePrestige}
                        disabled={busy || !canAfford}
                        className={`w-full py-1.5 rounded font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all ${
                            !canAfford || busy
                                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                                : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)] active:scale-95'
                        }`}
                    >
                        <Sparkles className="w-3 h-3" />
                        {busy ? 'Prestiging…' : <>Prestige to PL{prestige + 1}</>}
                        <span className={`flex items-center gap-0.5 bg-black/30 px-1.5 py-0.5 rounded ml-1 ${!hasGold ? 'text-red-300' : ''}`}>
                            <Coins className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            {(nextCost / 1_000_000).toFixed(1)}M
                        </span>
                        <span className={`flex items-center gap-0.5 bg-black/30 px-1.5 py-0.5 rounded ${!hasFragments ? 'text-red-300' : ''}`}>
                            <Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400" />
                            {PRESTIGE_FRAGMENT_COST}
                        </span>
                    </button>
                    {!canAfford && (
                        <div className="mt-1 text-[9px] text-slate-400 text-center">
                            {!hasGold && !hasFragments && 'Need more gold and fragments'}
                            {!hasGold && hasFragments && 'Need more gold'}
                            {hasGold && !hasFragments && 'Need more relic fragments'}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}