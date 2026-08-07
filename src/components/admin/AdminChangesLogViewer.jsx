import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, Settings, Zap, Shield, Filter, User, ArrowRight } from 'lucide-react';
import moment from 'moment';
import AdminLogDetailsSummary from './AdminLogDetailsSummary';

const ACTION_ICONS = {
    sku_update: <Settings className="w-4 h-4 text-blue-400" />,
    reward_adjustment: <Zap className="w-4 h-4 text-yellow-400" />,
    pool_reset: <Shield className="w-4 h-4 text-purple-400" />,
    player_action: <Activity className="w-4 h-4 text-cyan-400" />,
    other: <Activity className="w-4 h-4 text-slate-400" />,
};

const ACTION_COLORS = {
    sku_update: 'bg-blue-900/30 border-blue-700/50',
    reward_adjustment: 'bg-yellow-900/30 border-yellow-700/50',
    pool_reset: 'bg-purple-900/30 border-purple-700/50',
    player_action: 'bg-cyan-900/30 border-cyan-700/50',
    other: 'bg-slate-800/30 border-slate-700/50',
};

export default function AdminChangesLogViewer() {
    const [filter, setFilter] = useState('all');

    const { data: changes, isLoading } = useQuery({
        queryKey: ['adminChangesLogFull'],
        queryFn: () => base44.entities.AdminChangesLog.list('-created_date', 100),
        refetchInterval: 15000,
    });

    // Look up staff display names so the log shows "Salty" not just 0xd2eb…
    const { data: adminWallets } = useQuery({
        queryKey: ['adminWalletsForLog'],
        queryFn: () => base44.entities.AdminWallet.list('-created_date', 200),
        staleTime: 60_000,
    });

    const walletNameMap = useMemo(() => {
        const m = {};
        (adminWallets || []).forEach(a => {
            if (a.wallet_address) m[a.wallet_address.toLowerCase()] = a.admin_name || null;
        });
        return m;
    }, [adminWallets]);

    const lookupName = (wallet) => {
        if (!wallet) return null;
        if (wallet === 'EMERGENCY_KEY') return '🔑 Emergency Key';
        if (wallet === 'system' || wallet === 'System') return 'System';
        return walletNameMap[wallet.toLowerCase()] || null;
    };

    const shortWallet = (w) => w && w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;

    // Pull the most likely "target" wallet out of the details blob — the schemas
    // are inconsistent across functions (target_wallet, wallet, new_wallet, etc.)
    const extractTargetWallet = (details) => {
        if (!details || typeof details !== 'object') return null;
        return details.target_wallet || details.wallet || details.new_wallet || details.player_wallet || null;
    };

    const filtered = (changes || []).filter(c => filter === 'all' || c.action_type === filter);

    return (
        <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-base font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={16} /> Admin Action Log
                </h2>
                <div className="ml-auto flex items-center gap-2">
                    <Filter size={12} className="text-slate-500" />
                    {['all', 'player_action', 'reward_adjustment', 'sku_update', 'pool_reset', 'other'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`text-[10px] px-2 py-1 rounded font-bold transition-colors uppercase ${filter === f ? 'bg-slate-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {f.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-slate-500"></div></div>
            ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {filtered.length === 0 ? (
                        <div className="text-xs text-slate-500 text-center py-8">No entries found.</div>
                    ) : filtered.map(change => {
                        const actorName = lookupName(change.wallet_address);
                        const targetWallet = extractTargetWallet(change.details);
                        const targetName = lookupName(targetWallet) || change.details?.target_player_name || change.details?.player_name || null;
                        return (
                        <div key={change.id} className={`border rounded-lg p-3 ${ACTION_COLORS[change.action_type]}`}>
                            <div className="flex items-start gap-2">
                                <div className="mt-0.5 shrink-0">{ACTION_ICONS[change.action_type]}</div>
                                <div className="flex-1 min-w-0">
                                    {/* Actor → Target headline so you see at a glance who did it to whom */}
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-900/80 border border-slate-600/60 rounded px-1.5 py-0.5">
                                            <User size={10} className="text-emerald-400" />
                                            <span className="text-emerald-300">{actorName || 'Unknown Staff'}</span>
                                            {change.wallet_address && change.wallet_address !== 'EMERGENCY_KEY' && (
                                                <span className="text-slate-500 font-mono">({shortWallet(change.wallet_address)})</span>
                                            )}
                                        </span>
                                        {(targetName || targetWallet) && (
                                            <>
                                                <ArrowRight size={11} className="text-slate-500 shrink-0" />
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-900/80 border border-slate-600/60 rounded px-1.5 py-0.5">
                                                    <span className="text-cyan-300">{targetName || 'Player'}</span>
                                                    {targetWallet && (
                                                        <span className="text-slate-500 font-mono">({shortWallet(targetWallet)})</span>
                                                    )}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-xs font-bold text-white">{change.description}</div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-slate-500">{moment(change.created_date).format('MMM D YYYY, HH:mm:ss')}</span>
                                        <span className="text-[10px] text-slate-600">{moment(change.created_date).fromNow()}</span>
                                    </div>
                                    <AdminLogDetailsSummary actionType={change.action_type} details={change.details} />
                                    {change.details && Object.keys(change.details).length > 0 && (
                                        <details className="mt-1.5">
                                            <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">Raw JSON</summary>
                                            <pre className="text-[9px] text-slate-400 mt-1 bg-slate-900/50 rounded p-2 overflow-x-auto">
                                                {JSON.stringify(change.details, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}