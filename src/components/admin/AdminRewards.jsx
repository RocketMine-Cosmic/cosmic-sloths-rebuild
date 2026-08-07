import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Gift, Eye, Send, Trophy } from 'lucide-react';
import moment from 'moment';
import { getCurrentWeekId, getCurrentSeasonId } from './useAvailablePeriods';
import AdminKillSnapshotBackfill from './AdminKillSnapshotBackfill';

// Canonical ISO 8601 (Mon-start, Sun 23:59 UTC end) — must match the rest of the app.
// The previous local calc here used a Sun-start formula that returned the wrong week
// on Sundays (e.g. labeled W19 as "current" while the real current week was W18).
function getCurrentPeriodIds() {
    return { week_id: getCurrentWeekId(), season_id: getCurrentSeasonId() };
}

export default function AdminRewards({ walletAddress }) {
    const [distributePeriod, setDistributePeriod] = useState('');
    const [distributeType, setDistributeType] = useState('weekly');
    const [distributing, setDistributing] = useState(false);
    const [distributeMsg, setDistributeMsg] = useState('');
    const [previewPeriod, setPreviewPeriod] = useState('');
    const [previewType, setPreviewType] = useState('weekly');
    const [previewing, setPreviewing] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const { week_id: currentWeekId, season_id: currentSeasonId } = getCurrentPeriodIds();

    // Load all pools for the dropdowns. Share the cache key + staleTime with
    // useAvailablePeriods so a single admin-dashboard mount doesn't fire this
    // call 3-4× in parallel and trip the Base44 rate limiter (429), which
    // would leave dropdowns empty (Hugo bug 2026-05-04 — couldn't see W18
    // even though the pool existed, because the parallel call 429'd).
    const { data: allPools = [] } = useQuery({
        queryKey: ['adminPoolsForPeriods', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'pools' }).then(r => r.data?.pools || []),
        enabled: !!walletAddress,
        staleTime: 60_000,
    });

    // Build dropdown options: undistributed pools + current period always present
    const weeklyOptions = [
        { id: currentWeekId, label: `${currentWeekId} (current)`, distributed: false },
        ...allPools.filter(p => p.period_type === 'weekly' && p.period_id !== currentWeekId)
                   .map(p => ({ id: p.period_id, label: `${p.period_id}${p.distributed ? ' ✓ distributed' : ' — pending'}`, distributed: p.distributed }))
    ];
    const seasonalOptions = [
        { id: currentSeasonId, label: `${currentSeasonId} (current)`, distributed: false },
        ...allPools.filter(p => p.period_type === 'seasonal' && p.period_id !== currentSeasonId)
                   .map(p => ({ id: p.period_id, label: `${p.period_id}${p.distributed ? ' ✓ distributed' : ' — pending'}`, distributed: p.distributed }))
    ];

    const getPeriodOptions = (type) => type === 'weekly' ? weeklyOptions : seasonalOptions;

    // Unified payouts cache (also used by AdminStaffPayouts) — prevents two parallel
    // fetches firing on dashboard mount.
    const { data: payoutLogs } = useQuery({
        queryKey: ['adminPayouts'],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'payouts' }).then(r => r.data?.payouts || []),
        enabled: !!walletAddress,
        staleTime: 60_000,
    });

    const handlePreview = async () => {
        if (!previewPeriod) { setPreviewError('Select a period'); return; }
        setPreviewing(true); setPreviewData(null); setPreviewError('');
        try {
            const res = await base44.functions.invoke('previewPayouts', { period_id: previewPeriod, period_type: previewType });
            setPreviewData(res.data);
        } catch (err) { setPreviewError(err.message); }
        setPreviewing(false);
    };

    const handleDistribute = async () => {
        if (!distributePeriod) { setDistributeMsg('Select a period'); return; }
        setDistributing(true); setDistributeMsg('');
        try {
            const res = await base44.functions.invoke('manuallyDistributeRewards', { period_id: distributePeriod, period_type: distributeType });
            setDistributeMsg(`✓ Distributed to ${res.data?.paid} players — ${res.data?.totalOmenx} OMENX total`);
            setDistributePeriod('');
            setTimeout(() => setDistributeMsg(''), 6000);
        } catch (err) { setDistributeMsg(`✗ ${err.message}`); }
        setDistributing(false);
    };

    // Standalone kill-pool payout. Split out from the main distribute fn because
    // doing players + staff + kills in one HTTP call hits the gateway 504 timeout.
    const handleDistributeKills = async () => {
        if (!distributePeriod) { setDistributeMsg('Select a weekly period'); return; }
        if (distributeType !== 'weekly') { setDistributeMsg('Kill pool only applies to weekly periods'); return; }
        setDistributing(true); setDistributeMsg('');
        try {
            const res = await base44.functions.invoke('distributeKillPool', { period_id: distributePeriod });
            setDistributeMsg(`✓ Kill pool: paid ${res.data?.paid} players — ${res.data?.totalOmenx} OMENX (skipped ${res.data?.skipped_already_paid || 0} already paid)`);
            setTimeout(() => setDistributeMsg(''), 8000);
        } catch (err) { setDistributeMsg(`✗ Kill pool: ${err.message}`); }
        setDistributing(false);
    };

    // Standalone staff payout — same reason.
    const handleDistributeStaff = async () => {
        if (!distributePeriod) { setDistributeMsg('Select a weekly period'); return; }
        if (distributeType !== 'weekly') { setDistributeMsg('Staff payout only applies to weekly periods'); return; }
        setDistributing(true); setDistributeMsg('');
        try {
            const res = await base44.functions.invoke('distributeStaffPayout', { period_id: distributePeriod });
            setDistributeMsg(`✓ Staff: paid ${res.data?.paid} wallets — ${res.data?.totalOmenx} OMENX (skipped ${res.data?.skipped_already_paid || 0} already paid)`);
            setTimeout(() => setDistributeMsg(''), 8000);
        } catch (err) { setDistributeMsg(`✗ Staff: ${err.message}`); }
        setDistributing(false);
    };

    return (
        <div className="space-y-4">
            <AdminKillSnapshotBackfill />
            {/* Preview */}
            <div className="bg-[#0b0416]/80 border border-sky-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-sky-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Eye size={16} /> Preview Payouts (Dry Run)</h2>
                <div className="flex flex-wrap gap-2 items-end mb-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Type</label>
                        <select value={previewType} onChange={e => { setPreviewType(e.target.value); setPreviewPeriod(''); }} style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-sky-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500">
                            <option value="weekly">Weekly</option>
                            <option value="seasonal">Seasonal</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Period</label>
                        <select value={previewPeriod} onChange={e => setPreviewPeriod(e.target.value)} style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-sky-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500 w-56">
                            <option value="">— select period —</option>
                            {getPeriodOptions(previewType).map(o => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={handlePreview} disabled={previewing}
                        className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                        <Eye size={14} /> {previewing ? 'Loading...' : 'Preview'}
                    </button>
                </div>
                {previewError && <div className="text-red-400 text-sm mb-3">{previewError}</div>}
                {previewData && (
                    <>
                        <div className="flex flex-wrap gap-3 mb-3">
                            {[
                                { label: 'Total Spent', value: `${previewData.total_spent?.toFixed(2)} OMENX`, color: 'text-white' },
                                { label: 'Score Pool', value: `${previewData.reward_pool?.toFixed(2)} OMENX`, color: 'text-sky-400' },
                                ...(previewData.kill_reward_pool > 0 ? [{ label: 'Kill Pool', value: `${previewData.kill_reward_pool?.toFixed(2)} OMENX`, color: 'text-orange-400' }] : []),
                                { label: 'Player Payout', value: `${previewData.total_payout?.toFixed(2)} OMENX`, color: 'text-emerald-400' },
                                ...(previewData.kill_payout > 0 ? [{ label: 'Kill Payout', value: `${previewData.kill_payout?.toFixed(2)} OMENX`, color: 'text-orange-400' }] : []),
                                { label: 'Recipients', value: `${previewData.player_count}${previewData.kill_count ? ` + ${previewData.kill_count} kills` : ''}`, color: 'text-white' },
                            ].map(s => (
                                <div key={s.label} className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                                    <div className="text-[10px] text-slate-500 uppercase">{s.label}</div>
                                    <div className={`font-mono font-bold text-sm ${s.color}`}>{s.value}</div>
                                </div>
                            ))}
                            <div className={`border rounded-lg px-3 py-2 ${previewData.distributed ? 'bg-red-950/40 border-red-700' : 'bg-emerald-950/40 border-emerald-700'}`}>
                                <div className="text-[10px] text-slate-500 uppercase">Status</div>
                                <div className={`font-mono font-bold text-sm ${previewData.distributed ? 'text-red-400' : 'text-emerald-400'}`}>{previewData.distributed ? 'ALREADY DISTRIBUTED' : 'PENDING'}</div>
                            </div>
                        </div>

                        {/* Resume-on-retry summary — only shown if a previous attempt partially paid */}
                        {(previewData.paid_player_count > 0 || previewData.paid_staff_count > 0) && (
                            <div className="bg-amber-950/30 border border-amber-700/60 rounded-lg p-3 mb-3">
                                <div className="text-amber-300 font-bold text-sm mb-2 uppercase tracking-wider">⚠️ Partial payout detected — retry will resume</div>
                                <div className="flex flex-wrap gap-3 text-xs">
                                    <div className="bg-slate-900/60 border border-amber-800/40 rounded px-3 py-2">
                                        <div className="text-[10px] text-slate-500 uppercase">Already Paid</div>
                                        <div className="font-mono font-bold text-amber-400">{previewData.paid_player_count} players{previewData.paid_staff_count ? ` + ${previewData.paid_staff_count} staff` : ''}</div>
                                    </div>
                                    <div className="bg-slate-900/60 border border-emerald-800/40 rounded px-3 py-2">
                                        <div className="text-[10px] text-slate-500 uppercase">Pending (Will Pay)</div>
                                        <div className="font-mono font-bold text-emerald-400">{previewData.pending_player_count} players{previewData.pending_staff_count ? ` + ${previewData.pending_staff_count} staff` : ''}</div>
                                    </div>
                                    <div className="bg-slate-900/60 border border-emerald-800/40 rounded px-3 py-2">
                                        <div className="text-[10px] text-slate-500 uppercase">Retry Will Send</div>
                                        <div className="font-mono font-bold text-emerald-400">{previewData.pending_grand_total?.toFixed(2)} OMENX</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                    <tr>
                                        <th className="p-2 text-center">Rank</th>
                                        <th className="p-2">Player</th>
                                        <th className="p-2">Wallet</th>
                                        <th className="p-2 text-right">Score</th>
                                        <th className="p-2 text-right">Would Receive</th>
                                    </tr>
                                </thead>
                                <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                    {/* extra status column — only matters when some rows are already paid */}
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {(previewData.payments || []).map(p => (
                                        <tr key={p.rank} className={`hover:bg-slate-800/30 ${p.already_paid ? 'bg-amber-950/20 opacity-60' : ''}`}>
                                            <td className="p-2 text-center font-mono">{p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank-1] : `#${p.rank}`}</td>
                                            <td className="p-2 font-bold text-white">
                                                {p.player_name}
                                                {p.already_paid && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 uppercase">Paid</span>}
                                            </td>
                                            <td className="p-2 text-slate-500 font-mono text-[10px]">{p.wallet_address ? `${p.wallet_address.slice(0,6)}...${p.wallet_address.slice(-4)}` : '-'}</td>
                                            <td className="p-2 text-right font-mono text-slate-300">{(p.score || 0).toLocaleString()}</td>
                                            <td className={`p-2 text-right font-mono font-bold ${p.already_paid ? 'text-amber-400 line-through' : 'text-sky-400'}`}>{p.amount.toFixed(2)} OMENX</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {(previewData.kill_payments || []).length > 0 && (
                            <div className="mt-4">
                                <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">Weekly Kill Payouts (S7+ — top sector kills)</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                            <tr>
                                                <th className="p-2 text-center">Rank</th>
                                                <th className="p-2">Player</th>
                                                <th className="p-2">Wallet</th>
                                                <th className="p-2 text-right">Kills</th>
                                                <th className="p-2 text-right">Would Receive</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {previewData.kill_payments.map(p => (
                                                <tr key={p.rank} className={`hover:bg-slate-800/30 ${p.already_paid ? 'bg-amber-950/20 opacity-60' : ''}`}>
                                                    <td className="p-2 text-center font-mono">{p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank-1] : `#${p.rank}`}</td>
                                                    <td className="p-2 font-bold text-white">
                                                        {p.player_name}
                                                        {p.already_paid && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 uppercase">Paid</span>}
                                                    </td>
                                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{p.wallet_address ? `${p.wallet_address.slice(0,6)}...${p.wallet_address.slice(-4)}` : '-'}</td>
                                                    <td className="p-2 text-right font-mono text-slate-300">{(p.score || 0).toLocaleString()}</td>
                                                    <td className={`p-2 text-right font-mono font-bold ${p.already_paid ? 'text-amber-400 line-through' : 'text-orange-400'}`}>{p.amount.toFixed(2)} OMENX</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {(previewData.staff_payments || []).length > 0 && (
                            <div className="mt-4">
                                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">Staff Payouts</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                            <tr>
                                                <th className="p-2">Staff</th>
                                                <th className="p-2">Wallet</th>
                                                <th className="p-2 text-right">% of Pool</th>
                                                <th className="p-2 text-right">Would Receive</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {previewData.staff_payments.map(p => (
                                                <tr key={p.wallet_address} className={`hover:bg-slate-800/30 ${p.already_paid ? 'bg-amber-950/20 opacity-60' : ''}`}>
                                                    <td className="p-2 font-bold text-white">
                                                        {p.player_name}
                                                        {p.already_paid && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 uppercase">Paid</span>}
                                                    </td>
                                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{p.wallet_address ? `${p.wallet_address.slice(0,6)}...${p.wallet_address.slice(-4)}` : '-'}</td>
                                                    <td className="p-2 text-right font-mono text-slate-400">{((p.pct || 0) * 100).toFixed(2)}%</td>
                                                    <td className={`p-2 text-right font-mono font-bold ${p.already_paid ? 'text-amber-400 line-through' : 'text-amber-400'}`}>{p.amount.toFixed(2)} OMENX</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Distribute */}
            <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Send size={16} /> Distribute Rewards</h2>
                <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Type</label>
                        <select value={distributeType} onChange={e => { setDistributeType(e.target.value); setDistributePeriod(''); }} style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-emerald-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500">
                            <option value="weekly">Weekly</option>
                            <option value="seasonal">Seasonal</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 uppercase">Period</label>
                        <select value={distributePeriod} onChange={e => setDistributePeriod(e.target.value)} style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-emerald-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500 w-56">
                            <option value="">— select period —</option>
                            {getPeriodOptions(distributeType).map(o => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={handleDistribute} disabled={distributing}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                        <Send size={14} /> {distributing ? 'Distributing...' : 'Distribute (Players)'}
                    </button>
                    {distributeType === 'weekly' && (
                        <>
                            <button onClick={handleDistributeStaff} disabled={distributing}
                                title="Standalone staff payout — run separately to avoid 504 timeouts"
                                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                                <Send size={14} /> Staff Only
                            </button>
                            <button onClick={handleDistributeKills} disabled={distributing}
                                title="Standalone weekly kill-pool payout — S7+ only. Run separately to avoid 504 timeouts."
                                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2">
                                <Send size={14} /> Kill Pool Only
                            </button>
                        </>
                    )}
                </div>
                <div className="text-[11px] text-slate-500 mt-2 leading-snug">
                    Run the three buttons separately for weekly periods to avoid gateway 504 timeouts — all three are resume-safe and idempotent.
                    On failure, the wallets in flight are logged as <span className="text-amber-400 font-mono">tx_id="pending-…"</span> and will be skipped on retry to prevent double-pays. If OmenX shows the on-chain payment succeeded for a "pending" row, you can safely leave it; if it didn't, delete that PayoutLog row and re-run.
                </div>
                {distributeMsg && <div className={`mt-2 text-sm font-mono ${distributeMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{distributeMsg}</div>}
            </div>

            {/* Payout Log */}
            <div className="bg-[#0b0416]/80 border border-yellow-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Trophy size={16} /> Payout Log</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                            <tr>
                                <th className="p-2">Date</th>
                                <th className="p-2">Player</th>
                                <th className="p-2">Wallet</th>
                                <th className="p-2 text-center">Rank</th>
                                <th className="p-2 text-right">OMENX</th>
                                <th className="p-2">Period</th>
                                <th className="p-2">Type</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {(payoutLogs || []).map(log => (
                                <tr key={log.id} className="hover:bg-slate-800/30">
                                    <td className="p-2 text-slate-400 font-mono text-[10px] whitespace-nowrap">{moment(log.created_date).format('MMM D, YYYY HH:mm')}</td>
                                    <td className="p-2 font-bold text-white whitespace-nowrap">{log.player_name}</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]" title={log.wallet_address}>{log.wallet_address ? `${log.wallet_address.slice(0,6)}...${log.wallet_address.slice(-4)}` : '-'}</td>
                                    <td className="p-2 text-center font-mono">{log.rank <= 3 ? ['🥇','🥈','🥉'][log.rank-1] : `#${log.rank}`}</td>
                                    <td className="p-2 text-right font-mono font-bold text-yellow-400">{Number(log.amount).toFixed(2)}</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{log.period_id}</td>
                                    <td className="p-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${log.period_type === 'weekly' ? 'bg-cyan-900/50 text-cyan-400' : 'bg-purple-900/50 text-purple-400'}`}>{log.period_type}</span></td>
                                </tr>
                            ))}
                            {!(payoutLogs || []).length && <tr><td colSpan="7" className="p-6 text-center text-slate-500">No payouts yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}