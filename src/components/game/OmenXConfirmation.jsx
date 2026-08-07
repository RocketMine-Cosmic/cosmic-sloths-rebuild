import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Lock } from 'lucide-react';
import { getStatus as getMaintenanceStatus, refreshNow as refreshMaintenance } from '@/lib/maintenanceStatus';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

export default function OmenXConfirmation({ amount, itemName, onConfirm, onCancel, pageId, forceConfirm = false }) {
    // forceConfirm — high-value bulk purchases (e.g. 10× fragment bundle) hide
    // the "don't show for 24h" checkbox entirely, so a whale who ticked skip
    // for the small 10-OMENX button can never accidentally buy 100 OMENX in
    // one tap. See docs/s8/PLAN_REVIVE_AND_FRAGMENTS.md §Sink 2 (bulk bundle).
    const [skipNext24h, setSkipNext24h] = useState(false);
    // Read kill-switch from SHARED maintenance cache — no per-modal poll.
    const initialMaint = getMaintenanceStatus();
    const [purchasesDisabled, setPurchasesDisabled] = useState(!!initialMaint.omenxPurchasesDisabled);
    const [disabledMsg, setDisabledMsg] = useState(initialMaint.omenxPurchasesMessage || 'OMENX purchases are temporarily disabled while the settlement service is being restored. Please try again shortly.');

    const handleConfirm = async () => {
        if (purchasesDisabled) return;
        // Force-refresh the SHARED cache at click time (deduped, so this is
        // cheap even if multiple confirmations fire). If the kill-switch flipped
        // on while the modal was open, abort before firing the optimistic grant.
        try {
            const s = await refreshMaintenance();
            if (s?.omenxPurchasesDisabled) {
                setPurchasesDisabled(true);
                setDisabledMsg(s.omenxPurchasesMessage || 'OMENX purchases are temporarily disabled while the settlement service is being restored. Please try again shortly.');
                return;
            }
        } catch {
            // Network blip — fail OPEN (let the existing flag govern) so we don't
            // block legit purchases on a transient hiccup.
        }
        if (skipNext24h && !forceConfirm) {
            const disabledUntil = Date.now() + (24 * 60 * 60 * 1000);
            localStorage.setItem(`omenx_confirm_disabled_${pageId}`, disabledUntil.toString());
        }
        onConfirm();
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border-2 border-orange-500 p-6 md:p-8 rounded-xl max-w-md w-full text-center shadow-[0_0_30px_rgba(234,179,8,0.2)]"
            >
                <div className="flex justify-center mb-4">
                    <AlertCircle className="w-12 h-12 text-orange-500" />
                </div>
                
                <h2 className="text-2xl font-bold text-white mb-2 font-mono">CONFIRM PURCHASE</h2>
                <p className="text-slate-400 mb-6">You're about to spend real OMENX tokens.</p>
                
                <div className="bg-slate-800 p-4 rounded-lg mb-6 border border-slate-700">
                    <div className="text-sm text-slate-400 mb-2">ITEM</div>
                    <div className="font-bold text-white text-lg mb-4">{itemName}</div>
                    <div className="flex items-center justify-center gap-2 bg-orange-950/40 p-3 rounded-lg border border-orange-500/30">
                        <OmenXIcon className="w-5 h-5" />
                        <span className="text-orange-400 font-bold text-lg">{amount.toFixed(2)} OMENX</span>
                    </div>
                </div>

                {!forceConfirm && (
                    <div className="flex items-center gap-2 mb-6 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                        <input
                            type="checkbox"
                            id="skip-confirm"
                            checked={skipNext24h}
                            onChange={(e) => setSkipNext24h(e.target.checked)}
                            className="w-4 h-4 accent-orange-500 cursor-pointer"
                        />
                        <label htmlFor="skip-confirm" className="text-sm text-slate-300 cursor-pointer flex-1 text-left">
                            Don't show this again for 24 hours
                        </label>
                    </div>
                )}

                {purchasesDisabled && (
                    <div className="mb-4 bg-red-950/40 border border-red-700/60 rounded-lg p-3 text-left flex gap-2">
                        <Lock className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-200 leading-relaxed">{disabledMsg}</div>
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleConfirm}
                        disabled={purchasesDisabled}
                        className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:cursor-not-allowed disabled:shadow-none text-white py-3 rounded-lg font-bold transition-colors shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                    >
                        {purchasesDisabled ? 'PURCHASES TEMPORARILY DISABLED' : 'CONFIRM PURCHASE'}
                    </button>
                    <button
                        onClick={onCancel}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-lg font-bold border border-slate-700 transition-colors"
                    >
                        CANCEL
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
}