import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Zap, Eye, Send } from 'lucide-react';
import { getCurrentWeekId } from './useAvailablePeriods';

// One-shot recovery tool for the W25 kill-snapshot bug (Hugo 2026-06-22).
// Calls the backfillKillSnapshot function in dry-run first, then commits.
// Default week_id = previous ISO week (the one that just rolled over).
function getPreviousWeekId() {
    const cur = getCurrentWeekId(); // e.g. "2026-W26"
    const m = cur.match(/^(\d{4})-W(\d{1,2})$/);
    if (!m) return cur;
    const year = Number(m[1]);
    const week = Number(m[2]);
    if (week > 1) return `${year}-W${String(week - 1).padStart(2, '0')}`;
    // Wrap to previous year week 52 — good enough for an admin tool.
    return `${year - 1}-W52`;
}

export default function AdminKillSnapshotBackfill() {
    const [weekId, setWeekId] = useState(getPreviousWeekId());
    const [force, setForce] = useState(false);
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleDryRun = async () => {
        setBusy(true); setError(''); setPreview(null); setResult(null);
        try {
            const res = await base44.functions.invoke('backfillKillSnapshot', { week_id: weekId, dry_run: true, force });
            setPreview(res.data);
        } catch (err) {
            setError(err?.response?.data?.error || err.message);
        }
        setBusy(false);
    };

    const handleCommit = async () => {
        if (!confirm(`Write WeeklyKillSnapshot rows for ${weekId}? This is idempotent — safe to re-run.`)) return;
        setBusy(true); setError(''); setResult(null);
        try {
            const res = await base44.functions.invoke('backfillKillSnapshot', { week_id: weekId, dry_run: false, force });
            setResult(res.data);
        } catch (err) {
            setError(err?.response?.data?.error || err.message);
        }
        setBusy(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Zap size={16} /> Kill Snapshot Backfill
            </h2>
            <p className="text-xs text-slate-400 mb-3">
                Freeze weekly sector-kill totals into <code className="text-orange-300">WeeklyKillSnapshot</code> so closed-week kill payouts include players who already rolled over to the new week. Sources (priority): SquadWarMemberKill sum → live PlayerSave counter → RunScore sum.
            </p>

            <div className="flex flex-wrap gap-2 items-end mb-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase">Week ID</label>
                    <input
                        value={weekId}
                        onChange={e => setWeekId(e.target.value.trim())}
                        placeholder="2026-W25"
                        className="bg-slate-900 border border-orange-800 text-white rounded px-3 py-1.5 text-sm font-mono w-32 focus:outline-none focus:border-orange-500"
                    />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pb-2">
                    <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} className="accent-orange-500" />
                    Force (overwrite existing if higher)
                </label>
                <button onClick={handleDryRun} disabled={busy || !weekId}
                    className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                    <Eye size={14} /> {busy ? '...' : 'Dry Run'}
                </button>
                <button onClick={handleCommit} disabled={busy || !preview}
                    title={!preview ? 'Run a dry-run first' : ''}
                    className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                    <Send size={14} /> {busy ? '...' : 'Commit Backfill'}
                </button>
            </div>

            {error && <div className="text-red-400 text-sm mb-3 font-mono">✗ {error}</div>}

            {preview && (
                <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3 mb-3">
                    <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Dry Run Summary — {preview.week_id}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                        {[
                            ['Existing snapshots', preview.existing_snapshots],
                            ['War rows', preview.war_member_rows],
                            ['War unique players', preview.war_unique_players],
                            ['Live players', preview.live_players],
                            ['RunScore players', preview.run_score_unique_players],
                            ['Total considered', preview.total_wallets_considered],
                            ['Will create', preview.actions_planned?.create],
                            ['Will update', preview.actions_planned?.update],
                        ].map(([label, val]) => (
                            <div key={label} className="bg-slate-950/60 rounded px-2 py-1 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase">{label}</div>
                                <div className="font-mono font-bold text-white">{val ?? 0}</div>
                            </div>
                        ))}
                    </div>
                    {Array.isArray(preview.preview) && preview.preview.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="text-slate-400 border-b border-slate-700/50">
                                    <tr>
                                        <th className="p-1 text-center">#</th>
                                        <th className="p-1">Player</th>
                                        <th className="p-1 text-right">Kills</th>
                                        <th className="p-1">Source</th>
                                        <th className="p-1">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {preview.preview.map(p => (
                                        <tr key={p.wallet} className="hover:bg-slate-800/30">
                                            <td className="p-1 text-center font-mono text-slate-400">{p.rank}</td>
                                            <td className="p-1 font-bold text-white">{p.player_name}</td>
                                            <td className="p-1 text-right font-mono text-orange-300">{(p.kills || 0).toLocaleString()}</td>
                                            <td className="p-1 text-[10px] text-slate-500 font-mono">{p.source}</td>
                                            <td className="p-1 text-[10px] uppercase font-bold">
                                                <span className={
                                                    p.action === 'create' ? 'text-emerald-400'
                                                    : p.action === 'update' ? 'text-amber-400'
                                                    : 'text-slate-500'
                                                }>{p.action}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {result && (
                <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg p-3">
                    <div className="text-emerald-300 font-bold text-sm mb-1">✓ Backfill committed for {result.week_id}</div>
                    <div className="text-xs text-slate-300 font-mono">
                        Created: <span className="text-emerald-400">{result.created || 0}</span> ·
                        Updated: <span className="text-amber-400"> {result.updated || 0}</span> ·
                        Failed: <span className="text-red-400"> {result.failed || 0}</span>
                    </div>
                </div>
            )}
        </div>
    );
}