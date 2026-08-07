import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import moment from 'moment';
import ConfirmDialog from './ConfirmDialog';
import { arenaLabel } from '@/lib/arenaLabels';

// Heuristic detector for impossible runs (kills/sec, level/time, etc).
// Backend handles the math; this just renders flagged results and lets staff
// soft-delete suspicious ones (recoverable for 7 days via the Deleted Scores tool).

export default function AdminSuspiciousRuns({ walletAddress }) {
    const qc = useQueryClient();
    const [confirmRun, setConfirmRun] = useState(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const { data: runs = [], isLoading, refetch } = useQuery({
        queryKey: ['suspiciousRuns'],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'suspiciousRuns' })
            .then(r => r.data?.runs || []),
    });

    const handleDelete = async () => {
        if (!confirmRun) return;
        setBusy(true); setMsg('');
        try {
            // Auto-snapshot first
            await base44.functions.invoke('backupData', {
                adminKey: sessionStorage.getItem('admin_key') || undefined,
                backup_notes: `[auto] pre-suspicious-delete ${confirmRun.player_name} ${confirmRun.id}`,
            }).catch(() => {});
            const res = await base44.functions.invoke('softDeleteRunScore', {
                scoreIds: [confirmRun.id],
                reason: `suspicious: ${(confirmRun._reasons || []).join('; ')}`,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            qc.invalidateQueries(['suspiciousRuns']);
            qc.invalidateQueries(['deletedRunScores']);
            setMsg(`✓ Archived ${confirmRun.player_name}'s run (${confirmRun.score.toLocaleString()} pts) — restorable for 7 days`);
            setConfirmRun(null);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setBusy(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle size={16} /> Suspicious Runs
                </h2>
                <span className="text-[10px] text-slate-500">Anomaly heuristics — last 500 runs scanned</span>
                <button onClick={() => refetch()} className="ml-auto text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded font-bold flex items-center gap-1">
                    <RefreshCw size={11} /> Rescan
                </button>
                {msg && <span className={`text-xs font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
            </div>

            <div className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                Flags runs with: &gt;50 kills/sec, level 50+ in &lt;60s, &gt;1M score, &gt;50k kills, &gt;4h survived, or zero-time positive scores. Tune in <span className="font-mono">getAdminDataExtended.js</span>.
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-amber-500"></div></div>
            ) : runs.length === 0 ? (
                <div className="text-center text-emerald-400 py-6 text-sm font-bold">✓ No suspicious runs detected.</div>
            ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {runs.map(r => (
                        <div key={r.id} className="bg-slate-900/60 border border-amber-800/40 rounded p-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex-1 min-w-[200px]">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-white text-sm">{r.player_name}</span>
                                        <span className="text-cyan-400 font-mono text-xs">{(r.score || 0).toLocaleString()} pts</span>
                                        <span className="text-[10px] text-slate-500" title={r.arena_id || ''}>{r.character_id || '—'} · {arenaLabel(r.arena_id)}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{r.week_id}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1">
                                        Lvl {r.level || 0} · {r.kills?.toLocaleString() || 0} kills · {r.time_survived || 0}s · {moment(r.created_date).fromNow()}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {(r._reasons || []).map((reason, i) => (
                                            <span key={i} className="text-[10px] bg-amber-900/50 text-amber-300 px-1.5 py-0.5 rounded font-mono">⚠ {reason}</span>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => setConfirmRun(r)}
                                    className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1 rounded font-bold flex items-center gap-1 transition-colors shrink-0">
                                    <Trash2 size={11} /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={!!confirmRun}
                onClose={() => !busy && setConfirmRun(null)}
                onConfirm={handleDelete}
                busy={busy}
                title="Delete suspicious run"
                description={confirmRun ? `Archive ${confirmRun.player_name}'s run (${confirmRun.score?.toLocaleString()} pts)? It will be restorable for 7 days. A snapshot is taken automatically first.` : ''}
                items={confirmRun?._reasons || []}
                confirmLabel="Delete run"
            />
        </div>
    );
}