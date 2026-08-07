import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Loader2, CheckCircle2, Eye, Play } from 'lucide-react';

// One-shot UI for backfilling missed weekly staff payouts.
// Calls functions/backfillStaffPayouts. Idempotent — safe to re-run.
export default function AdminStaffPayoutBackfill() {
    const [periodInput, setPeriodInput] = useState('');
    const [dryResult, setDryResult] = useState(null);
    const [runResult, setRunResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const buildPayload = (dryRun) => {
        const ids = periodInput.split(',').map(s => s.trim()).filter(Boolean);
        return {
            dryRun,
            ...(ids.length > 0 ? { periodIds: ids } : {}),
        };
    };

    const runDry = async () => {
        setBusy(true); setError(null); setDryResult(null); setRunResult(null);
        try {
            const res = await base44.functions.invoke('backfillStaffPayouts', buildPayload(true));
            if (res.data?.error) throw new Error(res.data.error);
            setDryResult(res.data);
        } catch (e) {
            setError(e?.message || 'Dry run failed');
        } finally {
            setBusy(false);
        }
    };

    const runReal = async () => {
        setBusy(true); setError(null); setRunResult(null);
        try {
            const res = await base44.functions.invoke('backfillStaffPayouts', buildPayload(false));
            if (res.data?.error) throw new Error(res.data.error);
            setRunResult(res.data);
            setDryResult(null);
            setConfirming(false);
        } catch (e) {
            setError(e?.message || 'Backfill failed');
        } finally {
            setBusy(false);
        }
    };

    const totalOwed = (dryResult?.results || [])
        .reduce((s, r) => s + (r.total_owed || 0), 0);
    const totalPaid = (runResult?.results || [])
        .reduce((s, r) => s + (r.total_paid || 0), 0);

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Staff Payout Backfill
            </h3>
            <p className="text-xs text-slate-400 mb-3">
                Pays staff their weekly cuts for closed pools that were missed by the old broken distributor.
                Idempotent — periods with existing <span className="font-mono text-slate-300">staff_weekly</span> logs are skipped.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                    type="text"
                    placeholder="Period IDs (e.g. 2026-W18, 2026-W17) — leave blank for ALL closed weeks"
                    value={periodInput}
                    onChange={e => setPeriodInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                    onClick={runDry}
                    disabled={busy}
                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-3 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-1.5"
                >
                    {busy && !confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                    Preview
                </button>
            </div>

            {error && (
                <div className="bg-red-950/50 border border-red-700/50 rounded-md p-2 text-xs text-red-300 mb-3">
                    {error}
                </div>
            )}

            {dryResult && (
                <div className="bg-slate-900/50 border border-slate-700 rounded-md p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-slate-400">
                            {dryResult.count} pool{dryResult.count !== 1 ? 's' : ''} examined • Total to pay: <span className="font-mono font-bold text-amber-300">{totalOwed.toLocaleString()} OMENX</span>
                        </div>
                        {totalOwed > 0 && !confirming && (
                            <button
                                onClick={() => setConfirming(true)}
                                disabled={busy}
                                className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5"
                            >
                                <Play className="w-3 h-3" /> Run Backfill
                            </button>
                        )}
                        {confirming && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setConfirming(false)}
                                    className="text-xs text-slate-400 hover:text-white px-2 py-1"
                                >Cancel</button>
                                <button
                                    onClick={runReal}
                                    disabled={busy}
                                    className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5"
                                >
                                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                                    Confirm — Pay {totalOwed.toLocaleString()} OMENX
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {(dryResult.results || []).map((r, i) => (
                            <div key={i} className="bg-slate-950/50 border border-slate-800 rounded p-2 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono font-bold text-slate-200">{r.period_id}</span>
                                    {r.skipped ? (
                                        <span className="text-slate-500 italic">skipped: {r.skipped}</span>
                                    ) : r.error ? (
                                        <span className="text-red-400">error: {r.error}</span>
                                    ) : (
                                        <span className="text-amber-300 font-mono">
                                            {r.staff_count} staff • {(r.total_owed || 0).toLocaleString()} OMENX
                                        </span>
                                    )}
                                </div>
                                {r.payments && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1 pl-2 border-l border-slate-800">
                                        {r.payments.map((p, j) => (
                                            <div key={j} className="flex justify-between text-[11px] text-slate-400">
                                                <span className="truncate">{p.player_name}</span>
                                                <span className="font-mono text-amber-300">{p.amount.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {runResult && (
                <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2 text-emerald-300 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Backfill complete
                    </div>
                    <div className="text-xs text-slate-300 mb-2">
                        Paid <span className="font-mono font-bold text-emerald-300">{totalPaid.toLocaleString()} OMENX</span> across {runResult.count} pool{runResult.count !== 1 ? 's' : ''}.
                    </div>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        {(runResult.results || []).map((r, i) => (
                            <div key={i} className="text-[11px] font-mono text-slate-400 flex justify-between border-b border-slate-800/50 py-1">
                                <span>{r.period_id}</span>
                                <span>
                                    {r.skipped ? <span className="text-slate-500">skip: {r.skipped}</span>
                                        : r.error ? <span className="text-red-400">err: {r.error}</span>
                                        : <span className="text-emerald-300">{r.paid} paid • {(r.total_paid || 0).toLocaleString()} OMENX</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}