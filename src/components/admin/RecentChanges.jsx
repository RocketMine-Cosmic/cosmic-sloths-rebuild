import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, Settings, Zap, Shield } from 'lucide-react';
import moment from 'moment';

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

export default function RecentChanges() {
  // Polled at 60s (was 10s — that was 6 reads/min per admin sitting on Overview,
  // contributing to the dashboard's 429 bursts). Audit log doesn't need real-time.
  const { data: changes } = useQuery({
    queryKey: ['adminChangesLog'],
    queryFn: () => base44.entities.AdminChangesLog.list('-created_date', 20),
    enabled: true,
    // Audit log is read-only background info — 5 min poll is plenty and
    // matches the rest of the Overview tab's staleness budget.
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4" /> Recent Changes
      </h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {!changes || changes.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-6">No administrative changes logged yet.</div>
        ) : (
          changes.map(change => (
            <div key={change.id} className={`border rounded-lg p-3 ${ACTION_COLORS[change.action_type]}`}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{ACTION_ICONS[change.action_type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{change.description}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {change.wallet_address ? `${change.wallet_address.slice(0, 6)}...${change.wallet_address.slice(-4)}` : 'System'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{moment(change.created_date).fromNow()}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}