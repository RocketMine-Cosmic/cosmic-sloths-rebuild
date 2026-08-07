import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
// Use the canonical ISO 8601 helper (Mon-start, Sun 23:59 UTC end). The previous
// local Sun-start formula made this card show next week's id a day early on Sundays.
import { getCurrentWeekId, getCurrentSeasonId } from './useAvailablePeriods';

function getCurrentPeriodIds() {
    return { week_id: getCurrentWeekId(), season_id: getCurrentSeasonId() };
}

function StatusRow({ label, status, value, detail }) {
    const icon = status === 'ok'
        ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
        : status === 'warn'
        ? <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
        : <XCircle size={14} className="text-red-400 shrink-0" />;

    return (
        <div className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-xs text-slate-300">{label}</span>
                {detail && <span className="text-[10px] text-slate-500">— {detail}</span>}
            </div>
            <span className={`text-xs font-mono font-bold ${status === 'ok' ? 'text-emerald-400' : status === 'warn' ? 'text-yellow-400' : 'text-red-400'}`}>
                {value}
            </span>
        </div>
    );
}

export default function AdminHealthCheck({ walletAddress }) {
    const { week_id, season_id } = getCurrentPeriodIds();

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['adminHealthCheck', walletAddress],
        queryFn: () => base44.functions.invoke('adminHealthCheck', {}).then(r => r.data || {}),
        enabled: !!walletAddress,
        refetchInterval: 60000,
    });

    return (
        <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-emerald-400 uppercase tracking-widest">🩺 System Health</h2>
                <button onClick={() => refetch()} disabled={isFetching}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 px-2 py-1 rounded transition-colors">
                    <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-emerald-500"></div></div>
            ) : (
                <div className="space-y-4">
                    {/* Period IDs */}
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Current Period IDs</div>
                        <StatusRow label="Current Week" status="ok" value={week_id} />
                        <StatusRow label="Current Season" status="ok" value={season_id} />
                    </div>

                    {/* Pools */}
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Token Pools</div>
                        <StatusRow
                            label="Undistributed Pools"
                            status={data?.undistributedCount > 3 ? 'error' : data?.undistributedCount > 0 ? 'warn' : 'ok'}
                            value={data?.undistributedCount ?? '...'}
                            detail={data?.undistributedCount > 0 ? 'need distributing' : 'all distributed'}
                        />
                        <StatusRow
                            label="This Week Pool Exists"
                            status={data?.weeklyPoolExists ? 'ok' : 'warn'}
                            value={data?.weeklyPoolExists ? 'Yes' : 'Not yet'}
                        />
                        <StatusRow
                            label="This Season Pool Exists"
                            status={data?.seasonalPoolExists ? 'ok' : 'warn'}
                            value={data?.seasonalPoolExists ? 'Yes' : 'Not yet'}
                        />
                    </div>

                    {/* Data */}
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Data Integrity</div>
                        <StatusRow label="Total Players" status="ok" value={data?.totalPlayers ?? '...'} />
                        <StatusRow label="Scores This Week" status="ok" value={data?.scoresThisWeek ?? '...'} />
                        <StatusRow
                            label="Duplicate Scores (this week)"
                            status={data?.duplicateCount > 0 ? 'warn' : 'ok'}
                            value={data?.duplicateCount ?? '...'}
                            detail={data?.duplicateCount > 0 ? 'check leaderboard tab' : ''}
                        />
                        <StatusRow
                            label="Orphaned Squad Members"
                            status={data?.orphanedMembers > 0 ? 'warn' : 'ok'}
                            value={data?.orphanedMembers ?? '...'}
                        />
                    </div>

                    {/* Boss */}
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                        <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Global Raid Boss</div>
                        <StatusRow
                            label="This Week's Boss"
                            status={data?.bossExists ? 'ok' : 'warn'}
                            value={data?.bossExists ? (data?.bossDefeated ? '☠️ Defeated' : `${data?.bossHpPct ?? '?'}% HP`) : 'Not spawned'}
                        />
                        <StatusRow label="Total Contributors" status="ok" value={data?.bossContributors ?? '...'} />
                    </div>
                </div>
            )}
        </div>
    );
}