import React, { useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ConfirmDialog from './ConfirmDialog';

export default function AdminMaintenanceReset({ walletAddress }) {
    const [step, setStep] = useState(0); // 0=confirm, 1=refunding, 2=wiping, 3=done
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleReset = async () => {
        setDialogOpen(false);
        setLoading(true);
        setError(null);
        try {
            const adminKey = sessionStorage.getItem('admin_key');

            // Step 1: Refund all OMENX
            setStep(1);
            const refundRes = await base44.functions.invoke('refundAllOmenx', {
                adminKey,
                confirm_refund: true,
            });
            if (refundRes.data?.error) throw new Error(`Refund failed: ${refundRes.data.error}`);

            // Step 2: Wipe all player data
            setStep(2);
            const wipeRes = await base44.functions.invoke('resetAllPlayerData', {
                adminKey,
                confirm: 'RESET_ALL_PLAYER_DATA',
            });
            if (wipeRes.data?.error) throw new Error(`Wipe failed: ${wipeRes.data.error}`);
            
            // Done
            setStep(3);
            setResult({
                refunded: refundRes.data?.refunded || 0,
                totalRefunded: refundRes.data?.totalAmount || 0,
                wiped: wipeRes.data?.deleted || 0,
            });
        } catch (e) {
            setError(e.message);
            setLoading(false);
        }
    };

    if (step === 3 && result) {
        return (
            <div className="bg-slate-900 border-2 border-green-600 p-6 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                    <h3 className="text-xl font-bold text-green-400">✓ Reset Complete</h3>
                </div>
                <div className="space-y-2 text-sm text-slate-300 mb-6">
                    <p>Refunded {result.refunded} wallets ({result.totalRefunded} OMENX total)</p>
                    <p>Deleted {result.wiped} player records</p>
                    <p className="text-green-400 font-bold mt-4">Game is ready to restart fresh.</p>
                </div>
                <button
                    onClick={() => { setStep(0); setResult(null); }}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded font-bold text-sm"
                >
                    Reset Form
                </button>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border-2 border-red-700 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <h3 className="text-xl font-bold text-red-400">🚨 FULL RESET</h3>
            </div>

            {step === 0 && (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        This will:
                    </p>
                    <ul className="text-sm text-slate-400 space-y-1 ml-4">
                        <li>✓ Refund all OMENX to all players</li>
                        <li>✓ Delete ALL player saves, scores, squads, and data</li>
                        <li>✓ Clear the game to fresh state</li>
                    </ul>
                    <p className="text-red-400 font-bold text-sm mt-4">⚠️ THIS CANNOT BE UNDONE</p>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button
                        onClick={() => setDialogOpen(true)}
                        disabled={loading}
                        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-6 py-3 rounded font-bold flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {loading ? 'Processing...' : 'CONFIRM FULL RESET'}
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={dialogOpen}
                onClose={() => !loading && setDialogOpen(false)}
                onConfirm={handleReset}
                busy={loading}
                title="🚨 FULL RESET — refund + wipe"
                description="Refunds every OMENX spent across all wallets, then permanently deletes all PlayerSaves, RunScores, Squads, and game data. This cannot be undone."
                items={[
                    'All players will receive their lifetime OMENX spend back',
                    'Every player save & leaderboard score will be deleted',
                    'Squads, messages, raids, and bounties will be wiped',
                ]}
                confirmText="FULL_RESET"
                confirmLabel="Execute full reset"
            />

            {step === 1 && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
                    <p className="text-yellow-400 font-bold">Refunding all OMENX...</p>
                </div>
            )}

            {step === 2 && (
                <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                    <p className="text-orange-400 font-bold">Wiping all data...</p>
                </div>
            )}
        </div>
    );
}