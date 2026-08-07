import React, { useState } from 'react';
import { UserMinus, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

function daysSince(iso) {
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// Member management — kick inactive members. Inactivity threshold is leader-set
// (3 / 7 / 14 / 30 days). The leader is never shown in this list, and members
// the leader can't kick (other officers, when caller isn't leader) are filtered
// upstream by squadActions's permissions.
export default function InactiveMembersPanel({ squadId, members, onKicked }) {
    const { toast } = useToast();
    const [threshold, setThreshold] = useState(7);
    const [busyId, setBusyId] = useState(null);

    const filtered = members
        .filter(m => m.role !== 'leader')
        .map(m => ({ ...m, days_inactive: daysSince(m.last_run_at) }))
        .filter(m => m.days_inactive >= threshold)
        .sort((a, b) => b.days_inactive - a.days_inactive);

    const handleKick = async (m) => {
        if (!squadId || !m?.member_id) return;
        const ok = confirm(`Kick ${m.player_name}? They've been inactive for ${m.days_inactive === Infinity ? '∞' : m.days_inactive} days.`);
        if (!ok) return;
        setBusyId(m.member_id);
        try {
            const res = await base44.functions.invoke('squadActions', {
                action: 'kick',
                targetMemberId: m.member_id,
                squadId,
            });
            if (res.data?.error) throw new Error(res.data.error);
            toast({ title: 'Member kicked', description: `${m.player_name} has been removed.` });
            onKicked?.();
        } catch (e) {
            toast({ title: 'Couldn\'t kick member', description: e.message || 'Try again.' });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="bg-[#0b0416]/80 border border-rose-700/50 rounded-xl p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
                <UserMinus className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm md:text-base font-bold text-rose-300 uppercase tracking-widest">Inactive Members</h3>
            </div>

            <div className="mb-3">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Inactivity threshold</label>
                <div className="flex gap-2 mt-1">
                    {[3, 7, 14, 30].map(d => (
                        <button
                            key={d}
                            onClick={() => setThreshold(d)}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-colors ${threshold === d ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                            ≥ {d}d
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="text-xs text-slate-500 italic bg-slate-900/40 rounded-lg p-3 border border-slate-700/40">
                    ✅ No members have been inactive for {threshold}+ days. Nice and active squad!
                </div>
            ) : (
                <div className="space-y-1.5">
                    {filtered.map(m => (
                        <div key={m.member_id} className="bg-rose-950/20 border border-rose-800/40 rounded-lg px-3 py-2 flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-white font-bold truncate">{m.player_name || 'Pilot'}</div>
                                <div className="text-[11px] text-slate-400">
                                    {m.last_run_at
                                        ? <>Last run <span className="text-rose-300">{m.days_inactive}d ago</span> · {m.runs_7d} runs (7d)</>
                                        : <>No runs ever recorded · {m.kills_7d} kills (7d)</>}
                                </div>
                            </div>
                            <button
                                onClick={() => handleKick(m)}
                                disabled={busyId === m.member_id}
                                className="text-xs bg-rose-700 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded transition-colors disabled:opacity-50 shrink-0"
                            >
                                {busyId === m.member_id ? '…' : 'Kick'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}