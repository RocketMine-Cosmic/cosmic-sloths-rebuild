import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, AlertCircle } from 'lucide-react';

// Re-syncs RunScore.player_name from PlayerSave.player_name for any rows where
// the leaderboard would otherwise show a stale legacy name (e.g. OAuth full
// name "Jay S" instead of the user's chosen pilot name).

export default function AdminBackfillNames() {
    const [scanning, setScanning] = useState(false);
    const [running, setRunning] = useState(false);
    const [scan, setScan] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const doScan = async () => {
        setScanning(true);
        setError('');
        setScan(null);
        setResult(null);
        try {
            const res = await base44.functions.invoke('backfillRunScoreNames', { dryRun: true });
            if (res.data?.error) throw new Error(res.data.error);
            setScan(res.data);
        } catch (e) {
            setError(e.message || 'Scan failed');
        } finally {
            setScanning(false);
        }
    };

    const doFix = async () => {
        if (!confirm(`Update ${scan?.mismatches ?? 0} RunScore record(s) to the correct pilot names?`)) return;
        setRunning(true);
        setError('');
        try {
            const res = await base44.functions.invoke('backfillRunScoreNames', { dryRun: false });
            if (res.data?.error) throw new Error(res.data.error);
            setResult(res.data);
            setScan(null);
        } catch (e) {
            setError(e.message || 'Backfill failed');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest">🔤 Fix Leaderboard Names</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Re-syncs <code className="text-amber-300">RunScore.player_name</code> from each player's <code className="text-amber-300">PlayerSave.player_name</code> (the name they chose in their Profile).
                Use this if the leaderboard is showing legacy OAuth full names instead of pilot callsigns.
            </p>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={doScan}
                    disabled={scanning || running}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider transition-colors border border-slate-700"
                >
                    <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
                    {scanning ? 'Scanning…' : 'Scan for Mismatches'}
                </button>
                {scan && scan.mismatches > 0 && (
                    <button
                        onClick={doFix}
                        disabled={running}
                        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider transition-colors"
                    >
                        {running ? 'Fixing…' : `Fix ${scan.mismatches} Record${scan.mismatches === 1 ? '' : 's'}`}
                    </button>
                )}
            </div>

            {error && (
                <div className="mt-4 flex items-center gap-2 bg-red-950/40 border border-red-800/50 text-red-300 px-3 py-2 rounded text-xs">
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            {scan && (
                <div className="mt-4 bg-slate-900/60 border border-slate-700 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex justify-between text-slate-400">
                        <span>Recent RunScores scanned</span>
                        <span className="font-mono text-white">{scan.totalRuns}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                        <span>Stale names found</span>
                        <span className={`font-mono font-bold ${scan.mismatches > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{scan.mismatches}</span>
                    </div>
                    {scan.mismatches > 0 && scan.preview?.length > 0 && (
                        <div className="mt-2">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Preview (first {scan.preview.length})</div>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {scan.preview.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 font-mono text-[11px]">
                                        <span className="text-slate-500 truncate">{p.wallet.slice(0, 6)}…{p.wallet.slice(-4)}</span>
                                        <span className="text-red-400 line-through truncate max-w-[140px]">{p.from || '(blank)'}</span>
                                        <span className="text-slate-500">→</span>
                                        <span className="text-emerald-400 truncate max-w-[140px]">{p.to}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {result && (
                <div className="mt-4 bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-3 text-xs">
                    <div className="font-bold text-emerald-300 mb-1">✓ Done</div>
                    <div className="text-slate-300">
                        Updated <span className="font-mono font-bold text-emerald-400">{result.updated}</span> of {result.mismatches} records
                        {result.failed > 0 && <span className="text-red-400"> ({result.failed} failed)</span>}.
                    </div>
                </div>
            )}
        </div>
    );
}