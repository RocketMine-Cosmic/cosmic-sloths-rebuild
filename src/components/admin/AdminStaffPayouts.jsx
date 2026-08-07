import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Coins } from 'lucide-react';
import moment from 'moment';
// Use the canonical ISO 8601 helper (Mon-start, Sun 23:59 UTC end). The previous
// local Sun-start formula made this card show next week's id a day early on Sundays.
import { getCurrentWeekId } from './useAvailablePeriods';

const FALLBACK_STAFF_PCT = 0.02; // matches distributeRewards.js fallback

// Shows what each staff member is on track to earn from the current weekly OMENX pool.
// Each admin wallet receives 2% of total weekly spend (set in distributeRewards.js → STAFF_PCT_PER_WALLET).
// Past weeks are pulled from PayoutLog where period_type === 'staff_weekly'.
export default function AdminStaffPayouts({ canViewFinance }) {
    const currentWeekId = getCurrentWeekId();

    // Share unified cache keys with the rest of the admin dashboard so panels
    // mounted on the same tab don't each fire their own pools/payouts/wallets fetch.
    const { data: admins = [], isLoading: adminsLoading } = useQuery({
        queryKey: ['adminWalletsList'],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'adminWallets' }).then(r => r.data?.records || []),
        staleTime: 60_000,
    });

    const { data: pools = [], isLoading: poolsLoading } = useQuery({
        queryKey: ['adminPoolsForPeriods'],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'pools' }).then(r => r.data?.pools || []),
        enabled: canViewFinance,
        staleTime: 60_000,
    });

    const { data: payouts = [] } = useQuery({
        queryKey: ['adminPayouts'],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'payouts' }).then(r => r.data?.payouts || []),
        enabled: canViewFinance,
        staleTime: 60_000,
        select: (rows) => rows.filter(p => p.period_type === 'staff_weekly'),
    });

    // Live staff % from AppConfig (any admin can read; falls back to 0.02 if missing)
    const { data: pctConfig } = useQuery({
        queryKey: ['staffPayoutPct'],
        queryFn: () => base44.functions.invoke('setStaffPayoutPct', {
            action: 'get',
            adminKey: sessionStorage.getItem('admin_key') || undefined,
        }).then(r => r.data).catch(() => null),
        enabled: canViewFinance,
    });
    const STAFF_PCT_PER_WALLET = Number(pctConfig?.pct ?? FALLBACK_STAFF_PCT);

    if (!canViewFinance) {
        return (
            <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Coins size={16} /> Staff Weekly Payouts
                </h2>
                <div className="text-xs text-slate-400">
                    🔒 Hidden — requires <span className="font-mono">view_finance</span> permission. Ask an owner to grant it.
                </div>
            </div>
        );
    }

    const currentPool = pools.find(p => p.period_type === 'weekly' && p.period_id === currentWeekId);
    const currentSpent = currentPool?.total_spent || 0;
    // Per-wallet override (AdminWallet.payout_pct_override) takes priority over the global pct.
    const effectivePctFor = (a) => {
        const o = a.payout_pct_override;
        if (o !== null && o !== undefined && isFinite(Number(o))) return Number(o);
        return STAFF_PCT_PER_WALLET;
    };
    const perStaffByAdmin = (a) => Math.floor(currentSpent * effectivePctFor(a));
    const totalStaffWeekly = admins.reduce((sum, a) => sum + perStaffByAdmin(a), 0);

    // Group past payouts by week for the recent history table
    const recentByWeek = {};
    payouts.forEach(p => {
        if (!recentByWeek[p.period_id]) recentByWeek[p.period_id] = { period_id: p.period_id, total: 0, count: 0, recipients: [] };
        recentByWeek[p.period_id].total += Number(p.amount) || 0;
        recentByWeek[p.period_id].count += 1;
        recentByWeek[p.period_id].recipients.push({ name: p.player_name, amount: p.amount, date: p.created_date });
    });
    const weekHistory = Object.values(recentByWeek).sort((a, b) => b.period_id.localeCompare(a.period_id)).slice(0, 8);

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Coins size={16} /> Staff Weekly Payouts
                </h2>
                <span className="text-[10px] text-slate-500 font-mono">{(STAFF_PCT_PER_WALLET * 100).toFixed(2)}% of weekly spend per staff wallet</span>
            </div>

            {/* Current week summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="bg-slate-900/60 border border-slate-700 rounded p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Current Week</div>
                    <div className="text-sm font-mono font-bold text-white">{currentWeekId}</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Spent So Far</div>
                    <div className="text-sm font-mono font-bold text-cyan-400">{currentSpent.toFixed(1)} OMENX</div>
                </div>
                <div className="bg-slate-900/60 border border-amber-700/40 rounded p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Per Staff (Default)</div>
                    <div className="text-sm font-mono font-bold text-amber-400">{Math.floor(currentSpent * STAFF_PCT_PER_WALLET).toLocaleString()} OMENX</div>
                </div>
                <div className="bg-slate-900/60 border border-amber-700/40 rounded p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Total Staff Cost</div>
                    <div className="text-sm font-mono font-bold text-amber-400">{totalStaffWeekly.toLocaleString()} OMENX</div>
                </div>
            </div>

            {/* Per-staff breakdown */}
            <div className="text-[10px] text-slate-500 uppercase mb-2">This Week's Projected Payout — {admins.length} staff member(s)</div>
            {(adminsLoading || poolsLoading) ? (
                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-amber-500"></div></div>
            ) : admins.length === 0 ? (
                <div className="text-slate-500 text-sm py-4 text-center">No staff configured.</div>
            ) : (
                <div className="space-y-1 mb-4">
                    {admins.map(a => {
                        const pct = effectivePctFor(a);
                        const hasOverride = a.payout_pct_override !== null && a.payout_pct_override !== undefined && isFinite(Number(a.payout_pct_override));
                        return (
                            <div key={a.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-800 rounded px-3 py-1.5">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="text-sm font-bold text-white truncate">{a.admin_name || 'Unnamed'}</span>
                                    {(a.permissions || []).includes('owner') && <span className="text-[9px] bg-yellow-900/50 text-yellow-300 px-1 py-0.5 rounded font-bold shrink-0">👑 OWNER</span>}
                                    {hasOverride && <span className="text-[9px] bg-amber-900/40 border border-amber-700/40 text-amber-300 px-1 py-0.5 rounded font-bold shrink-0">custom {(pct * 100).toFixed(2)}%</span>}
                                    <span className="text-[10px] text-slate-500 font-mono truncate">{a.wallet_address?.slice(0, 8)}…{a.wallet_address?.slice(-4)}</span>
                                </div>
                                <span className="text-sm font-mono font-bold text-amber-400 shrink-0">{perStaffByAdmin(a).toLocaleString()} OMENX</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Past weeks */}
            {weekHistory.length > 0 && (
                <>
                    <div className="text-[10px] text-slate-500 uppercase mb-2 mt-4">Past Staff Payouts</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                <tr>
                                    <th className="p-2">Week</th>
                                    <th className="p-2 text-right">Recipients</th>
                                    <th className="p-2 text-right">Per Staff</th>
                                    <th className="p-2 text-right">Total Paid</th>
                                    <th className="p-2">Distributed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {weekHistory.map(w => (
                                    <tr key={w.period_id} className="hover:bg-slate-800/30">
                                        <td className="p-2 font-mono font-bold text-white">{w.period_id}</td>
                                        <td className="p-2 text-right font-mono text-slate-300">{w.count}</td>
                                        <td className="p-2 text-right font-mono text-slate-300">{w.count > 0 ? Math.floor(w.total / w.count).toLocaleString() : 0}</td>
                                        <td className="p-2 text-right font-mono font-bold text-amber-400">{w.total.toLocaleString()} OMENX</td>
                                        <td className="p-2 text-slate-500 font-mono text-[10px]">{moment(w.recipients[0]?.date).format('MMM D, YYYY')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}