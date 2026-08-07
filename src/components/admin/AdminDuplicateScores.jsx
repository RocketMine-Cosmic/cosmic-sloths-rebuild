import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Trash2 } from 'lucide-react';
import moment from 'moment';
import ConfirmDialog from './ConfirmDialog';
import { useAvailablePeriods, getCurrentWeekId } from './useAvailablePeriods';
import { arenaLabel } from '@/lib/arenaLabels';

async function autoSnapshot(notes) {
    try {
        await base44.functions.invoke('backupData', {
            adminKey: sessionStorage.getItem('admin_key') || undefined,
            backup_notes: `[auto] ${notes}`,
        });
    } catch (e) { console.warn('[autoSnapshot]', e.message); }
}

export default function AdminDuplicateScores({ walletAddress }) {
    const [period, setPeriod] = useState(getCurrentWeekId());
    const { weeks, currentWeek } = useAvailablePeriods(walletAddress);
    const [deleting, setDeleting] = useState({});
    const [msg, setMsg] = useState('');
    const [confirmState, setConfirmState] = useState(null); // { kind: 'one'|'group', score?, group? }
    const [busyConfirm, setBusyConfirm] = useState(false);
    const qc = useQueryClient();

    const { data: scores, isLoading } = useQuery({
        queryKey: ['adminAllScores', period],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', {
            type: 'scores', period: 'all'
        }).then(r => (r.data?.scores || []).filter(s => period === 'all' || s.week_id === period)),
        enabled: !!walletAddress,
    });

    // Find duplicates — same wallet, same week, SAME MODE (endless vs normal), more than one score.
    // Normal-mode runs and endless runs are separate leaderboards, so they must NOT be grouped together.
    // We bucket all non-endless arenas as 'normal' (the weekly/seasonal leaderboard treats them as one pool).
    const dupeGroups = (() => {
        if (!scores) return [];
        const map = {};
        scores.forEach(s => {
            const mode = s.arena_id === 'endless' ? 'endless' : 'normal';
            const key = `${s.wallet_address}_${s.week_id}_${mode}`;
            if (!map[key]) map[key] = [];
            map[key].push(s);
        });
        return Object.values(map).filter(g => g.length > 1).sort((a, b) => b.length - a.length);
    })();

    const softDelete = async (scoreIds, reason) => {
        const res = await base44.functions.invoke('softDeleteRunScore', {
            scoreIds,
            reason,
            adminKey: sessionStorage.getItem('admin_key') || undefined,
        });
        if (res.data?.error) throw new Error(res.data.error);
        return res.data;
    };

    const handleConfirm = async () => {
        if (!confirmState) return;
        setBusyConfirm(true);
        const ids = confirmState.kind === 'one'
            ? [confirmState.score.id]
            : [...confirmState.group].sort((a, b) => b.score - a.score).slice(1).map(s => s.id);
        ids.forEach(id => setDeleting(d => ({ ...d, [id]: true })));
        try {
            await autoSnapshot(confirmState.kind === 'one'
                ? `pre-score-delete ${confirmState.score.player_name} ${confirmState.score.id}`
                : `pre-dup-cleanup ${confirmState.group[0].player_name} ${confirmState.group[0].week_id}`);
            const res = await softDelete(ids, confirmState.kind === 'one' ? 'duplicate (manual)' : 'duplicate (keep best)');
            qc.invalidateQueries(['adminAllScores']);
            qc.invalidateQueries(['deletedRunScores']);
            setMsg(`✓ Archived ${res.succeeded} score${res.succeeded === 1 ? '' : 's'} (restorable for 7 days)`);
            setTimeout(() => setMsg(''), 4000);
            setConfirmState(null);
        } catch (e) {
            setMsg(`✗ ${e.message}`);
        } finally {
            ids.forEach(id => setDeleting(d => ({ ...d, [id]: false })));
            setBusyConfirm(false);
        }
    };

    return (
        <div className="bg-[#0b0416]/80 border border-yellow-900/50 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-base font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle size={16} /> Duplicate Score Detector
                </h2>
                <div className="ml-auto flex items-center gap-2">
                    <select
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-yellow-500 w-44 font-mono"
                    >
                        <option value="all">All weeks</option>
                        {weeks.map(w => (
                            <option key={w} value={w}>{w}{w === currentWeek ? ' (current)' : ''}</option>
                        ))}
                    </select>
                    {msg && <span className={`text-xs font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-yellow-500"></div></div>
            ) : dupeGroups.length === 0 ? (
                <div className="text-center text-emerald-400 py-8 text-sm font-bold">✓ No duplicates found for this period.</div>
            ) : (
                <div className="space-y-3">
                    <div className="text-xs text-slate-400 mb-2">{dupeGroups.length} player(s) with multiple scores in <span className="text-yellow-400 font-mono">{period}</span></div>
                    {dupeGroups.map(group => {
                        const isEndlessGroup = group[0].arena_id === 'endless';
                        return (
                        <div key={group[0].wallet_address + group[0].week_id + (isEndlessGroup ? '_endless' : '_normal')} className="bg-slate-900/60 border border-yellow-800/40 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-white text-xs">{group[0].player_name}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{group[0].wallet_address?.slice(0,8)}...</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isEndlessGroup ? 'bg-fuchsia-900/60 text-fuchsia-300 border border-fuchsia-700/40' : 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/40'}`}>
                                        {isEndlessGroup ? '♾️ ENDLESS' : '🏆 NORMAL'}
                                    </span>
                                    <span className="text-[10px] bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded font-bold">{group.length} scores</span>
                                </div>
                                <button onClick={() => setConfirmState({ kind: 'group', group })}
                                    className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded font-bold transition-colors">
                                    Keep Best, Delete Rest
                                </button>
                            </div>
                            <div className="space-y-1">
                                {group.sort((a, b) => b.score - a.score).map((s, i) => (
                                    <div key={s.id} className="flex items-center justify-between bg-slate-800/60 rounded px-3 py-1.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-bold ${i === 0 ? 'text-emerald-400' : 'text-slate-500'}`}>{i === 0 ? '👑 BEST' : `#${i+1}`}</span>
                                            <span className="text-xs font-mono text-white">{s.score.toLocaleString()}</span>
                                            <span className="text-[10px] text-slate-500" title={s.arena_id || ''}>{arenaLabel(s.arena_id)}</span>
                                            <span className="text-[10px] text-slate-500">{moment(s.created_date).format('MMM D HH:mm')}</span>
                                        </div>
                                        {i > 0 && (
                                            <button onClick={() => setConfirmState({ kind: 'one', score: s })} disabled={deleting[s.id]}
                                                className="text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-colors">
                                                <Trash2 size={10} /> {deleting[s.id] ? '...' : 'Delete'}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={!!confirmState}
                onClose={() => setConfirmState(null)}
                onConfirm={handleConfirm}
                busy={busyConfirm}
                title={confirmState?.kind === 'group' ? 'Delete duplicate scores' : 'Delete score'}
                description={confirmState?.kind === 'group'
                    ? `Will keep the highest score and delete ${(confirmState.group?.length || 1) - 1} other(s) for ${confirmState.group?.[0]?.player_name}. A snapshot will be taken first.`
                    : `Permanently delete this score for ${confirmState?.score?.player_name}? A snapshot will be taken first.`}
                items={confirmState?.kind === 'group'
                    ? [...(confirmState.group || [])].sort((a, b) => b.score - a.score).slice(1)
                        .map(s => `${s.score.toLocaleString()} pts · ${arenaLabel(s.arena_id)} · ${moment(s.created_date).format('MMM D HH:mm')}`)
                    : confirmState?.score
                        ? [`${confirmState.score.score.toLocaleString()} pts · ${arenaLabel(confirmState.score.arena_id)} · ${confirmState.score.week_id}`]
                        : []}
                confirmLabel="Delete"
            />
        </div>
    );
}