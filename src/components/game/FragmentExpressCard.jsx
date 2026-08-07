import React, { useState } from 'react';
import { Star, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import { useCurrency } from '@/lib/CurrencyContext';
import { useOmenXConfirmation } from '@/hooks/useOmenXConfirmation';
import { useOmenXPurchasesDisabled } from '@/hooks/useOmenXPurchasesDisabled';
import { getCurrentPeriodIds } from '@/lib/periodIds';
import { isS8OrLater } from '@/lib/seasonGate';
import { refreshBalance } from '@/lib/playerDataCache';
import OmenXConfirmation from './OmenXConfirmation';
import { useToast } from '@/components/ui/use-toast';

// S8 Fragment Express Lane — buy 15 relic fragments for 10 OMENX (or a 10× bulk
// bundle for 150 frags / 100 OMENX), capped at 40 batches per player per ISO
// week (= 600 frags / 400 OMENX cap). Sits inside the Forge Convert tab, right
// below the gold-convert row. See docs/s8/PLAN_REVIVE_AND_FRAGMENTS.md §Sink 2.
export default function FragmentExpressCard({ save, setSave }) {
    const { omenxBalance } = useCurrency();
    const { disabled: omenxBlocked, message: blockedMsg } = useOmenXPurchasesDisabled();
    const { pending, confirm: confirmPurchase } = useOmenXConfirmation('forge-frag-express');
    // Distinguishes which button is spinning so we can show the correct label.
    const [busy, setBusy] = useState(null); // null | 'single' | 'bulk'
    // The 10× bundle always re-confirms — the confirmation modal hides the
    // "don't show for 24h" toggle when this is true (see OmenXConfirmation).
    const [forceConfirm, setForceConfirm] = useState(false);
    const { toast } = useToast();

    // Feature gate — S8+ only. Held back until W29 rollover so we don't ship
    // an in-season pricing change to the current S7 economy.
    if (!isS8OrLater()) return null;

    const BATCH_SIZE = 15;
    const BATCH_COST = 10;
    const WEEKLY_CAP = 40;
    const BULK_BATCHES = 10; // 10× bundle → 150 frags / 100 OMENX

    const { week_id } = getCurrentPeriodIds();
    const currentBatches = save.weekly_fragment_batches_week_id === week_id
        ? (save.weekly_fragment_batches || 0)
        : 0;
    const remaining = Math.max(0, WEEKLY_CAP - currentBatches);
    const atCap = remaining <= 0;
    const canAffordSingle = (omenxBalance ?? 0) >= BATCH_COST;
    const canAffordBulk = (omenxBalance ?? 0) >= BATCH_COST * BULK_BATCHES;
    // Bulk requires enough room in the weekly cap for a full 10-batch bundle —
    // partial grants are rejected server-side so we gate the button here too.
    const bulkFitsInCap = remaining >= BULK_BATCHES;

    const runPurchase = (batches, isBulk) => {
        if (busy) return;
        if (atCap) return;
        SoundManager.playUIClick();
        const label = `+${BATCH_SIZE * batches} Star Fragments`;
        const cost = BATCH_COST * batches;
        // Set forceConfirm BEFORE opening the modal so the initial render hides
        // the 24h-skip toggle. Cleared in onCancel/onConfirm below.
        setForceConfirm(isBulk);
        confirmPurchase(cost, label, async () => {
            setBusy(isBulk ? 'bulk' : 'single');
            try {
                // 10× bundle uses its own OmenX SKU (server checks skuId matches
                // the bundle tier so a cheap single-batch SKU can't be used to
                // grant a 10× bundle).
                const skuId = isBulk ? 'ingame-star-fragments-10' : 'ingame-star-fragments';
                const res = await base44.functions.invoke('purchaseSku', {
                    skuId,
                    quantity: 1,
                    grantInfo: { type: 'star_fragments', quantity: batches },
                });
                if (!res.data?.success) {
                    toast({ title: 'Purchase Failed', description: res.data?.error || 'Try again.' });
                    return;
                }
                if (res.data.saveData) {
                    const merged = { ...SaveManager.load(), ...res.data.saveData };
                    SaveManager.save(merged);
                    setSave(merged);
                }
                refreshBalance();
                toast({
                    title: 'Fragments Purchased',
                    description: `+${BATCH_SIZE * batches} Star Fragments added to your inventory.`,
                });
            } catch (err) {
                const msg = err?.response?.data?.error || err?.data?.error || err?.message || 'Try again.';
                toast({ title: 'Purchase Failed', description: msg });
            } finally {
                setBusy(null);
                setForceConfirm(false);
            }
        }, isBulk ? { force: true } : {});
    };

    const singleLabel = omenxBlocked
        ? 'OMENX Paused'
        : atCap
            ? 'Weekly Cap Reached'
            : !canAffordSingle
                ? 'Not Enough OMENX'
                : busy === 'single'
                    ? 'Processing…'
                    : `Buy ${BATCH_SIZE} 🌟 · ${BATCH_COST} OMENX`;

    const bulkLabel = omenxBlocked
        ? 'OMENX Paused'
        : atCap
            ? 'Weekly Cap Reached'
            : !bulkFitsInCap
                ? `Only ${remaining} batches left`
                : !canAffordBulk
                    ? 'Not Enough OMENX'
                    : busy === 'bulk'
                        ? 'Processing…'
                        : `Buy ${BATCH_SIZE * BULK_BATCHES} 🌟 · ${BATCH_COST * BULK_BATCHES} OMENX`;

    const singleDisabled = !!busy || atCap || !canAffordSingle || omenxBlocked;
    const bulkDisabled = !!busy || atCap || !canAffordBulk || !bulkFitsInCap || omenxBlocked;

    return (
        <>
            <div className="bg-slate-800 rounded-xl border border-purple-500/40 p-4 md:p-6">
                <h3 className="font-bold text-white text-lg mb-1 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-400" /> Fragment Express Lane
                    <span className="text-[10px] font-black bg-purple-500 text-white px-1.5 py-0.5 rounded uppercase tracking-widest">S8</span>
                </h3>
                <p className="text-slate-400 text-sm mb-3">
                    Skip the gold-convert grind. Instantly buy Star Fragments 🌟 with OMENX to speed up your relic prestige climb.
                    <br />
                    <span className="text-purple-300 font-bold">Rate: {BATCH_COST} OMENX = {BATCH_SIZE} 🌟 ({(BATCH_COST / BATCH_SIZE).toFixed(2)} OMENX per fragment)</span>
                    <span className="ml-3 text-slate-500">Weekly cap: {WEEKLY_CAP} batches ({WEEKLY_CAP * BATCH_SIZE} frags / {WEEKLY_CAP * BATCH_COST} OMENX)</span>
                </p>

                <div className="flex flex-col gap-3">
                    <div className="text-xs text-slate-300">
                        <div className="font-bold text-slate-400 mb-0.5">This week</div>
                        <div className="font-mono">
                            <span className={atCap ? 'text-rose-400' : 'text-purple-300'}>{currentBatches}</span>
                            <span className="text-slate-500"> / {WEEKLY_CAP} batches</span>
                            <span className="text-slate-500 ml-2">· {remaining * BATCH_SIZE} 🌟 remaining</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            onClick={() => runPurchase(1, false)}
                            disabled={singleDisabled}
                            title={omenxBlocked ? (blockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                            className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.2)] ${
                                singleDisabled
                                    ? 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed'
                                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                            }`}
                        >
                            <Star className="w-4 h-4 fill-current" /> {singleLabel}
                        </button>
                        <button
                            onClick={() => runPurchase(BULK_BATCHES, true)}
                            disabled={bulkDisabled}
                            title={omenxBlocked
                                ? (blockedMsg || 'OMENX purchases are temporarily disabled.')
                                : (!bulkFitsInCap && !atCap ? `Bulk bundle needs ${BULK_BATCHES} batches free — you only have ${remaining} left this week.` : undefined)}
                            className={`relative px-4 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(217,70,239,0.25)] ${
                                bulkDisabled
                                    ? 'bg-slate-900 text-slate-500 border border-slate-700 cursor-not-allowed'
                                    : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white'
                            }`}
                        >
                            <Star className="w-4 h-4 fill-current" /> {bulkLabel}
                        </button>
                    </div>
                </div>
            </div>

            {pending && (
                <OmenXConfirmation
                    amount={pending.amount}
                    itemName={pending.itemName}
                    onConfirm={pending.onConfirm}
                    onCancel={pending.onCancel}
                    pageId="forge-frag-express"
                    forceConfirm={forceConfirm}
                />
            )}
        </>
    );
}