import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { Coins } from 'lucide-react';

const STAT_IDS = ['damage', 'health', 'speed', 'magnet', 'regen', 'cooldown', 'luck'];

// Light throttle between gold purchases. spendGold is a Base44-only call (~400-700ms),
// no on-chain settlement, but back-to-back hammering can still trip the rate limiter.
const GOLD_THROTTLE_MS = 150;
// Per-call ETA estimate (slightly over observed ~0.7s) for a safe upper-bound display.
const ETA_PER_CALL_S = 1.2;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * "Buy All with Gold" button for the Weekly or Seasonal Stats tab.
 * Mirrors BuyAllStatsButton (OMENX) but spends Gold via the spendGold backend function.
 * Much faster than OMENX since there's no on-chain settlement.
 */
export default function BuyAllStatsGoldButton({ tier, goldCosts, save }) {
    const [showPreview, setShowPreview] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [error, setError] = useState(null);

    const saveKey = tier === 'weekly' ? 'weeklyUpgrades' : 'seasonalUpgrades';
    const upgrades = save[saveKey] || {};
    const maxLevel = goldCosts.length; // 5
    const goldBalance = Number(save.gold || 0);

    const plan = useMemo(() => {
        const all = [];
        for (const stat of STAT_IDS) {
            const current = Number(upgrades[stat] || 0);
            for (let lvl = current + 1; lvl <= maxLevel; lvl++) {
                all.push({ stat, level: lvl, cost: goldCosts[lvl - 1] });
            }
        }
        all.sort((a, b) => a.cost - b.cost);

        const affordable = [];
        let runningTotal = 0;
        for (const item of all) {
            if (runningTotal + item.cost > goldBalance) break;
            affordable.push(item);
            runningTotal += item.cost;
        }
        return {
            affordable,
            totalCost: runningTotal,
            totalRemaining: all.length,
            totalRemainingCost: all.reduce((s, x) => s + x.cost, 0),
        };
    }, [upgrades, goldCosts, goldBalance, maxLevel]);

    const nothingToBuy = plan.totalRemaining === 0;
    const canAffordAny = plan.affordable.length > 0;

    const handleConfirm = async () => {
        if (busy || plan.affordable.length === 0) return;
        setBusy(true);
        setError(null);
        setProgress({ done: 0, total: plan.affordable.length });

        const liveLevels = {};
        for (const stat of STAT_IDS) liveLevels[stat] = Number(upgrades[stat] || 0);

        let purchased = 0;

        for (const item of plan.affordable) {
            const expectedLevel = liveLevels[item.stat] + 1;
            if (expectedLevel !== item.level) continue;

            const grantInfo = { type: 'stat', tier, stat: item.stat, level: item.level };

            try {
                const res = await base44.functions.invoke('spendGold', { grantInfo });
                const data = res.data;
                if (!data?.success) {
                    setError(data?.error || 'Something went wrong — stopped batch.');
                    break;
                }
                if (data.saveData) {
                    const s = SaveManager.load();
                    const SERVER_FIELDS = ['gold', 'weeklyUpgrades', 'seasonalUpgrades', 'permanentUpgrades'];
                    for (const k of SERVER_FIELDS) {
                        if (data.saveData[k] !== undefined) s[k] = data.saveData[k];
                    }
                    SaveManager.save(s);
                    const newLvl = s[saveKey]?.[item.stat];
                    if (typeof newLvl === 'number') liveLevels[item.stat] = newLvl;
                }
                purchased++;
                setProgress({ done: purchased, total: plan.affordable.length });
                SoundManager.playUIClick();
                await delay(GOLD_THROTTLE_MS);
            } catch (e) {
                const serverMsg = e?.response?.data?.error || e?.message || '';
                console.error('[BuyAllStatsGold] purchase failed:', e?.response?.status, serverMsg);
                setError(serverMsg || 'Something went wrong — stopped batch.');
                break;
            }
        }

        try {
            window.dispatchEvent(new CustomEvent('saveUpdated', { detail: SaveManager.load() }));
        } catch {}
        setBusy(false);
        if (purchased > 0 && !error) {
            setShowPreview(false);
        }
    };

    const disabled = busy || nothingToBuy;

    return (
        <>
            <button
                onClick={() => { SoundManager.playUIClick(); setShowPreview(true); }}
                disabled={disabled}
                title={nothingToBuy ? 'All stats are already maxed for this tier.' : undefined}
                className={`w-full md:w-auto px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                    disabled
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-900 shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                }`}
            >
                <Coins className="w-4 h-4 fill-current" />
                {nothingToBuy ? `All ${tier} stats maxed` : `Buy All ${tier === 'weekly' ? 'Weekly' : 'Seasonal'} Stats`}
            </button>

            {showPreview && (
                <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setShowPreview(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border-2 border-yellow-500/60 rounded-2xl p-5 md:p-6 max-w-md w-full shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                        <h3 className="text-xl md:text-2xl font-black text-yellow-400 uppercase tracking-widest mb-1">
                            Buy All {tier === 'weekly' ? 'Weekly' : 'Seasonal'} Stats
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">Maxes every stat to its cap (Lv.5), cheapest levels first. Stops when your Gold runs out.</p>

                        {nothingToBuy ? (
                            <div className="bg-slate-800/60 rounded-lg p-4 text-sm text-slate-300 text-center mb-4">
                                ✅ All stats are already maxed for this tier.
                            </div>
                        ) : (
                            <div className="space-y-2 mb-4">
                                <div className="bg-slate-800/60 rounded-lg p-3 flex items-center justify-between">
                                    <span className="text-sm text-slate-300">Upgrades you can afford</span>
                                    <span className="font-bold text-yellow-400 text-lg">{plan.affordable.length} / {plan.totalRemaining}</span>
                                </div>
                                <div className="bg-slate-800/60 rounded-lg p-3 flex items-center justify-between">
                                    <span className="text-sm text-slate-300">Total cost</span>
                                    <span className="font-bold text-white text-lg flex items-center gap-1.5">
                                        <Coins className="w-5 h-5 text-yellow-400 fill-current" /> {plan.totalCost.toLocaleString()}
                                    </span>
                                </div>
                                <div className="bg-slate-800/40 rounded-lg p-3 flex items-center justify-between text-xs">
                                    <span className="text-slate-400">Your Gold balance</span>
                                    <span className="font-bold text-slate-300">{goldBalance.toLocaleString()}</span>
                                </div>
                                {plan.affordable.length < plan.totalRemaining && (
                                    <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg p-2 leading-snug">
                                        💡 Maxing every stat would cost <strong>{plan.totalRemainingCost.toLocaleString()} Gold</strong> — your balance covers {plan.affordable.length} of {plan.totalRemaining}.
                                    </div>
                                )}
                                <div className="text-[11px] text-cyan-300 bg-cyan-950/30 border border-cyan-800/40 rounded-lg p-2 leading-snug">
                                    ⏱️ Estimated time: <strong>~{Math.ceil(plan.affordable.length * ETA_PER_CALL_S)}s</strong> ({plan.affordable.length} purchases × ~{ETA_PER_CALL_S}s each). Please don't close this window while it's running.
                                </div>
                            </div>
                        )}

                        {busy && (
                            <div className="mb-4 bg-yellow-950/40 border border-yellow-700/40 rounded-lg p-3">
                                <div className="flex justify-between text-xs text-yellow-300 mb-1">
                                    <span>Purchasing…</span>
                                    <span>{progress.done} / {progress.total}</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-yellow-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="mb-4 bg-red-950/40 border border-red-700/60 rounded-lg p-3 text-xs text-red-200">
                                ❌ {error}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowPreview(false)}
                                disabled={busy}
                                className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
                            >
                                {busy ? 'Working…' : 'Cancel'}
                            </button>
                            {canAffordAny && !nothingToBuy && (
                                <button
                                    onClick={handleConfirm}
                                    disabled={busy}
                                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm bg-yellow-500 hover:bg-yellow-400 text-slate-900 disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {busy ? '…' : <><Coins className="w-4 h-4 fill-current" /> Confirm Purchase</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}