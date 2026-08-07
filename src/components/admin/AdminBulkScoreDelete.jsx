import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Trash2, AlertTriangle } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useAvailablePeriods } from './useAvailablePeriods';

export default function AdminBulkScoreDelete({ walletAddress }) {
    const [period, setPeriod] = useState('');
    const [periodType, setPeriodType] = useState('week');
    const { weeks, seasons, currentWeek, currentSeason } = useAvailablePeriods(walletAddress);
    const periodOptions = periodType === 'week' ? weeks : seasons;
    const currentMarker = periodType === 'week' ? currentWeek : currentSeason;
    const [showConfirm, setShowConfirm] = useState(false);
    const [busyConfirm, setBusyConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [preview, setPreview] = useState(null);

    const handlePreview = async () => {
        if (!period.trim()) { setMsg('Enter a period first.'); return; }
        setLoading(true); setMsg(''); setPreview(null);
        try {
            const filter = periodType === 'week' ? { week_id: period.trim() } : { season_id: period.trim() };
            const scores = await base44.entities.RunScore.filter(filter, '-score', 500);
            setPreview(scores.length);
            setMsg('');
        } catch (e) {
            setMsg(`✗ ${e.message}`);
        }
        setLoading(false);
    };

    const handleDelete = async () => {
        setBusyConfirm(true);
        setLoading(true); setMsg('');
        try {
            // Auto-snapshot before bulk delete
            try {
                await base44.functions.invoke('backupData', {
                    adminKey: sessionStorage.getItem('admin_key') || undefined,
                    backup_notes: `[auto] pre-bulk-score-delete ${period} (${periodType})`,
                });
            } catch (e) { console.warn('[snapshot]', e.message); }

            const filter = periodType === 'week' ? { week_id: period.trim() } : { season_id: period.trim() };
            const scores = await base44.entities.RunScore.filter(filter, '-score', 500);
            const ids = scores.map(s => s.id);

            // Soft-delete in chunks (function loops internally; chunking keeps requests bounded)
            const CHUNK = 50;
            let succeeded = 0;
            for (let i = 0; i < ids.length; i += CHUNK) {
                const chunk = ids.slice(i, i + CHUNK);
                const res = await base44.functions.invoke('softDeleteRunScore', {
                    scoreIds: chunk,
                    reason: `bulk delete ${period} (${periodType})`,
                    adminKey: sessionStorage.getItem('admin_key') || undefined,
                });
                if (res.data?.error) throw new Error(res.data.error);
                succeeded += res.data?.succeeded || 0;
            }
            setMsg(`✓ Archived ${succeeded} scores for ${period} (restorable for 7 days)`);
            setPreview(null);
            setShowConfirm(false);
            setPeriod('');
        } catch (e) {
            setMsg(`✗ ${e.message}`);
        }
        setLoading(false);
        setBusyConfirm(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-red-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Trash2 size={16} /> Bulk Score Delete
            </h2>
            <div className="text-xs text-slate-400 mb-4">Delete ALL scores for a specific week or season. Use if a period had corrupted data or needs a full reset.</div>

            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase">Type</label>
                    <select value={periodType} onChange={e => { setPeriodType(e.target.value); setPeriod(''); setPreview(null); setShowConfirm(false); }}
                        style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-red-500">
                        <option value="week">Week</option>
                        <option value="season">Season</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase">Period</label>
                    <select value={period} onChange={e => { setPeriod(e.target.value); setPreview(null); setShowConfirm(false); }}
                        style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-red-500 w-48 font-mono">
                        <option value="">— select {periodType} —</option>
                        {periodOptions.map(p => (
                            <option key={p} value={p}>{p}{p === currentMarker ? ' (current)' : ''}</option>
                        ))}
                    </select>
                </div>
                <button onClick={handlePreview} disabled={loading}
                    className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm transition-colors">
                    {loading ? '...' : 'Preview Count'}
                </button>
                {preview !== null && preview > 0 && (
                    <button onClick={() => setShowConfirm(true)} disabled={loading}
                        className="px-4 py-1.5 rounded font-bold text-sm transition-colors flex items-center gap-2 bg-red-900/60 hover:bg-red-800 text-red-300">
                        <AlertTriangle size={14} />
                        Delete {preview} scores
                    </button>
                )}
            </div>
            {msg && <div className={`mt-3 text-sm font-mono ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</div>}

            <ConfirmDialog
                open={showConfirm}
                onClose={() => !busyConfirm && setShowConfirm(false)}
                onConfirm={handleDelete}
                busy={busyConfirm}
                title="Bulk delete scores"
                description={`This will permanently delete ${preview} score(s) for ${periodType} ${period}. A snapshot will be taken automatically first, but this is still a major operation.`}
                confirmText={period.trim()}
                confirmLabel={`Delete ${preview} scores`}
            />
        </div>
    );
}