import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Crown, Eye, Send, AlertTriangle, Users, ScrollText } from 'lucide-react';
import { getCurrentPeriodIds } from '@/lib/periodIds';
import SquadChampionsPayoutLogs from './SquadChampionsPayoutLogs';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

// Admin panel: preview & distribute the Squad Wars Champions Pool for a given season.
// Wraps the `distributeSquadChampions` backend function.
export default function AdminSquadChampions({ walletAddress }) {
    const [periodId, setPeriodId] = useState(''); // blank = previous season auto-detected
    const [previewing, setPreviewing] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const [executing, setExecuting] = useState(false);
    const [executeMsg, setExecuteMsg] = useState('');
    const [confirmExecute, setConfirmExecute] = useState(false);

    // Load all pools to populate the season dropdown (mirrors AdminRewards UX).
    const { data: allPools = [] } = useQuery({
        queryKey: ['allPools', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'pools' }).then(r => r.data?.pools || []),
        enabled: !!walletAddress
    });

    const currentSeasonId = getCurrentPeriodIds().season_id;
    const seasonOptions = [
        { id: '', label: '— previous season (auto) —', distributed: false },
        { id: currentSeasonId, label: `${currentSeasonId} (current)`, distributed: false },
        ...allPools
            .filter(p => p.period_type === 'seasonal' && p.period_id !== currentSeasonId)
            .sort((a, b) => b.period_id.localeCompare(a.period_id))
            // NOTE: p.distributed reflects the SEASONAL PLAYER pool (distributeRewards), NOT
            // the Squad Champions pool. The real "champions already paid?" check happens in
            // the preview response (`already_distributed` field). Don't show that flag here.
            .map(p => ({ id: p.period_id, label: p.period_id, distributed: false }))
    ];

    const handlePreview = async () => {
        setPreviewing(true);
        setPreviewData(null);
        setPreviewError('');
        try {
            const res = await base44.functions.invoke('distributeSquadChampions', {
                period_id: periodId || undefined,
                mode: 'preview',
            });
            if (!res.data?.success) {
                setPreviewError(res.data?.error || 'Preview failed.');
            } else {
                setPreviewData(res.data);
            }
        } catch (err) {
            setPreviewError(err?.response?.data?.error || err.message);
        }
        setPreviewing(false);
    };

    const handleExecute = async () => {
        if (!confirmExecute) {
            setConfirmExecute(true);
            setTimeout(() => setConfirmExecute(false), 8000);
            return;
        }
        setExecuting(true);
        setExecuteMsg('');
        try {
            const res = await base44.functions.invoke('distributeSquadChampions', {
                period_id: periodId || undefined,
                mode: 'execute',
            });
            if (res.data?.success) {
                // Function returns paid_this_run / paid_omenx_this_run for resume-aware runs.
                // Fall back to member_count / total_payout_omenx for older shape compatibility.
                const paidCount = res.data.paid_this_run ?? res.data.member_count ?? 0;
                const paidOmenx = res.data.paid_omenx_this_run ?? res.data.total_payout_omenx ?? 0;
                const squadCount = (res.data.top_squads || []).length;
                setExecuteMsg(`✓ Paid ${paidCount} members across ${squadCount} squads — ${Math.floor(paidOmenx).toLocaleString()} OMENX total.`);
                setPreviewData(null); // force fresh preview after distribution
            } else {
                setExecuteMsg(`✗ ${res.data?.error || 'Distribution failed.'}`);
            }
        } catch (err) {
            setExecuteMsg(`✗ ${err?.response?.data?.error || err.message}`);
        }
        setExecuting(false);
        setConfirmExecute(false);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-amber-950/30 border border-amber-700/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-amber-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Crown size={18} /> Squad Wars Champions Pool
                </h2>
                <p className="text-xs text-slate-300">
                    Distributes the seasonal Champions Pool to the top 3 squads of the previous season (50/30/20 split). Idempotent — safe to run multiple times.
                </p>
                <ul className="text-[11px] text-slate-400 mt-2 space-y-0.5 list-disc list-inside">
                    <li>Eligibility: ≥ 2 wars fought + ≥ 2 squad members</li>
                    <li>Per-squad share split equally among all current members</li>
                    <li>Blacklisted wallets are skipped</li>
                </ul>
            </div>

            {/* Period selector + preview */}
            <div className="bg-[#0b0416]/80 border border-sky-900/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-sky-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Eye size={14} /> Step 1 — Preview
                </h3>
                <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Season</label>
                        <select
                            value={periodId}
                            onChange={e => setPeriodId(e.target.value)}
                            style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-sky-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500 w-64 font-mono"
                        >
                            {seasonOptions.map(o => (
                                <option key={o.id || 'auto'} value={o.id}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handlePreview}
                        disabled={previewing}
                        className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2"
                    >
                        <Eye size={14} /> {previewing ? 'Loading…' : 'Preview'}
                    </button>
                </div>
                {previewError && <div className="text-red-400 text-sm mt-3 font-mono">{previewError}</div>}

                {previewData && (
                    <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-3">
                            {[
                                { label: 'Season', value: previewData.period_id, color: 'text-white' },
                                { label: 'Pool Total', value: `${Math.floor(previewData.pool_total_spent || 0).toLocaleString()} OMENX`, color: 'text-white' },
                                { label: 'Champions Pool', value: `${Math.floor(previewData.champions_pool_omenx || 0).toLocaleString()} OMENX`, color: 'text-amber-300' },
                                { label: 'Eligible Squads', value: previewData.eligible_squads, color: 'text-emerald-400' },
                                { label: 'Total Payout', value: `${Math.floor(previewData.total_payout_omenx || 0).toLocaleString()} OMENX`, color: 'text-emerald-400' },
                                { label: 'Recipients', value: previewData.total_member_payouts, color: 'text-white' },
                            ].map(s => (
                                <div key={s.label} className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                                    <div className="text-[10px] text-slate-500 uppercase">{s.label}</div>
                                    <div className={`font-mono font-bold text-sm ${s.color}`}>{s.value}</div>
                                </div>
                            ))}
                            {previewData.already_distributed && (
                                <div className="bg-red-950/40 border border-red-700 rounded-lg px-3 py-2 flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-red-400" />
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase">Status</div>
                                        <div className="font-mono font-bold text-sm text-red-400">ALREADY DISTRIBUTED</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top squads with per-member breakdown */}
                        {(previewData.top_squads || []).length > 0 && (
                            <div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Top Squads & Recipients</div>
                                <div className="space-y-2">
                                    {previewData.top_squads.map(sq => {
                                        const rankIcon = sq.rank === 1 ? '🥇' : sq.rank === 2 ? '🥈' : '🥉';
                                        const membersOfSquad = (previewData.member_payments || []).filter(m => m.squad_rank === sq.rank);
                                        return (
                                            <div key={sq.squad_id} className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
                                                <div className="p-3 flex flex-wrap items-center gap-3 border-b border-slate-700/60">
                                                    <span className="text-xl">{rankIcon}</span>
                                                    <span className="text-xl">{sq.squad_icon?.startsWith('http') ? <img src={sq.squad_icon} className="w-6 h-6 rounded" alt="" /> : (sq.squad_icon || '🛡️')}</span>
                                                    <div className="flex-1 min-w-[180px]">
                                                        <div className="font-bold text-white">{sq.squad_name} <span className="text-[10px] text-slate-500">[{sq.squad_tag}]</span></div>
                                                        <div className="text-[10px] text-slate-400">
                                                            {sq.wins}W · {sq.losses}L · {sq.ties}T · {sq.byes}B · {sq.total_kills.toLocaleString()} kills · {sq.member_count} members
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-amber-300 font-mono font-bold flex items-center gap-1 justify-end"><OmenXIcon className="w-4 h-4" /> {Math.floor(sq.squad_share_omenx).toLocaleString()}</div>
                                                        <div className="text-[9px] text-slate-500 uppercase">~{Math.floor(sq.per_member_omenx).toLocaleString()}/member</div>
                                                    </div>
                                                </div>
                                                {membersOfSquad.length > 0 ? (
                                                    <table className="w-full text-xs">
                                                        <thead className="text-slate-500 bg-slate-950/40">
                                                            <tr>
                                                                <th className="p-1.5 text-left font-normal">Player</th>
                                                                <th className="p-1.5 text-left font-normal">Wallet</th>
                                                                <th className="p-1.5 text-right font-normal">Amount</th>
                                                                <th className="p-1.5 text-center font-normal">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800">
                                                            {membersOfSquad.map(m => (
                                                                <tr key={m.wallet_address} className={m.already_paid ? 'bg-emerald-950/20' : ''}>
                                                                    <td className="p-1.5 text-white">{m.player_name}</td>
                                                                    <td className="p-1.5 font-mono text-slate-500 text-[10px]">{m.wallet_address.slice(0, 6)}…{m.wallet_address.slice(-4)}</td>
                                                                    <td className="p-1.5 text-right font-mono text-amber-300">{Math.floor(m.amount).toLocaleString()}</td>
                                                                    <td className="p-1.5 text-center">
                                                                        {m.already_paid
                                                                            ? <span className="text-[10px] text-emerald-400 font-bold">✓ PAID</span>
                                                                            : <span className="text-[10px] text-sky-400 font-bold">PENDING</span>}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <div className="p-2 text-[10px] text-slate-500 italic">No eligible members (blacklisted or per-member share rounded to 0).</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Full ranking */}
                        {(previewData.full_ranking || []).length > 0 && (
                            <details className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                                <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">Full Season Ranking ({previewData.full_ranking.length})</summary>
                                <table className="w-full text-left text-xs mt-2">
                                    <thead className="text-slate-500">
                                        <tr>
                                            <th className="p-1.5">Rank</th>
                                            <th className="p-1.5">Squad</th>
                                            <th className="p-1.5 text-right">Pts</th>
                                            <th className="p-1.5 text-right">W/L/T</th>
                                            <th className="p-1.5 text-right">Kills</th>
                                            <th className="p-1.5 text-center">Eligible</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {previewData.full_ranking.map((r, i) => (
                                            <tr key={r.squad_id}>
                                                <td className="p-1.5 font-mono">#{i + 1}</td>
                                                <td className="p-1.5 text-white">{r.squad_name} <span className="text-slate-500">[{r.squad_tag}]</span></td>
                                                <td className="p-1.5 text-right font-mono text-amber-300">{r.ranking_points}</td>
                                                <td className="p-1.5 text-right font-mono text-slate-400">{r.wins}/{r.losses}/{r.ties}</td>
                                                <td className="p-1.5 text-right font-mono text-slate-400">{r.total_kills.toLocaleString()}</td>
                                                <td className="p-1.5 text-center">{r.eligible ? '✓' : '✗'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {/* Execute */}
            <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4">
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Send size={14} /> Step 2 — Distribute
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                    {previewData
                        ? `Will pay ${previewData.total_member_payouts || 0} members ${Math.floor(previewData.total_payout_omenx || 0).toLocaleString()} OMENX total for ${previewData.period_id}.`
                        : 'Run a preview first.'}
                </p>
                <button
                    onClick={handleExecute}
                    disabled={executing || !previewData || previewData.already_distributed || (previewData.total_member_payouts || 0) === 0}
                    className={`px-4 py-2 rounded font-bold text-sm flex items-center gap-2 ${
                        confirmExecute
                            ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                            : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white'
                    }`}
                >
                    <Send size={14} />
                    {executing ? 'Distributing…' : confirmExecute ? '⚠ CLICK AGAIN TO CONFIRM' : 'Distribute Champions Pool'}
                </button>
                {executeMsg && (
                    <div className={`mt-3 text-sm font-mono ${executeMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {executeMsg}
                    </div>
                )}
            </div>

            {/* Step 3 — Payout Logs viewer (shows actual SquadChampionsPayoutLog rows) */}
            <SquadChampionsPayoutLogs periodId={previewData?.period_id || periodId || ''} />
        </div>
    );
}