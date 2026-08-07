import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, AlertTriangle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useAvailablePeriods, getCurrentWeekId } from './useAvailablePeriods';

// One-click cleanup: keeps each player's top N scores per (week, mode) and
// archives the rest. Always runs a dry-run first so you can see what it
// will do before committing. Always takes a backup snapshot before executing.
//
// Execution is batched (100 deletes per call, ~1500ms pause between batches)
// so we don't trip rate limits when the queue is large (4k+). Each batch
// re-scans the full RunScore table (cheaper than client tracking offsets)
// so larger batches mean fewer scans = less rate-limit pressure.

const BATCH_SIZE = 100;
const PAUSE_MS = 1500;

async function autoSnapshot(notes) {
    try {
        await base44.functions.invoke('backupData', {
            adminKey: sessionStorage.getItem('admin_key') || undefined,
            backup_notes: `[auto] ${notes}`,
        });
    } catch (e) { console.warn('[autoSnapshot]', e.message); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function AdminCleanupTopScores({ walletAddress }) {
    const [keepN, setKeepN] = useState(1);
    const [period, setPeriod] = useState('all');
    const { weeks } = useAvailablePeriods(walletAddress);
    const [busy, setBusy] = useState(false);
    const [dryResult, setDryResult] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [progress, setProgress] = useState(null); // { processed, total, succeeded, failed }
    const cancelRef = useRef(false);

    const runDry = async () => {
        setBusy(true); setError(''); setMsg(''); setDryResult(null); setProgress(null);
        try {
            const res = await base44.functions.invoke('cleanupKeepTopScoresPerPlayer', {
                keepN, periodFilter: period, dryRun: true,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setDryResult(res.data.summary);
        } catch (e) { setError(e.message); }
        setBusy(false);
    };

    const execute = async () => {
        // Close the confirm dialog immediately so the long-running loop is visible
        // (progress bar lives on the panel, not the modal). busy stays true until
        // the loop finishes so the buttons remain locked.
        setConfirm(false);
        setBusy(true); setError(''); setMsg('');
        cancelRef.current = false;
        try {
            await autoSnapshot(`pre-cleanup-keep-top-${keepN} period=${period}`);

            let totalSucceeded = 0;
            let totalFailed = 0;
            const initialTotal = dryResult?.totalToDelete || 0;
            setProgress({ processed: 0, total: initialTotal, succeeded: 0, failed: 0 });

            // Loop: each server call recomputes the remaining queue, slices the
            // first BATCH_SIZE rows, archives them, and returns. We keep calling
            // until either the queue is empty (batchSucceeded===0 + batchFailed===0)
            // or the user hits Stop.
            // Hard cap at 200 iterations (= 10,000 rows) as a safety net.
            let iterations = 0;
            const MAX_ITERS = 200;
            while (iterations < MAX_ITERS) {
                iterations++;
                if (cancelRef.current) {
                    setMsg(`⏸ Stopped. Archived ${totalSucceeded} so far. Run again to continue.`);
                    return;
                }
                const res = await base44.functions.invoke('cleanupKeepTopScoresPerPlayer', {
                    keepN, periodFilter: period, dryRun: false,
                    batchSize: BATCH_SIZE, offset: 0,
                    adminKey: sessionStorage.getItem('admin_key') || undefined,
                });
                if (res.data?.error) throw new Error(res.data.error);

                const batchSucceeded = res.data.batchSucceeded || 0;
                const batchFailed = res.data.batchFailed || 0;
                totalSucceeded += batchSucceeded;
                totalFailed += batchFailed;

                // The "total" we display is the larger of: what we knew at start,
                // or what we've already processed (so the bar never goes backwards
                // even if new scores got submitted during the run).
                const remaining = res.data.totalToDelete || 0;
                const total = Math.max(initialTotal, totalSucceeded + totalFailed + remaining);
                setProgress({
                    processed: totalSucceeded + totalFailed,
                    total,
                    succeeded: totalSucceeded,
                    failed: totalFailed,
                });

                // Done when this batch did nothing (queue is empty).
                if (batchSucceeded === 0 && batchFailed === 0) {
                    setMsg(`✓ Archived ${totalSucceeded.toLocaleString()} duplicate score(s).${totalFailed > 0 ? ` (${totalFailed} failed)` : ''} Restorable for 7 days via Recently Deleted Scores.`);
                    setDryResult(null);
                    return;
                }

                await sleep(PAUSE_MS);
            }
            setMsg(`✓ Archived ${totalSucceeded.toLocaleString()} so far. Hit the safety cap — run again to continue.`);
        } catch (e) {
            setError(e.message || 'Cleanup failed');
        } finally {
            setBusy(false);
        }
    };

    const stop = () => { cancelRef.current = true; };

    const pct = progress && progress.total > 0
        ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
        : 0;

    return (
        <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Sparkles size={16} /> Keep Top Scores Per Player
            </h2>
            <div className="text-xs text-slate-400 mb-4 leading-relaxed">
                Keeps each player's TOP <span className="text-cyan-300 font-bold">{keepN}</span> score(s) per (week × mode) and archives the rest. Modes are tracked separately ({"\u2068"}Normal vs Endless{"\u2069"}).
                <span className="text-amber-400"> Use this if the leaderboard is missing players</span> — duplicate runs from a few accounts can push real players out of the top 100. Archived rows are recoverable for 7 days.
                <span className="block mt-1 text-slate-500">Runs in batches of {BATCH_SIZE} with a {PAUSE_MS}ms pause to stay under rate limits.</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase">Keep top N per player per period</label>
                    <select value={keepN} onChange={e => { setKeepN(Number(e.target.value)); setDryResult(null); }} style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-cyan-500">
                        {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>Top {n}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] text-slate-500 uppercase">Scope</label>
                    <select value={period} onChange={e => { setPeriod(e.target.value); setDryResult(null); }} style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-cyan-500 font-mono">
                        <option value="all">All weeks</option>
                        {weeks.map(w => <option key={w} value={w}>{w}{w === getCurrentWeekId() ? ' (current)' : ''}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex gap-2 flex-wrap">
                <button onClick={runDry} disabled={busy}
                    className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm">
                    {busy && !progress ? '…' : 'Preview (Dry-Run)'}
                </button>
                {dryResult && dryResult.totalToDelete > 0 && !busy && (
                    <button onClick={() => setConfirm(true)} disabled={busy}
                        className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                        <AlertTriangle size={14} /> Execute Cleanup ({dryResult.totalToDelete.toLocaleString()})
                    </button>
                )}
                {busy && progress && (
                    <button onClick={stop}
                        className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-1.5 rounded font-bold text-sm">
                        ⏸ Stop
                    </button>
                )}
            </div>

            {progress && (
                <div className="mt-3 bg-slate-900/60 border border-cyan-700/40 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                        <span className="text-slate-400">
                            <span className="text-cyan-300 font-bold">{progress.succeeded.toLocaleString()}</span>
                            <span className="text-slate-600"> / </span>
                            <span>{progress.total.toLocaleString()}</span>
                            {progress.failed > 0 && <span className="text-red-400 ml-2">({progress.failed} failed)</span>}
                        </span>
                        <span className="text-cyan-300 font-bold">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            )}

            {error && <div className="mt-3 text-sm font-mono text-red-400">✗ {error}</div>}
            {msg && <div className="mt-3 text-sm font-mono text-emerald-400">{msg}</div>}

            {dryResult && !busy && (
                <div className="mt-4 bg-slate-900/60 border border-cyan-700/40 rounded-lg p-3 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <Stat label="Scanned" value={dryResult.scanned.toLocaleString()} />
                        <Stat label="(player×week×mode)" value={dryResult.buckets.toLocaleString()} />
                        <Stat label="Buckets with extras" value={dryResult.bucketsWithExtras.toLocaleString()} accent />
                        <Stat label="Will delete" value={dryResult.totalToDelete.toLocaleString()} accent danger />
                    </div>
                    {dryResult.totalToDelete === 0 ? (
                        <div className="text-emerald-400 text-sm font-bold">✓ Already clean — no duplicates to remove.</div>
                    ) : (
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Top affected players</div>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {dryResult.topAffected.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-slate-500 font-mono w-6">#{i+1}</span>
                                            <span className="font-bold text-white truncate">{p.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{p.owner}</span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-emerald-400 text-[10px]">keep {p.kept}</span>
                                            <span className="text-red-400 text-[10px] font-bold">−{p.deleted}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={confirm}
                onClose={() => !busy && setConfirm(false)}
                onConfirm={execute}
                busy={busy}
                title="Execute leaderboard cleanup"
                description={dryResult ? `Will archive ${dryResult.totalToDelete.toLocaleString()} duplicate score(s) across ${dryResult.uniquePlayersAffected} player(s) in batches of ${BATCH_SIZE}, keeping the top ${keepN} per player per (week × mode). A backup snapshot will be taken first. Archived rows are restorable for 7 days. You can stop at any time.` : ''}
                confirmLabel="Execute"
            />
        </div>
    );
}

function Stat({ label, value, accent, danger }) {
    return (
        <div className={`rounded p-2 border ${danger ? 'bg-red-950/30 border-red-800/50' : accent ? 'bg-cyan-950/30 border-cyan-800/50' : 'bg-slate-950/40 border-slate-800'}`}>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
            <div className={`font-mono font-bold ${danger ? 'text-red-300' : accent ? 'text-cyan-300' : 'text-white'} text-sm md:text-base`}>{value}</div>
        </div>
    );
}