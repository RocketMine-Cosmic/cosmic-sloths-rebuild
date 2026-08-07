import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Trash2, AlertTriangle } from 'lucide-react';

// One-click cleanup: deletes ALL TokenSpendLog rows except the current ISO week.
// Pool totals live on TokenPool rows so the per-row history is dead weight once
// the period is closed. Server pages through 50 rows per call; this loops until
// the server reports done=true or the user hits Stop.
//
// IMPORTANT: this is irreversible. Trigger only after confirming current period
// is fine. Owner-only on the server side.

const PAUSE_MS = 800;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function AdminCleanupSpendLogs() {
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [progress, setProgress] = useState(null); // { deleted, scanned, currentWeek }
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const cancelRef = useRef(false);

    const run = async () => {
        setConfirming(false);
        setBusy(true);
        setError('');
        setMsg('');
        setProgress({ deleted: 0, scanned: 0, currentWeek: '' });
        cancelRef.current = false;

        let totalDeleted = 0;
        let totalScanned = 0;
        let currentWeek = '';
        const MAX_ITERS = 1000;
        let iter = 0;

        try {
            while (iter < MAX_ITERS) {
                iter++;
                if (cancelRef.current) {
                    setMsg(`⏸ Stopped. Deleted ${totalDeleted.toLocaleString()} rows. Run again to continue.`);
                    return;
                }
                const res = await base44.functions.invoke('cleanupOldSpendLogs', {});
                if (res.data?.error) throw new Error(res.data.error);
                const d = res.data;
                totalDeleted += d.deleted || 0;
                totalScanned += d.scanned || 0;
                currentWeek = d.currentWeek || currentWeek;
                setProgress({ deleted: totalDeleted, scanned: totalScanned, currentWeek });

                if (d.done) {
                    setMsg(`✓ Done. Deleted ${totalDeleted.toLocaleString()} old spend log rows. Only ${currentWeek} remains.`);
                    return;
                }
                await sleep(PAUSE_MS);
            }
            setMsg(`Deleted ${totalDeleted.toLocaleString()} so far. Hit safety cap — run again to continue.`);
        } catch (e) {
            setError(e.message || 'Cleanup failed');
        } finally {
            setBusy(false);
        }
    };

    const stop = () => { cancelRef.current = true; };

    return (
        <div className="bg-[#0b0416]/80 border border-red-900/40 rounded-xl p-4">
            <h2 className="text-base font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Trash2 size={16} /> Purge Old Spend Logs
            </h2>
            <div className="text-xs text-slate-400 mb-3 leading-relaxed">
                Deletes every <code className="text-slate-300">TokenSpendLog</code> row from <strong>closed periods</strong> (any week_id that isn't the current ISO week). Pool totals on <code className="text-slate-300">TokenPool</code> are untouched — payouts and historical pool data are unaffected.
                <span className="block mt-1 text-amber-400">⚠ Irreversible. Run only when current week's data is the only data you need to keep.</span>
            </div>

            <div className="flex gap-2 flex-wrap">
                {!busy && (
                    <button onClick={() => setConfirming(true)}
                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                        <AlertTriangle size={14} /> Purge Closed Periods
                    </button>
                )}
                {busy && (
                    <button onClick={stop}
                        className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-1.5 rounded font-bold text-sm">
                        ⏸ Stop
                    </button>
                )}
            </div>

            {progress && (
                <div className="mt-3 bg-slate-900/60 border border-red-700/30 rounded-lg p-3 text-xs font-mono">
                    <div className="text-slate-400">
                        Deleted: <span className="text-red-300 font-bold">{progress.deleted.toLocaleString()}</span>
                        <span className="text-slate-600 mx-2">•</span>
                        Scanned: <span className="text-slate-300">{progress.scanned.toLocaleString()}</span>
                        {progress.currentWeek && <>
                            <span className="text-slate-600 mx-2">•</span>
                            Keeping: <span className="text-emerald-400">{progress.currentWeek}</span>
                        </>}
                    </div>
                </div>
            )}

            {error && <div className="mt-3 text-sm font-mono text-red-400">✗ {error}</div>}
            {msg && <div className="mt-3 text-sm font-mono text-emerald-400">{msg}</div>}

            {confirming && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-red-700 rounded-xl p-5 max-w-md w-full">
                        <h3 className="text-lg font-bold text-red-400 mb-2 flex items-center gap-2">
                            <AlertTriangle size={18} /> Confirm Purge
                        </h3>
                        <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                            This will permanently delete <strong>all TokenSpendLog rows</strong> from previous weeks. The current ISO week stays. TokenPool totals are unaffected. This cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirming(false)} className="px-4 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold">Cancel</button>
                            <button onClick={run} className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-bold">Yes, purge</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}