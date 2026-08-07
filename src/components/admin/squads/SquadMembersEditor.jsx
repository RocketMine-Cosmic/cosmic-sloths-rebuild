import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Crown, Star, User, UserMinus, Pencil, Loader2 } from 'lucide-react';

const ROLE_META = {
    leader:  { icon: Crown, color: 'text-yellow-400 bg-yellow-900/40 border-yellow-700/60' },
    officer: { icon: Star,  color: 'text-cyan-300 bg-cyan-900/40 border-cyan-700/60' },
    member:  { icon: User,  color: 'text-slate-300 bg-slate-800 border-slate-700' },
};

export default function SquadMembersEditor({ members, onChanged }) {
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState(null);
    const [renameId, setRenameId] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    const setRole = async (memberId, role) => {
        setBusyId(memberId); setError(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', { action: 'setMemberRole', memberId, role });
            if (!res.data?.success) throw new Error(res.data?.error || 'Failed');
            onChanged?.();
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusyId(null); }
    };

    const rename = async () => {
        if (!renameId || !renameValue.trim()) return;
        setBusyId(renameId); setError(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', { action: 'renameMember', memberId: renameId, player_name: renameValue.trim() });
            if (!res.data?.success) throw new Error(res.data?.error || 'Failed');
            setRenameId(null); setRenameValue('');
            onChanged?.();
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusyId(null); }
    };

    const kick = async (m) => {
        if (!confirm(`Kick ${m.player_name} (${m.role}) from this squad?`)) return;
        setBusyId(m.id); setError(null);
        try {
            const res = await base44.functions.invoke('adminSquadOps', { action: 'kickMember', memberId: m.id });
            if (!res.data?.success) throw new Error(res.data?.error || 'Failed');
            onChanged?.();
        } catch (e) { setError(e?.response?.data?.error || e.message); }
        finally { setBusyId(null); }
    };

    const sorted = [...members].sort((a, b) => {
        const order = { leader: 0, officer: 1, member: 2 };
        return (order[a.role] ?? 3) - (order[b.role] ?? 3);
    });

    return (
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
            <h3 className="text-xs font-bold text-purple-300 uppercase tracking-widest mb-3">Members ({members.length})</h3>
            {error && <div className="mb-2 text-red-400 text-xs">{error}</div>}
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {sorted.map(m => {
                    const meta = ROLE_META[m.role] || ROLE_META.member;
                    const Icon = meta.icon;
                    const isRenaming = renameId === m.id;
                    return (
                        <div key={m.id} className="bg-slate-800/50 rounded px-3 py-2 flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border flex items-center gap-1 ${meta.color}`}>
                                <Icon className="w-3 h-3" /> {m.role}
                            </span>
                            {isRenaming ? (
                                <div className="flex items-center gap-1 flex-1 min-w-[180px]">
                                    <input
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        autoFocus
                                        className="bg-slate-950 border border-slate-700 text-white text-xs rounded px-2 py-1 flex-1 focus:outline-none focus:border-purple-500"
                                        onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenameId(null); }}
                                    />
                                    <button onClick={rename} disabled={busyId === m.id} className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-2 py-1 rounded text-white">Save</button>
                                    <button onClick={() => setRenameId(null)} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-white">×</button>
                                </div>
                            ) : (
                                <>
                                    <span className="font-bold text-white text-xs">{m.player_name || '(unnamed)'}</span>
                                    {m.player_title && <span className="text-[10px] text-slate-400 italic">"{m.player_title}"</span>}
                                </>
                            )}
                            <span className="font-mono text-[10px] text-slate-500 ml-auto" title={m.wallet_address}>
                                {m.wallet_address ? `${m.wallet_address.slice(0, 6)}…${m.wallet_address.slice(-4)}` : '—'}
                            </span>
                            {!isRenaming && (
                                <div className="flex items-center gap-1">
                                    <select
                                        value={m.role}
                                        onChange={e => setRole(m.id, e.target.value)}
                                        disabled={busyId === m.id}
                                        className="bg-slate-950 border border-slate-700 text-xs rounded px-1.5 py-1 text-white"
                                    >
                                        <option value="leader">leader</option>
                                        <option value="officer">officer</option>
                                        <option value="member">member</option>
                                    </select>
                                    <button title="Rename" onClick={() => { setRenameId(m.id); setRenameValue(m.player_name || ''); }} disabled={busyId === m.id} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 p-1.5 rounded text-slate-200">
                                        <Pencil className="w-3 h-3" />
                                    </button>
                                    <button title="Kick" onClick={() => kick(m)} disabled={busyId === m.id} className="bg-red-900/70 hover:bg-red-800 disabled:opacity-50 p-1.5 rounded text-red-100">
                                        {busyId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {!members.length && <div className="text-slate-500 text-xs py-4 text-center">No members.</div>}
            </div>
        </div>
    );
}