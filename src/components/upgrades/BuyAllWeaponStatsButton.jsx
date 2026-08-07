import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { getWeaponSku } from '@/lib/skuMap';
import { refreshBalance } from '@/lib/playerDataCache';
import { invokePurchaseWithRetry, formatPurchaseError, delay, PURCHASE_THROTTLE_MS } from './buyAllHelpers';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

const WEAPON_STAT_IDS = ['damage', 'area', 'cooldown'];

/**
 * "Buy All with OMENX" button for the Weekly/Seasonal Armory tab — maxes the
 * three stats (damage/area/cooldown) of the currently-selected weapon, cheapest
 * levels first, until OMENX runs out.
 */
export default function BuyAllWeaponStatsButton({ tier, weapon, tokenCosts, save, omenxBalance, omenxBlocked, omenxBlockedMsg }) {
    const [showPreview, setShowPreview] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [error, setError] = useState(null);

    const saveKey = tier === 'weekly' ? 'weeklyWeaponUpgrades' : 'seasonalWeaponUpgrades';
    const weaponUpgrades = save[saveKey]?.[weapon.id] || {};
    const maxLevel = tokenCosts.length; // 5

    const plan = useMemo(() => {
        const balance = omenxBalance ?? 0;
        const all = [];
        for (const stat of WEAPON_STAT_IDS) {
            const current = Number(weaponUpgrades[stat] || 0);
            for (let lvl = current + 1; lvl <= maxLevel; lvl++) {
                all.push({ stat, level: lvl, cost: tokenCosts[lvl - 1] });
            }
        }
        all.sort((a, b) => a.cost - b.cost);

        const affordable = [];
        let runningTotal = 0;
        for (const item of all) {
            if (runningTotal + item.cost > balance) break;
            affordable.push(item);
            runningTotal += item.cost;
        }
        return {
            affordable,
            totalCost: runningTotal,
            totalRemaining: all.length,
            totalRemainingCost: all.reduce((s, x) => s + x.cost, 0),
        };
    }, [weaponUpgrades, tokenCosts, omenxBalance, maxLevel]);

    const nothingToBuy = plan.totalRemaining === 0;
    const canAffordAny = plan.affordable.length > 0;

    const handleConfirm = async () => {
        if (busy || plan.affordable.length === 0) return;
        setBusy(true);
        setError(null);
        setProgress({ done: 0, total: plan.affordable.length });

        // Track live levels so each purchase targets current+1 (server validates).
        const liveLevels = {};
        for (const stat of WEAPON_STAT_IDS) liveLevels[stat] = Number(weaponUpgrades[stat] || 0);

        const playerName = save.pilotName || 'Pilot';
        let purchased = 0;

        for (const item of plan.affordable) {
            const expectedLevel = liveLevels[item.stat] + 1;
            if (expectedLevel !== item.level) continue;

            const skuId = getWeaponSku(tier, weapon.name || weapon.id, item.stat, item.level);
            const grantInfo = { type: 'weapon', tier, weaponId: weapon.id, stat: item.stat, level: item.level };

            try {
                const res = await invokePurchaseWithRetry({ skuId, quantity: 1, playerName, grantInfo });
                const data = res.data;

                if (data.saveData) {
                    const s = SaveManager.load();
                    const SERVER_FIELDS = ['weeklyWeaponUpgrades', 'seasonalWeaponUpgrades', 'permanentWeaponUpgrades'];
                    for (const k of SERVER_FIELDS) {
                        if (data.saveData[k] !== undefined) s[k] = data.saveData[k];
                    }
                    SaveManager.save(s);
                    const newLvl = s[saveKey]?.[weapon.id]?.[item.stat];
                    if (typeof newLvl === 'number') liveLevels[item.stat] = newLvl;
                }
                purchased++;
                setProgress({ done: purchased, total: plan.affordable.length });
                SoundManager.playUIClick();
                await delay(PURCHASE_THROTTLE_MS);
            } catch (e) {
                const status = e?.response?.status;
                console.error('[BuyAllWeaponStats] purchase failed:', status, e?.classification, e?.message);
                setError(formatPurchaseError(e));
                break;
            }
        }

        try {
            window.dispatchEvent(new CustomEvent('saveUpdated', { detail: SaveManager.load() }));
        } catch {}
        refreshBalance();
        setBusy(false);
        if (purchased > 0 && !error) {
            setShowPreview(false);
        }
    };

    const disabled = busy || omenxBlocked || nothingToBuy;

    return (
        <>
            <button
                onClick={() => { SoundManager.playUIClick(); setShowPreview(true); }}
                disabled={disabled}
                title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : (nothingToBuy ? 'This weapon is already maxed for this tier.' : undefined)}
                className={`w-full md:w-auto px-3 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                    disabled
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                }`}
            >
                <OmenXIcon className="w-3.5 h-3.5" />
                {nothingToBuy ? 'Maxed' : `Buy All ${tier === 'weekly' ? 'Weekly' : 'Seasonal'}`}
            </button>

            {showPreview && (
                <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && setShowPreview(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="bg-slate-900 border-2 border-emerald-600/60 rounded-2xl p-5 md:p-6 max-w-md w-full shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                        <h3 className="text-xl md:text-2xl font-black text-emerald-400 uppercase tracking-widest mb-1">
                            Max {weapon.name}
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">Maxes <strong className="text-white">{weapon.name}</strong>'s 3 stats (Damage / Area / Cooldown) to Lv.5 on the <strong className="text-white capitalize">{tier}</strong> tier, cheapest levels first.</p>

                        {nothingToBuy ? (
                            <div className="bg-slate-800/60 rounded-lg p-4 text-sm text-slate-300 text-center mb-4">
                                ✅ This weapon is already maxed for this tier.
                            </div>
                        ) : (
                            <div className="space-y-2 mb-4">
                                <div className="bg-slate-800/60 rounded-lg p-3 flex items-center justify-between">
                                    <span className="text-sm text-slate-300">Upgrades you can afford</span>
                                    <span className="font-bold text-emerald-400 text-lg">{plan.affordable.length} / {plan.totalRemaining}</span>
                                </div>
                                <div className="bg-slate-800/60 rounded-lg p-3 flex items-center justify-between">
                                    <span className="text-sm text-slate-300">Total cost</span>
                                    <span className="font-bold text-white text-lg flex items-center gap-1.5">
                                        <OmenXIcon className="w-5 h-5" /> {plan.totalCost.toLocaleString()}
                                    </span>
                                </div>
                                <div className="bg-slate-800/40 rounded-lg p-3 flex items-center justify-between text-xs">
                                    <span className="text-slate-400">Your OMENX balance</span>
                                    <span className="font-bold text-slate-300">{(omenxBalance ?? 0).toLocaleString()}</span>
                                </div>
                                {plan.affordable.length < plan.totalRemaining && (
                                    <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg p-2 leading-snug">
                                        💡 Fully maxing this weapon costs <strong>{plan.totalRemainingCost.toLocaleString()} OMENX</strong> — your balance covers {plan.affordable.length} of {plan.totalRemaining}.
                                    </div>
                                )}
                                <div className="text-[11px] text-cyan-300 bg-cyan-950/30 border border-cyan-800/40 rounded-lg p-2 leading-snug">
                                    ⏱️ Estimated time: <strong>~{Math.ceil(plan.affordable.length * 3.5)}s</strong> ({plan.affordable.length} purchases × ~3.5s each). Please don't close this window while it's running.
                                </div>
                            </div>
                        )}

                        {busy && (
                            <div className="mb-4 bg-emerald-950/40 border border-emerald-700/40 rounded-lg p-3">
                                <div className="flex justify-between text-xs text-emerald-300 mb-1">
                                    <span>Purchasing…</span>
                                    <span>{progress.done} / {progress.total}</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
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
                                    disabled={busy || omenxBlocked}
                                    className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {busy ? '…' : <><OmenXIcon className="w-4 h-4" /> Confirm Purchase</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}