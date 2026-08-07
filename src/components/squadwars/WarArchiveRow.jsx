import React from 'react';
import { Crown, Swords } from 'lucide-react';

// Read-only detailed row for a single resolved war in the global archive.
// Shows both squads, kill counts, a kill-share bar, and a clear winner indicator.
export default function WarArchiveRow({ war, mySquadId }) {
    const isBye = war.result_kind === 'bye' || !war.squad_b_id;
    const isTie = war.result_kind === 'tie';
    const winnerId = war.winner_squad_id;
    const totalKills = (war.kills_a || 0) + (war.kills_b || 0);
    const ratioA = totalKills > 0 ? (war.kills_a || 0) / totalKills : 0.5;
    const ratioB = 1 - ratioA;

    const Side = ({ side }) => {
        const isA = side === 'a';
        const id = isA ? war.squad_a_id : war.squad_b_id;
        const name = isA ? war.squad_a_name : war.squad_b_name;
        const tag = isA ? war.squad_a_tag : war.squad_b_tag;
        const icon = isA ? war.squad_a_icon : war.squad_b_icon;
        const lvl = isA ? war.squad_a_level : war.squad_b_level;
        const kills = isA ? (war.kills_a || 0) : (war.kills_b || 0);
        const isWinner = !isTie && !isBye && winnerId === id;
        const isMine = mySquadId && id === mySquadId;
        const noSquad = !id;

        return (
            <div className={`flex-1 min-w-0 rounded-lg p-2 md:p-3 border-2 transition-colors ${
                isWinner ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                         : 'border-slate-700 bg-slate-900/50'
            } ${isMine ? 'ring-2 ring-cyan-400/50' : ''}`}>
                <div className="flex items-center gap-1.5 md:gap-2 mb-1.5">
                    <span className="text-lg md:text-xl shrink-0 w-7 h-7 inline-flex items-center justify-center overflow-hidden rounded bg-slate-800">
                        {noSquad ? '👻' : (icon?.startsWith('http')
                            ? <img src={icon} className="w-full h-full object-cover" alt="" />
                            : (icon || '🛡️'))}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-white text-xs md:text-sm truncate">{name || (noSquad ? 'No Opponent' : 'Unknown')}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                            {tag && <span className="bg-slate-800 px-1 rounded">[{tag}]</span>}
                            {lvl > 0 && <span>Lv.{lvl}</span>}
                            {isMine && <span className="text-cyan-400 font-bold">YOU</span>}
                        </div>
                    </div>
                    {isWinner && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                </div>
                <div className={`text-xl md:text-2xl font-black tabular-nums ${isWinner ? 'text-amber-300' : 'text-slate-300'}`}>
                    {kills.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">kills</div>
            </div>
        );
    };

    const statusBadge = isBye
        ? { label: '✓ Bye Week', cls: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40' }
        : isTie
        ? { label: '🤝 Tie', cls: 'text-slate-300 bg-slate-800/60 border-slate-600' }
        : { label: '🏆 Decided', cls: 'text-amber-300 bg-amber-950/40 border-amber-500/40' };

    return (
        <div className="bg-[#0b0416]/60 border border-slate-700 rounded-xl p-3 md:p-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusBadge.cls}`}>
                    {statusBadge.label}
                </span>
                <div className="text-[10px] font-mono text-slate-500">{war.week_id}</div>
                {war.created_date && (
                    <div className="text-[10px] font-mono text-slate-600 ml-auto">
                        {new Date(war.created_date).toISOString().slice(0, 10)}
                    </div>
                )}
            </div>

            <div className="flex items-stretch gap-2 md:gap-3">
                <Side side="a" />
                <div className="flex flex-col items-center justify-center px-1 shrink-0">
                    <Swords className="w-5 h-5 text-red-400" />
                    <div className="text-[9px] text-slate-500 font-black tracking-widest mt-1">VS</div>
                </div>
                <Side side="b" />
            </div>

            {!isBye && (
                <div className="mt-3">
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: `${Math.max(2, ratioA * 100)}%` }} />
                        <div className="h-full bg-gradient-to-r from-rose-500 to-rose-300" style={{ width: `${Math.max(2, ratioB * 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>{Math.round(ratioA * 100)}%</span>
                        <span>{totalKills.toLocaleString()} total kills</span>
                        <span>{Math.round(ratioB * 100)}%</span>
                    </div>
                </div>
            )}
        </div>
    );
}