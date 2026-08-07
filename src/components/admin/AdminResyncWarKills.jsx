import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Swords, RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Admin tool — Resync current-week SquadWar.kills_a/kills_b from RunScore.
 * Fixes silent drift caused by swallowed errors during saveScore.SquadWar.update.
 * Always supports dry-run preview first.
 */
export default function AdminResyncWarKills() {
    const [weekId, setWeekId] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const run = async (dryRun) => {
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const res = await base44.functions.invoke('resyncSquadWarKills', {
                weekId: weekId.trim() || undefined,
                dryRun,
            });
            setResult(res.data);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Resync failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 md:p-5">
            <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-red-950/40 border border-red-700/40">
                    <Swords className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base md:text-lg font-bold text-white">Resync Squad War Kills</h3>
                    <p className="text-xs text-slate-400 leading-snug mt-0.5">
                        Recomputes <code className="bg-slate-800 px-1 rounded">SquadWar.kills_a/kills_b</code> for unresolved wars in the given week
                        by summing war-eligible kills from <code className="bg-slate-800 px-1 rounded">RunScore</code> across each squad's current members.
                        Fixes drift when a <code className="bg-slate-800 px-1 rounded">saveScore</code> war update silently failed.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center mb-3">
                <label className="text-xs text-slate-400 uppercase tracking-wider">Week ID</label>
                <input
                    type="text"
                    value={weekId}
                    onChange={(e) => setWeekId(e.target.value)}
                    placeholder="(blank = current week, e.g. 2026-W21)"
                    className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 outline-none"
                />
            </div>

            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => run(true)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Dry Run
                </button>
                <button
                    onClick={() => {
                        if (window.confirm('Write the recomputed kill counts to SquadWar rows? This is reversible by running again later but will change the live war board immediately.')) {
                            run(false);
                        }
                    }}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                    <AlertTriangle className="w-3.5 h-3.5" /> Apply Fix
                </button>
            </div>

            {error && (
                <div className="mt-3 bg-red-950/40 border border-red-700/60 rounded p-2 text-xs text-red-200">
                    ❌ {error}
                </div>
            )}

            {result && (
                <div className="mt-3">
                    <div className="text-xs text-slate-400 mb-2">
                        Week <strong className="text-white">{result.weekId}</strong> — scanned {result.scanned} war{result.scanned === 1 ? '' : 's'},
                        {result.dryRun ? <> would update <strong className="text-amber-300">{result.changes?.length || 0}</strong></> : <> updated <strong className="text-emerald-300">{result.updated}</strong></>}.
                    </div>
                    {result.changes?.length > 0 ? (
                        <div className="space-y-1.5 max-h-80 overflow-y-auto">
                            {result.changes.map((c, i) => (
                                <div key={i} className="bg-slate-950/60 border border-slate-700 rounded p-2 text-xs">
                                    <div className="font-bold text-white mb-1">
                                        {c.squad_a_name || '—'} <span className="text-slate-500">vs</span> {c.squad_b_name || '—'}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div className={c.kills_a.delta !== 0 ? 'text-amber-300' : 'text-slate-400'}>
                                            A: {c.kills_a.old} → <strong>{c.kills_a.new}</strong>
                                            {c.kills_a.delta !== 0 && <span className="ml-1">({c.kills_a.delta > 0 ? '+' : ''}{c.kills_a.delta})</span>}
                                        </div>
                                        <div className={c.kills_b.delta !== 0 ? 'text-amber-300' : 'text-slate-400'}>
                                            B: {c.kills_b.old} → <strong>{c.kills_b.new}</strong>
                                            {c.kills_b.delta !== 0 && <span className="ml-1">({c.kills_b.delta > 0 ? '+' : ''}{c.kills_b.delta})</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-emerald-400">✅ All wars already in sync — nothing to fix.</div>
                    )}
                </div>
            )}
        </div>
    );
}