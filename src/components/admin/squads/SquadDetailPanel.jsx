import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, X } from 'lucide-react';
import SquadCoreEditor from './SquadCoreEditor';
import SquadTreasuryEditor from './SquadTreasuryEditor';
import SquadMembersEditor from './SquadMembersEditor';
import SquadWarEditor from './SquadWarEditor';
import SquadDangerZone from './SquadDangerZone';

// Fetches the full squad bundle (squad + members + recent wars + join requests)
// and renders all editor sections. Invalidates the parent list query on changes
// so the table reflects updates immediately.
export default function SquadDetailPanel({ squadId, walletAddress, onClose }) {
    const qc = useQueryClient();
    const queryKey = ['adminSquadDetail', squadId];

    const { data, isLoading, error, refetch } = useQuery({
        queryKey,
        queryFn: () => base44.functions.invoke('adminSquadOps', { action: 'getSquadDetail', squadId }).then(r => {
            if (r.data?.error) throw new Error(r.data.error);
            return r.data;
        }),
        enabled: !!squadId,
        staleTime: 10_000,
    });

    const refreshAll = () => {
        refetch();
        qc.invalidateQueries({ queryKey: ['adminSquads', walletAddress] });
    };

    const onDeleted = () => {
        qc.invalidateQueries({ queryKey: ['adminSquads', walletAddress] });
        onClose?.();
    };

    if (isLoading) {
        return (
            <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-8 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                <span className="text-slate-400 text-sm">Loading squad…</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="bg-[#0b0416]/80 border border-red-900/50 rounded-xl p-4 text-red-300 text-sm">
                Failed to load: {error.message}
            </div>
        );
    }
    if (!data?.squad) return null;

    const { squad, members, recentWars, joinRequests } = data;

    return (
        <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap border-b border-orange-900/30 pb-3">
                <span className="text-2xl">{squad.icon}</span>
                <div>
                    <div className="text-base font-black text-white">{squad.name} <span className="text-orange-400">[{squad.tag}]</span></div>
                    <div className="text-[10px] text-slate-500 font-mono">{squad.id}</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {joinRequests.length > 0 && (
                        <span className="text-[10px] bg-cyan-900/50 text-cyan-300 border border-cyan-700/50 px-2 py-1 rounded font-bold uppercase tracking-widest">
                            {joinRequests.length} pending request{joinRequests.length === 1 ? '' : 's'}
                        </span>
                    )}
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded bg-slate-800/60 hover:bg-slate-700 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <SquadCoreEditor squad={squad} onSaved={refreshAll} />
                <SquadTreasuryEditor squad={squad} onSaved={refreshAll} />
                <SquadMembersEditor members={members} onChanged={refreshAll} />
                <SquadWarEditor squad={squad} recentWars={recentWars} onSaved={refreshAll} />
            </div>

            <SquadDangerZone squad={squad} onDeleted={onDeleted} />
        </div>
    );
}