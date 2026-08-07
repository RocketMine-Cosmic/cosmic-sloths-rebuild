import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ConfirmDialog from './ConfirmDialog';

export default function AdminRefundOmenx({ walletAddress }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [preview, setPreview] = useState(null);

    const handlePreview = async () => {
        setLoading(true);
        setError(null);
        setPreview(null);
        try {
            const spendLogs = await base44.entities.TokenSpendLog.list('', 10000);
            const refundMap = {};
            spendLogs.forEach(log => {
                if (log.wallet_address) {
                    refundMap[log.wallet_address] = {
                        amount: (refundMap[log.wallet_address]?.amount || 0) + (log.amount || 0),
                        player_name: log.player_name
                    };
                }
            });
            const payments = Object.entries(refundMap).map(([walletAddress, data]) => ({
                walletAddress,
                amount: Math.floor(data.amount),
                player_name: data.player_name
            }));
            const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
            setPreview({ payments, totalAmount, count: payments.length });
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefund = async () => {
        setLoading(true);
        setError(null);
        const adminKey = sessionStorage.getItem('admin_key');
        try {
            const res = await base44.functions.invoke('refundAllOmenx', {
                adminKey,
                confirm_refund: true,
            });
            if (res.data?.error) {
                setError(res.data.error);
            } else {
                setResult(res.data);
                setDialogOpen(false);
                setPreview(null);
            }
        } catch (e) {
            setError(e.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-900 border-2 border-orange-600 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-orange-500" />
                <h3 className="text-lg font-bold text-orange-400">⚠️ Refund All OMENX</h3>
            </div>

            {result ? (
                <div className="space-y-2 text-sm">
                    <p className="text-green-400 font-bold">✓ Refund Complete</p>
                    <p>Wallets refunded: {result.refunded}</p>
                    <p>Total OMENX: {result.totalAmount}</p>
                    {result.failedWallets && (
                        <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-xs">
                            <p className="font-bold mb-2">Failed wallets ({result.failedCount}):</p>
                            {result.failedWallets.map((w, i) => (
                                <p key={i}>{w.walletAddress}: {w.reason}</p>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => { setResult(null); setDialogOpen(false); }}
                        className="mt-4 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded text-xs font-bold"
                    >
                        Reset
                    </button>
                </div>
            ) : preview ? (
                <div className="space-y-4">
                    <div className="bg-slate-800/50 rounded-lg p-4 max-h-80 overflow-y-auto">
                        <p className="text-sm font-bold text-slate-300 mb-3">
                            Wallets to refund: {preview.count} | Total: {preview.totalAmount} OMENX
                        </p>
                        <div className="space-y-1 text-xs font-mono">
                            {preview.payments.slice(0, 50).map((p, i) => (
                                <div key={i} className="flex justify-between text-slate-400 border-b border-slate-700 pb-1">
                                    <span>{p.player_name || p.walletAddress.slice(0, 8)}</span>
                                    <span>{p.amount} OMENX</span>
                                </div>
                            ))}
                            {preview.payments.length > 50 && (
                                <p className="text-slate-500 text-center pt-2">... and {preview.payments.length - 50} more</p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setDialogOpen(true)}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded font-bold text-sm transition-colors"
                        >
                            Execute Refund
                        </button>
                        <button
                            onClick={() => setPreview(null)}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded font-bold text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-slate-300 text-sm">Calculates total OMENX spent by all players and issues refunds via OmenX API.</p>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button
                        onClick={handlePreview}
                        disabled={loading}
                        className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2 rounded font-bold text-sm flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {loading ? 'Scanning...' : 'Preview Refunds'}
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={dialogOpen}
                onClose={() => !loading && setDialogOpen(false)}
                onConfirm={handleRefund}
                busy={loading}
                title="Execute OMENX refund"
                description={preview ? `Send ${preview.totalAmount.toLocaleString()} OMENX back to ${preview.count} wallets via the OmenX payment API. This cannot be undone.` : 'Refund all spent OMENX to all players.'}
                items={preview ? [
                    `${preview.count} wallets will be paid`,
                    `${preview.totalAmount.toLocaleString()} OMENX total`,
                    'Failures will be reported per-wallet in the result',
                ] : []}
                confirmText="REFUND_ALL"
                confirmLabel="Send refunds"
            />
        </div>
    );
}