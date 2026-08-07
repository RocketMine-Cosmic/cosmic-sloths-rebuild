import React from 'react';
import { Activity, Skull, Trophy } from 'lucide-react';

function timeAgo(iso) {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
}

function fmtDuration(sec) {
    const m = Math.floor((sec || 0) / 60);
    const s = Math.floor((sec || 0) % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// Live feed of every member's recent runs in the last 7 days. Read-only.
export default function MemberActivityFeed({ activity, loading }) {
    return (
        <div className="bg-[#0b0416]/80 border border-cyan-700/50 rounded-xl p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm md:text-base font-bold text-cyan-300 uppercase tracking-widest">Contribution Feed</h3>
                <span className="text-[10px] text-slate-500 ml-auto">Last 7 days</span>
            </div>

            {loading ? (
                <div className="text-xs text-slate-500 italic">Loading recent runs…</div>
            ) : activity.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No squad runs in the last 7 days.</div>
            ) : (
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                    {activity.map(a => (
                        <div key={a.id} className="bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 flex items-center gap-3">
                            <div className="text-cyan-400 shrink-0">
                                <Skull className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-white font-bold truncate">{a.player_name || 'Pilot'}</div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                                    <span className="text-rose-300">{a.kills} kills</span>
                                    <span>·</span>
                                    <span className="text-cyan-300">Lv {a.level}</span>
                                    <span>·</span>
                                    <span className="text-slate-300">{fmtDuration(a.time_survived)}</span>
                                    <span>·</span>
                                    <span className="text-amber-300 inline-flex items-center gap-1"><Trophy className="w-3 h-3" />{a.score?.toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-500 shrink-0">{timeAgo(a.created_date)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}