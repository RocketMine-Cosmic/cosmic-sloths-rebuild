import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Play, Eye } from 'lucide-react';

/**
 * One-shot remediation tool for the W19 (2026-W19) weekly payout dilution bug.
 *
 * Background: that week's distribution paid the top ~64 players (maxRank misconfigured),
 * which diluted the top 45's share. This panel calls `topupWeeklyPayout` to:
 *  - dryRun: show the recomputed correct top-45 amounts vs what was actually paid
 *  - execute: pay the shortfall to each player who was underpaid
 *
 * The function is resumable (1 chunk = 20 wallets per invocation) because the OmenX
 * rewards API is currently flaky (502s). Just hit "Run next chunk" until
 * `remaining_after_run === 0`. It's idempotent — wallets that already received a
 * top-up are skipped on re-runs.
 */
export default function AdminWeeklyTopup() {
    const [periodId, setPeriodId] = useState('2026-W19');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const run = async (dryRun) => {
        if (busy) return;
        setBusy(true);
        setError('');
        setResult(null);
        try {
            const res = await base44.functions.invoke('topupWeeklyPayout', {
                period_id: periodId,
                dryRun,
                maxChunks: 1,
            });
            setResult(res.data);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-slate-900/60 border border-amber-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-amber-300 uppercase tracking-wider text-sm">Weekly Payout Top-Up (Dilution Fix)</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
                Fixes weekly distributions that paid beyond rank 45 (diluting top-45 share). Recomputes correct top-45 amounts and pays the
                shortfall. Processes <span className="font-mono text-amber-300">1 chunk = 20 wallets per run</span> — re-run until
                <span className="font-mono text-amber-300"> remaining_after_run = 0</span>. Idempotent: already-paid wallets are skipped.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-slate-400 font-bold">Period:</label>
                <input
                    type="text"
                    value={periodId}
                    onChange={e => setPeriodId(e.target.value.trim())}
                    placeholder="2026-W19"
                    className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 text-xs font-mono w-32 focus:outline-none focus:border-amber-500"
                />
                <button
                    onClick={() => run(true)}
                    disabled={busy || !periodId}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-600 px-3 py-1 rounded text-xs font-bold transition-colors"
                >
                    <Eye size={12} /> Dry Run
                </button>
                <button
                    onClick={() => run(false)}
                    disabled={busy || !periodId}
                    className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                >
                    <Play size={12} /> Run Next Chunk (20)
                </button>
                {busy && <span className="text-xs text-amber-300 animate-pulse">Running… (up to 3 min — OmenX is slow)</span>}
            </div>

            {error && (
                <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs p-2 rounded font-mono">
                    Error: {error}
                </div>
            )}

            {result && (
                <div className="bg-slate-950/60 border border-slate-700 rounded p-3 space-y-1.5">
                    {result.dryRun ? (
                        <>
                            <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1">Dry Run — Preview Only</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                                <div className="text-slate-400">Pool total spent:</div>
                                <div className="text-white">{result.pool_total_spent?.toLocaleString()}</div>
                                <div className="text-slate-400">Reward pool (20%):</div>
                                <div className="text-white">{result.reward_pool?.toLocaleString()}</div>
                                <div className="text-slate-400">Correct top-45 total:</div>
                                <div className="text-white">{result.correct_top45_total?.toLocaleString()}</div>
                                <div className="text-slate-400">Wallets to top up:</div>
                                <div className="text-amber-300">{result.topup_count}</div>
                                <div className="text-slate-400">Total OMENX to pay:</div>
                                <div className="text-amber-300 font-bold">{result.topup_total?.toLocaleString()}</div>
                            </div>
                            {result.topups?.length > 0 && (
                                <div className="mt-2 max-h-64 overflow-y-auto border-t border-slate-800 pt-2">
                                    <table className="w-full text-[10px] font-mono">
                                        <thead className="text-slate-500 uppercase">
                                            <tr><th className="text-left">Rank</th><th className="text-left">Player</th><th className="text-right">Correct</th><th className="text-right">Paid</th><th className="text-right">Top-up</th></tr>
                                        </thead>
                                        <tbody>
                                            {result.topups.map(t => (
                                                <tr key={t.walletAddress} className="border-t border-slate-900">
                                                    <td className="text-cyan-300">#{t.rank}</td>
                                                    <td className="text-slate-300 truncate max-w-[120px]">{t.player_name}</td>
                                                    <td className="text-right text-slate-400">{t.correct_amount?.toLocaleString()}</td>
                                                    <td className="text-right text-slate-500">{t.already_paid?.toLocaleString()}</td>
                                                    <td className="text-right text-amber-300 font-bold">+{t.amount?.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="text-xs font-bold text-green-300 uppercase tracking-wider mb-1">Chunk Complete ✓</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                                <div className="text-slate-400">Paid this run:</div>
                                <div className="text-green-300 font-bold">{result.paid_this_run}</div>
                                <div className="text-slate-400">Remaining after run:</div>
                                <div className={result.remaining_after_run === 0 ? 'text-green-300 font-bold' : 'text-amber-300 font-bold'}>
                                    {result.remaining_after_run}
                                </div>
                                <div className="text-slate-400">Total top-up amount:</div>
                                <div className="text-white">{result.topup_total?.toLocaleString()} OMENX</div>
                                <div className="text-slate-400">Last tx id:</div>
                                <div className="text-slate-300 truncate">{result.last_tx_id || '—'}</div>
                            </div>
                            {result.remaining_after_run > 0 && (
                                <div className="text-xs text-amber-300 mt-2">⚠ Re-run to process the next chunk.</div>
                            )}
                            {result.remaining_after_run === 0 && (
                                <div className="text-xs text-green-300 mt-2">✓ All top-ups complete for this period.</div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}