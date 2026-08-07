import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Undo2, Trash2, Archive } from 'lucide-react';
import moment from 'moment';
import ConfirmDialog from './ConfirmDialog';

const TTL_DAYS = 7;

export default function AdminDeletedScores() {
    const qc = useQueryClient();
    const [busyId, setBusyId] = useState(null);
    const [msg, setMsg] = useState('');
    const [purgeConfirm, setPurgeConfirm] = useState(null);

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['deletedRunScores'],
        queryFn: () => base44.entities.DeletedRunScore.list('-created_date', 200),
    });

    const adminKey = sessionStorage.getItem('admin_key') || undefined;

    const restore = async (item) => {
        setBusyId(item.id); setMsg('');
        try {
            const res = await base44.functions.invoke('restoreDeletedRunScore', { deletedIds: [item.id], adminKey });
            if (res.data?.error) throw new Error(res.data.error);
            qc.invalidateQueries(['deletedRunScores']);
            qc.invalidateQueries(['adminAllScores']);
            setMsg(`✓ Restored ${item.player_name}'s score (${item.score.toLocaleString()} pts)`);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setBusyId(null);
    };

    const purge = async (item) => {
        setBusyId(item.id); setMsg('');
        try {
            await base44.entities.DeletedRunScore.delete(item.id);
            qc.invalidateQueries(['deletedRunScores']);
            setMsg(`✓ Purged archive entry for ${item.player_name}`);
        } catch (e) { setMsg(`✗ ${e.message}`); }
        setBusyId(null);
        setPurgeConfirm(null);
    };

    const ttl = (createdDate) => {
        const ageMs = Date.now() - new Date(createdDate).getTime();
        const remainMs = (TTL_DAYS * 24 * 60 * 60 * 1000) - ageMs;
        if (remainMs <= 0) return 'expired';
        const d = Math.floor(remainMs / (24 * 60 * 60 * 1000));
        const h = Math.floor((remainMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        return `${d}d ${h}h left`;
    };

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Archive size={16} /> Recently Deleted Scores
                </h2>
                <span className="text-[10px] text-slate-500">Auto-purged after {TTL_DAYS} days</span>
                {msg && <span className={`ml-auto text-xs font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</span>}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-amber-500"></div></div>
            ) : items.length === 0 ? (
                <div className="text-center text-slate-500 py-6 text-sm">No deleted scores in the recovery window.</div>
            ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                    {items.map(item => (
                        <div key={item.id} className="bg-slate-900/60 border border-amber-800/30 rounded px-3 py-2 flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-white text-sm">{item.player_name}</span>
                                    <span className="text-cyan-400 font-mono text-xs">{(item.score || 0).toLocaleString()} pts</span>
                                    <span className="text-[10px] text-slate-500">{item.arena_id || '—'}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{item.week_id}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                    Deleted {moment(item.created_date).fromNow()} by <span className="font-mono">{item.deleted_by?.slice(0, 10)}{item.deleted_by?.length > 10 ? '…' : ''}</span>
                                    {item.delete_reason && <> · <span className="italic">{item.delete_reason}</span></>}
                                    <span className="ml-2 text-amber-400">⏳ {ttl(item.created_date)}</span>
                                </div>
                            </div>
                            <div className="flex gap-1.5">
                                <button onClick={() => restore(item)} disabled={busyId === item.id}
                                    className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors">
                                    <Undo2 size={11} /> {busyId === item.id ? '…' : 'Restore'}
                                </button>
                                <button onClick={() => setPurgeConfirm({ item })} disabled={busyId === item.id}
                                    className="bg-red-900/60 hover:bg-red-800 disabled:opacity-50 text-red-200 text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors">
                                    <Trash2 size={11} /> Purge
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={!!purgeConfirm}
                onClose={() => setPurgeConfirm(null)}
                onConfirm={() => purgeConfirm && purge(purgeConfirm.item)}
                busy={busyId === purgeConfirm?.item?.id}
                title="Purge archive entry"
                description={`This permanently removes the archived score for ${purgeConfirm?.item?.player_name}. After this, it CANNOT be restored.`}
                items={purgeConfirm?.item ? [`${purgeConfirm.item.score.toLocaleString()} pts · ${purgeConfirm.item.arena_id || '—'} · ${purgeConfirm.item.week_id}`] : []}
                confirmLabel="Purge permanently"
            />
        </div>
    );
}