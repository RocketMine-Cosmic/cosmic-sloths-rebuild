import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Coins } from 'lucide-react';

// Compact live card — shows the signed-in staff member their own projected weekly OMENX
// based on the current weekly token pool. Refreshes every 30s.
//
// Uses `type: 'my_staff_income'` so non-finance staff can still see their own preview
// without being granted view_finance (which exposes all-time totals + logs).
export default function MyStaffIncomeCard({ walletAddress, isEmergencyKey }) {
    const { data, isLoading } = useQuery({
        queryKey: ['myStaffIncome'],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'my_staff_income' }).then(r => r.data),
        // Was 30s — that's way too aggressive for a passive header card.
        // Bumped to 2 min to ease pressure on the Base44 request quota.
        // 5 min poll — same staleness budget as the rest of the dashboard.
        // The card sits passively in the header; it doesn't need minute-precision.
        refetchInterval: 5 * 60_000,
        refetchOnWindowFocus: false,
        staleTime: 4 * 60_000,
        enabled: !isEmergencyKey && !!walletAddress,
    });

    if (isEmergencyKey || !walletAddress) return null;

    const weekId = data?.week_id || '';
    const totalSpent = Number(data?.total_spent ?? 0);
    const pct = Number(data?.pct ?? 0.02);
    const projected = Math.floor(totalSpent * pct);

    return (
        <div className="bg-gradient-to-r from-amber-950/60 to-slate-900/60 border border-amber-700/40 rounded-lg px-3 py-1.5 flex items-center gap-3 shrink-0">
            <Coins size={14} className="text-amber-400 shrink-0" />
            <div className="flex flex-col leading-tight">
                <span className="text-[9px] text-amber-300/70 uppercase tracking-wider font-bold">Your week ({weekId || '…'})</span>
                <span className="text-sm font-mono font-black text-amber-300">
                    {isLoading ? '…' : `${projected.toLocaleString()} OMENX`}
                </span>
            </div>
            <span className="text-[9px] text-slate-500 font-mono hidden md:inline">live</span>
        </div>
    );
}