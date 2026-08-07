import React, { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AdminTokenSpendLogBackfill() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleBackfill = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await base44.functions.invoke('backfillTokenSpendLogWallets', {});
            if (res.data?.error) {
                setError(res.data.error);
            } else {
                setResult(res.data);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    if (result) {
        return (
            <div className="bg-slate-900 border-2 border-green-600 p-6 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                    <h3 className="text-xl font-bold text-green-400">✓ Backfill Complete</h3>
                </div>
                <div className="space-y-2 text-sm text-slate-300 mb-6">
                    <p>Updated: {result.updated} logs</p>
                    <p>Failed: {result.failed} logs</p>
                    <p>Total needed: {result.totalNeeded}</p>
                </div>
                <button
                    onClick={() => { setResult(null); }}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded font-bold text-sm"
                >
                    Reset
                </button>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border-2 border-cyan-600 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-cyan-400 mb-4">🔄 Backfill Token Spend Logs</h3>
            <p className="text-slate-300 text-sm mb-6">
                Populates missing <code className="bg-slate-800 px-2 py-1 rounded text-xs">wallet_address</code> fields in TokenSpendLog records using wallet data from RunScore.
            </p>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
                onClick={handleBackfill}
                disabled={loading}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-3 rounded font-bold flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Backfilling...' : 'Start Backfill'}
            </button>
        </div>
    );
}