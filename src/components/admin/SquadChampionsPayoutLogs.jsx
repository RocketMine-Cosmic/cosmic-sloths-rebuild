import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ScrollText, RefreshCw } from 'lucide-react';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

// Reads SquadChampionsPayoutLog rows for the selected season and shows them
// as a flat per-player table so admins can verify exactly who got paid.
export default function SquadChampionsPayoutLogs({ periodId }) {
    const [refreshKey, setRefreshKey] = useState(0);

    const { data: logs = [], isLoading, error } = useQuery({
        queryKey: ['SquadChampionsPayoutLog', periodId, refreshKey],
        queryFn: async () => {
            if (!periodId) return [];
            return await base44.entities.SquadChampionsPayoutLog.filter(
                { period_id: periodId },
                '-created_date',
                1000
            );
        },
        enabled: !!periodId,
        staleTime: 30_000,
    });

    // Best-effort name lookup so we don't show raw wallets only.
    const { data: names = {} } = useQuery({
        queryKey: ['SquadChampionsPayoutLog-names', logs.length, periodId],
        queryFn: async () => {
            const wallets = [...new Set(logs.map(l => (l.wallet_address || '').toLowerCase()))];
            const out = {};
            for (const w of wallets) {
                if (!w) continue;
                try {
                    const rows = await base44.entities.PlayerSave.filter({ wallet_address: w }, '-updated_at', 1);
                    if (rows.length > 0) out[w] = rows[0].player_name || '';
                } catch {}
            }
            return out;
        },
        enabled: logs.length > 0,
        staleTime: 60_000,
    });

    const totalPaid = logs.reduce((s, l) => s + (Number(l.amount) || 0), 0);

    return (
        <div className="bg-[#0b0416]/80 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <ScrollText size={14} /> Payout Logs {periodId && <span className="text-slate-500 font-mono normal-case text-xs">— {periodId}</span>}
                </h3>
                <button
                    onClick={() => setRefreshKey(k => k + 1)}
                    disabled={isLoading || !periodId}
                    className="text-slate-400 hover:text-white disabled:opacity-50 flex items-center gap-1 text-xs"
                >
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {!periodId && <div className="text-xs text-slate-500 italic">Select a season above to view its logs.</div>}
            {periodId && isLoading && <div className="text-xs text-slate-400">Loading…</div>}
            {error && <div className="text-xs text-red-400">Error: {String(error.message || error)}</div>}

            {periodId && !isLoading && logs.length === 0 && (
                <div className="text-xs text-slate-500 italic">No payout logs found for {periodId}.</div>
            )}

            {logs.length > 0 && (
                <>
                    <div className="flex gap-3 mb-3 text-xs">
                        <div className="bg-slate-900/60 border border-slate-700 rounded px-2.5 py-1.5">
                            <span className="text-slate-500">Rows:</span> <span className="font-mono font-bold text-white">{logs.length}</span>
                        </div>
                        <div className="bg-slate-900/60 border border-amber-700/40 rounded px-2.5 py-1.5 flex items-center gap-1">
                            <span className="text-slate-500">Total paid:</span>
                            <OmenXIcon className="w-3 h-3" />
                            <span className="font-mono font-bold text-amber-300">{Math.floor(totalPaid).toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-slate-800 rounded">
                        <table className="w-full text-xs">
                            <thead className="text-slate-500 bg-slate-950/70 sticky top-0">
                                <tr>
                                    <th className="p-1.5 text-left font-normal">Rank</th>
                                    <th className="p-1.5 text-left font-normal">Squad</th>
                                    <th className="p-1.5 text-left font-normal">Player</th>
                                    <th className="p-1.5 text-left font-normal">Wallet</th>
                                    <th className="p-1.5 text-right font-normal">Amount</th>
                                    <th className="p-1.5 text-left font-normal">Tx</th>
                                    <th className="p-1.5 text-left font-normal">When</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {logs.map(l => {
                                    const wallet = (l.wallet_address || '').toLowerCase();
                                    const playerName = names[wallet] || '(unknown)';
                                    const created = l.created_date ? new Date(l.created_date) : null;
                                    return (
                                        <tr key={l.id} className="hover:bg-slate-900/60">
                                            <td className="p-1.5 font-mono text-amber-300">#{l.squad_rank ?? '?'}</td>
                                            <td className="p-1.5 text-white">{l.squad_name} <span className="text-slate-500">[{l.squad_tag}]</span></td>
                                            <td className="p-1.5 text-slate-200">{playerName}</td>
                                            <td className="p-1.5 font-mono text-slate-500 text-[10px]">{wallet.slice(0, 6)}…{wallet.slice(-4)}</td>
                                            <td className="p-1.5 text-right font-mono text-amber-300">{Math.floor(Number(l.amount) || 0).toLocaleString()}</td>
                                            <td className="p-1.5 font-mono text-slate-500 text-[10px]">{(l.tx_id || '').slice(0, 14) || '—'}</td>
                                            <td className="p-1.5 text-slate-500 text-[10px]">{created ? created.toISOString().replace('T', ' ').slice(0, 16) : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}