import React from 'react';
import { Coins, X } from 'lucide-react';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

/**
 * Modal that confirms a talent respec, charging either Gold or OMENX.
 * No refund — flat fee clears all talents for one character at one tier.
 */
export default function TalentRespecModal({
    charName,
    tierLabel,
    talentCount,
    goldCost,
    omenxCost,
    canAffordGold,
    canAffordOmenx,
    onPayGold,
    onPayOmenx,
    onCancel,
    busy,
}) {
    return (
        <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-red-700 rounded-2xl max-w-md w-full p-5 md:p-6 shadow-2xl">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <h2 className="text-lg md:text-xl font-black text-red-400 uppercase tracking-widest">Respec Talents</h2>
                        <p className="text-xs text-slate-400 mt-1">
                            Clear all <span className="text-white font-bold">{talentCount}</span> {tierLabel} talent{talentCount === 1 ? '' : 's'} for <span className="text-pink-400 font-bold">{charName}</span>.
                        </p>
                    </div>
                    <button onClick={onCancel} disabled={busy} className="text-slate-500 hover:text-white p-1 -m-1 disabled:opacity-50">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg px-3 py-2 mb-4">
                    <p className="text-[11px] text-amber-300 leading-snug">
                        ⚠ This is a <strong>fee</strong>, not a refund — talents are cleared and the cost is final.
                    </p>
                </div>

                <div className="space-y-2">
                    <button
                        onClick={onPayGold}
                        disabled={!canAffordGold || busy}
                        className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                            canAffordGold && !busy
                                ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                    >
                        <Coins className="w-4 h-4 fill-current" />
                        Pay {goldCost.toLocaleString()} Gold
                        {!canAffordGold && <span className="text-[10px] opacity-80">(not enough)</span>}
                    </button>

                    <div className="flex items-center justify-center gap-2">
                        <div className="flex-1 h-px bg-slate-700/60" />
                        <span className="text-slate-500 text-[10px] font-bold tracking-widest">OR</span>
                        <div className="flex-1 h-px bg-slate-700/60" />
                    </div>

                    <button
                        onClick={onPayOmenx}
                        disabled={!canAffordOmenx || busy}
                        className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                            canAffordOmenx && !busy
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                    >
                        <OmenXIcon className="w-5 h-5" />
                        Pay {omenxCost.toLocaleString()} OMENX
                        {!canAffordOmenx && <span className="text-[10px] opacity-80">(not enough)</span>}
                    </button>

                    <button
                        onClick={onCancel}
                        disabled={busy}
                        className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}