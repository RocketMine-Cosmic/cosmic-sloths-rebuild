import React from 'react';
import { Flame, Users } from 'lucide-react';

// One row in the squad raid damage leaderboard
export default function RaidLeaderboardRow({ entry, rank, isMine }) {
    const rankStyles = {
        1: { color: 'text-amber-300', bg: 'bg-amber-950/40 border-amber-500/50' },
        2: { color: 'text-slate-200', bg: 'bg-slate-800/60 border-slate-500/50' },
        3: { color: 'text-orange-300', bg: 'bg-orange-950/40 border-orange-600/50' },
    };
    const style = rankStyles[rank] || { color: 'text-slate-400', bg: 'bg-slate-900/60 border-slate-700' };

    return (
        <div className={`flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border ${style.bg} ${isMine ? 'ring-2 ring-cyan-400/50' : ''}`}>
            <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center font-black text-xs md:text-sm ${style.color} bg-slate-950/60 shrink-0`}>
                #{rank}
            </div>
            <span className="text-xl md:text-2xl shrink-0 w-8 h-8 md:w-9 md:h-9 inline-flex items-center justify-center overflow-hidden rounded-md bg-slate-900">
                {entry.squad_icon?.startsWith('http') ? <img src={entry.squad_icon} className="w-full h-full object-cover" alt="" /> : (entry.squad_icon || '🛡️')}
            </span>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-xs md:text-sm flex items-center gap-1.5 flex-wrap">
                    <span className="truncate min-w-0">{entry.squad_name}</span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded shrink-0">[{entry.squad_tag}]</span>
                    {isMine && <span className="text-[10px] bg-cyan-900 text-cyan-300 px-1.5 rounded shrink-0">YOU</span>}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3" /> {entry.contributor_count} contributor{entry.contributor_count === 1 ? '' : 's'}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="text-sm md:text-lg font-black text-rose-300 tabular-nums flex items-center gap-1 justify-end">
                    <Flame className="w-3.5 h-3.5 md:w-4 md:h-4 text-rose-500" />
                    {entry.total_damage.toLocaleString()}
                </div>
                <div className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest">damage</div>
            </div>
        </div>
    );
}