import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Coins, AlertCircle, CheckCircle2, Loader2, Clock } from 'lucide-react';
import moment from 'moment';
import PlayerSearchInput from './PlayerSearchInput';
import ConfirmDialog from './ConfirmDialog';
import { arenaLabel } from '@/lib/arenaLabels';

// Render relative time using UTC as the reference clock.
// Hugo's bug report: device clock skew was making the "When" column show
// "in 4 hours" for runs that just happened. moment().fromNow() uses the
// device's local Date.now(), so a misconfigured device produces nonsense.
// Fix: compute the delta in UTC ms and clamp future timestamps to "just now".
function utcRelativeTime(iso) {
    if (!iso) return '—';
    const t = moment.utc(iso);
    const now = moment.utc();
    if (t.isAfter(now)) return 'just now'; // clamp clock skew
    return t.from(now);
}

// Admin tool: look up any player's gold history, see blocked sync attempts,
// and refund gold in one click.

export default function AdminGoldAudit() {
    const [selected, setSelected] = useState(null);
    const [audit, setAudit] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [refunding, setRefunding] = useState(false);
    const [refundResult, setRefundResult] = useState('');
    const [customRefund, setCustomRefund] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);

    const adminKey = sessionStorage.getItem('admin_key') || undefined;

    const handleSelect = async (player) => {
        setSelected(player);
        setAudit(null);
        setError('');
        setRefundResult('');
        if (!player) return;
        setLoading(true);
        try {
            const res = await base44.functions.invoke('auditPlayerGold', {
                walletAddress: player.wallet_address,
                adminKey,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setAudit(res.data);
            setCustomRefund(String(res.data?.suggestedGoldRefund || 0));
        } catch (err) {
            setError(err.message || 'Lookup failed');
        }
        setLoading(false);
    };

    const refund = async () => {
        const amount = parseInt(customRefund, 10);
        if (!amount || amount <= 0) {
            setRefundResult('❌ Enter a positive amount');
            setConfirmOpen(false);
            return;
        }
        setRefunding(true);
        setRefundResult('');
        try {
            const saves = await base44.entities.PlayerSave.filter({ wallet_address: audit.wallet });
            if (!saves || saves.length === 0) throw new Error('PlayerSave not found');
            const saveId = saves[0].id;
            const newGold = (audit.currentCloudGold || 0) + amount;

            const res = await base44.functions.invoke('adminPatchSave', {
                saveId,
                patch: { gold: newGold },
                adminKey,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setRefundResult(`✅ Credited ${amount.toLocaleString()} gold. New balance: ${newGold.toLocaleString()}`);
            setAudit(a => ({ ...a, currentCloudGold: newGold }));
        } catch (err) {
            setRefundResult(`❌ ${err.message}`);
        }
        setRefunding(false);
        setConfirmOpen(false);
    };

    return (
        <div className="bg-slate-900/60 border border-amber-900/40 rounded-xl p-5 space-y-5">
            <div>
                <h2 className="text-lg font-black uppercase tracking-widest text-amber-400 flex items-center gap-2 mb-1">
                    <Coins className="w-5 h-5" /> Player Gold Audit
                </h2>
                <p className="text-xs text-slate-400">
                    Look up any wallet to see their gold history, blocked sync attempts (likely cause of "lost gold"), and one-click refund.
                </p>
            </div>

            <PlayerSearchInput selected={selected} onSelect={handleSelect} accent="amber" />
            {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading audit…
                </div>
            )}

            {error && (
                <div className="bg-red-950/40 border border-red-900/50 text-red-300 text-xs p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {audit && (
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SummaryCell label="Current Gold" value={audit.currentCloudGold?.toLocaleString() || '0'} accent="text-yellow-400" />
                        <SummaryCell label="Total Earned" value={audit.currentTotalGoldEarned?.toLocaleString() || '0'} accent="text-emerald-400" />
                        <SummaryCell label="Total Kills" value={audit.currentTotalKills?.toLocaleString() || '0'} />
                        <SummaryCell
                            label="Last Sync"
                            value={audit.lastSync ? utcRelativeTime(audit.lastSync) : '—'}
                            small
                        />
                    </div>

                    {audit.playerName && (
                        <div className="text-xs text-slate-400">
                            Player: <span className="text-white font-bold">{audit.playerName}</span>
                            <span className="ml-3 font-mono text-slate-500">{audit.wallet}</span>
                        </div>
                    )}

                    {/* Blocked syncs */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="bg-slate-900/80 px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5" /> Blocked Sync Attempts ({audit.blockedSyncs?.length || 0})
                            </h3>
                            {audit.suggestedGoldRefund > 0 && (
                                <span className="text-[10px] bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded font-bold">
                                    Suggested refund: {audit.suggestedGoldRefund.toLocaleString()} gold
                                </span>
                            )}
                        </div>
                        {audit.blockedSyncs?.length === 0 ? (
                            <div className="p-3 text-xs text-slate-500 italic">No blocks recorded — good sign.</div>
                        ) : (
                            <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-900/40 sticky top-0">
                                        <tr className="text-slate-400">
                                            <th className="text-left p-2 font-mono">When</th>
                                            <th className="text-left p-2">Field</th>
                                            <th className="text-right p-2">Client</th>
                                            <th className="text-right p-2">Cloud</th>
                                            <th className="text-right p-2">Δ</th>
                                            <th className="text-left p-2">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {audit.blockedSyncs.map((b, i) => (
                                            <tr key={i} className="border-t border-slate-800/60">
                                                <td className="p-2 text-slate-500 font-mono">{utcRelativeTime(b.created)}</td>
                                                <td className="p-2 text-white font-bold">{b.field}</td>
                                                <td className="p-2 text-right text-slate-300 font-mono">{b.client_value?.toLocaleString()}</td>
                                                <td className="p-2 text-right text-slate-400 font-mono">{b.cloud_value?.toLocaleString()}</td>
                                                <td className={`p-2 text-right font-mono font-bold ${b.delta > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                                    {b.delta > 0 ? '+' : ''}{b.delta?.toLocaleString()}
                                                </td>
                                                <td className="p-2 text-[10px] text-slate-500">
                                                    {b.client_was_stale && <span className="bg-red-950/50 text-red-300 px-1 rounded mr-1">STALE</span>}
                                                    {b.notes}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Recent runs */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="bg-slate-900/80 px-3 py-2 border-b border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5" /> Recent Runs ({audit.recentRuns?.length || 0})
                            </h3>
                        </div>
                        {audit.recentRuns?.length === 0 ? (
                            <div className="p-3 text-xs text-slate-500 italic">No runs recorded.</div>
                        ) : (
                            <div className="max-h-48 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-900/40 sticky top-0">
                                        <tr className="text-slate-400">
                                            <th className="text-left p-2">When</th>
                                            <th className="text-right p-2">Score</th>
                                            <th className="text-right p-2">Kills</th>
                                            <th className="text-right p-2">Lvl</th>
                                            <th className="text-right p-2">Time</th>
                                            <th className="text-right p-2" title="Raw gold the client reported">Earned</th>
                                            <th className="text-right p-2" title="Gold actually credited after server caps">Credited</th>
                                            <th className="text-left p-2">Arena</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {audit.recentRuns.map((r, i) => {
                                            const earned = r.gold_earned;
                                            const credited = r.gold_credited;
                                            const capped = earned != null && credited != null && credited < earned;
                                            return (
                                                <tr key={i} className="border-t border-slate-800/60">
                                                    <td className="p-2 text-slate-500">{utcRelativeTime(r.created)}</td>
                                                    <td className="p-2 text-right text-cyan-400 font-mono">{r.score?.toLocaleString()}</td>
                                                    <td className="p-2 text-right text-slate-300 font-mono">{r.kills}</td>
                                                    <td className="p-2 text-right text-slate-300 font-mono">{r.level}</td>
                                                    <td className="p-2 text-right text-slate-300 font-mono">{r.time}s</td>
                                                    <td className="p-2 text-right text-yellow-400 font-mono">
                                                        {earned != null ? earned.toLocaleString() : <span className="text-slate-600">—</span>}
                                                    </td>
                                                    <td className={`p-2 text-right font-mono ${capped ? 'text-red-400' : 'text-yellow-300'}`} title={capped ? 'Capped — credited less than earned' : ''}>
                                                        {credited != null ? credited.toLocaleString() : <span className="text-slate-600">—</span>}
                                                        {capped && <span className="ml-1 text-[9px]">⚠</span>}
                                                    </td>
                                                    <td className="p-2 text-slate-400">{arenaLabel(r.arena)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Refund form */}
                    <div className="bg-amber-950/20 border border-amber-700/40 rounded-lg p-4 space-y-3">
                        <h3 className="text-sm font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                            <Coins className="w-4 h-4" /> Refund Gold
                        </h3>
                        <p className="text-[11px] text-amber-200/70">
                            Adds gold on top of current cloud balance. Suggested amount = the largest blocked sync delta (most likely lost amount).
                        </p>
                        <div className="flex gap-2 items-center">
                            <input
                                type="number"
                                value={customRefund}
                                onChange={(e) => setCustomRefund(e.target.value)}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500"
                                placeholder="Amount"
                            />
                            <button
                                onClick={() => setConfirmOpen(true)}
                                disabled={refunding || !customRefund || parseInt(customRefund, 10) <= 0}
                                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm whitespace-nowrap"
                            >
                                {refunding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Credit Gold
                            </button>
                        </div>
                        {refundResult && (
                            <div className={`text-xs p-2 rounded font-mono ${refundResult.startsWith('✅') ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/40 text-red-300'}`}>
                                {refundResult}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => !refunding && setConfirmOpen(false)}
                onConfirm={refund}
                busy={refunding}
                title="Credit gold to player"
                description={audit ? `Credit ${parseInt(customRefund || 0, 10).toLocaleString()} gold to ${audit.playerName || audit.wallet?.slice(0, 10)}? New balance will be ${((audit.currentCloudGold || 0) + parseInt(customRefund || 0, 10)).toLocaleString()}.` : ''}
                confirmLabel="Credit gold"
            />
        </div>
    );
}

function SummaryCell({ label, value, accent = 'text-white', small }) {
    return (
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</div>
            <div className={`${small ? 'text-sm' : 'text-xl'} font-black font-mono ${accent}`}>{value}</div>
        </div>
    );
}