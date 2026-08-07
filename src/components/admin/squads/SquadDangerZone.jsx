import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

export default function SquadDangerZone({ squad, onDeleted }) {
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const remove = async () => {
        if (confirm !== 'DELETE') { setError('Type DELETE to confirm.'); return; }
        if (!window.confirm(`PERMANENTLY delete squad "${squad.name}" [${squad.tag}] and remove all ${squad.member_count || 0} members? This cannot be undone.`)) return;
        setBusy(true); setError(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', { action: 'deleteSquad', squadId: squad.id, confirm: 'DELETE' });
            if (!res.data?.success) throw new Error(res.data?.error || 'Delete failed');
            onDeleted?.();
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="bg-red-950/30 border border-red-700/50 rounded-lg p-4">
            <h3 className="text-xs font-bold text-red-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
            </h3>
            <p className="text-[11px] text-red-200/80 mb-3">
                Deletes the squad, all member rows, pending join requests, and recent chat messages. Historical war rows stay intact for audit.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    placeholder='Type DELETE to confirm'
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="bg-slate-950 border border-red-700/50 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-red-500 w-52"
                />
                <button onClick={remove} disabled={busy || confirm !== 'DELETE'} className="bg-red-700 hover:bg-red-600 disabled:bg-red-950 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded flex items-center gap-1.5">
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete Squad
                </button>
                {error && <span className="text-red-400 text-xs">{error}</span>}
            </div>
        </div>
    );
}