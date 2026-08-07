import React from 'react';
import { Crown, Swords, Skull, Coins, Puzzle } from 'lucide-react';

// Renders an individual war: side A vs side B, kill counts, and a winner badge
// when the war is resolved. `compact` = smaller variant for the Wars Board roster.
export default function WarHeadToHead({ war, mySquadId, compact = false, onClaim, claiming }) {
    const isBye = war.result_kind === 'bye' || !war.squad_b_id;
    const totalKills = (war.kills_a || 0) + (war.kills_b || 0);
    const ratioA = totalKills > 0 ? (war.kills_a || 0) / totalKills : 0.5;
    const ratioB = 1 - ratioA;
    const isMineA = war.squad_a_id === mySquadId;
    const isMineB = war.squad_b_id === mySquadId;
    const winner = war.winner_squad_id;
    const isResolved = !!war.is_resolved;

    const SideBadge = ({ icon, name, tag, level, isWinner, isMine, kills, isLeading }) => (
        <div className={`flex-1 min-w-0 rounded-lg p-2 md:p-3 border-2 transition-all ${
            isWinner ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                     : isLeading ? 'border-emerald-500/60 bg-emerald-950/20'
                     : 'border-slate-700 bg-slate-900/50'
        } ${isMine ? 'ring-2 ring-cyan-400/50' : ''}`}>
            <div className="flex items-center gap-1.5 md:gap-2 mb-2">
                <span className="text-xl md:text-2xl shrink-0 w-7 h-7 md:w-8 md:h-8 inline-flex items-center justify-center overflow-hidden rounded-md bg-slate-800">
                    {icon?.startsWith('http') ? <img src={icon} className="w-full h-full object-cover" alt="" /> : (icon || '🛡️')}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-white text-xs md:text-sm truncate">{name || 'Unknown'}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                        <span className="bg-slate-800 px-1 rounded truncate max-w-[60px] md:max-w-none">[{tag || '---'}]</span>
                        <span className="shrink-0">Lv.{level || 1}</span>
                        {isMine && <span className="text-cyan-400 font-bold shrink-0">YOU</span>}
                    </div>
                </div>
                {isWinner && <Crown className="w-4 h-4 md:w-5 md:h-5 text-amber-400 shrink-0" />}
            </div>
            <div className={`text-2xl md:text-3xl font-black tabular-nums ${isWinner ? 'text-amber-300' : isLeading ? 'text-emerald-300' : 'text-slate-300'}`}>
                {(kills || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">kills</div>
        </div>
    );

    const leadingA = !isResolved && (war.kills_a || 0) > (war.kills_b || 0);
    const leadingB = !isResolved && (war.kills_b || 0) > (war.kills_a || 0);

    return (
        <div className={`bg-[#0b0416]/60 border ${isMineA || isMineB ? 'border-cyan-500/50' : 'border-slate-700'} rounded-xl ${compact ? 'p-2.5' : 'p-3 md:p-4'}`}>
            {/* Status banner */}
            {isResolved ? (
                <div className="flex items-center justify-center gap-2 mb-3 text-[10px] md:text-xs font-black uppercase tracking-widest">
                    {war.result_kind === 'tie' ? (
                        <span className="text-slate-300 bg-slate-800/60 px-3 py-1 rounded">🤝 War Tied</span>
                    ) : war.result_kind === 'bye' ? (
                        <span className="text-emerald-300 bg-emerald-950/40 px-3 py-1 rounded">✓ Bye Week — Auto Win</span>
                    ) : (
                        <span className="text-amber-300 bg-amber-950/40 border border-amber-500/40 px-3 py-1 rounded">🏆 War Decided</span>
                    )}
                </div>
            ) : (
                <div className="flex items-center justify-center gap-1.5 mb-3 text-[10px] md:text-xs font-black uppercase tracking-widest text-red-300 bg-red-950/40 border border-red-500/40 px-2 md:px-3 py-1 rounded w-fit max-w-full mx-auto text-center">
                    <Swords className="w-3 h-3 shrink-0" /> <span className="truncate">Live — Ends Sun 23:59 UTC</span>
                </div>
            )}

            <div className="flex items-stretch gap-2 md:gap-3">
                <SideBadge
                    icon={war.squad_a_icon} name={war.squad_a_name} tag={war.squad_a_tag} level={war.squad_a_level}
                    isWinner={isResolved && winner === war.squad_a_id} isMine={isMineA}
                    kills={war.kills_a} isLeading={leadingA}
                />
                <div className="flex flex-col items-center justify-center px-1 shrink-0">
                    <Swords className="w-5 h-5 md:w-6 md:h-6 text-red-400" />
                    <div className="text-[9px] text-slate-500 font-black tracking-widest mt-1">VS</div>
                </div>
                <SideBadge
                    icon={war.squad_b_icon} name={war.squad_b_name} tag={war.squad_b_tag} level={war.squad_b_level}
                    isWinner={isResolved && winner === war.squad_b_id} isMine={isMineB}
                    kills={war.kills_b} isLeading={leadingB}
                />
            </div>

            {/* Kill ratio bar */}
            {!isBye && (
                <div className="mt-3">
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all" style={{ width: `${Math.max(2, ratioA * 100)}%` }} />
                        <div className="h-full bg-gradient-to-r from-rose-500 to-rose-300 transition-all" style={{ width: `${Math.max(2, ratioB * 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>{Math.round(ratioA * 100)}%</span>
                        <span>{totalKills.toLocaleString()} total</span>
                        <span>{Math.round(ratioB * 100)}%</span>
                    </div>
                </div>
            )}

            {/* Reward preview */}
            {!compact && !isResolved && (
                <div className="mt-3 pt-3 border-t border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Per-member rewards</div>
                    <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                        <div className="bg-amber-950/30 border border-amber-700/40 rounded p-1.5 md:p-2">
                            <div className="text-[10px] text-amber-400 font-bold uppercase">Win</div>
                            <div className="flex items-center gap-1 text-[11px] md:text-xs font-bold text-amber-200 tabular-nums"><Coins className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" /> 2,500</div>
                            <div className="flex items-center gap-1 text-[11px] md:text-xs font-bold text-fuchsia-300 tabular-nums"><Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400 shrink-0" /> 3</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700 rounded p-1.5 md:p-2">
                            <div className="text-[10px] text-slate-400 font-bold uppercase">Tie</div>
                            <div className="flex items-center gap-1 text-[11px] md:text-xs font-bold text-slate-300 tabular-nums"><Coins className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" /> 1,000</div>
                            <div className="flex items-center gap-1 text-[11px] md:text-xs font-bold text-fuchsia-300 tabular-nums"><Puzzle className="w-3 h-3 fill-fuchsia-400 text-fuchsia-400 shrink-0" /> 1</div>
                        </div>
                        <div className="bg-slate-900/60 border border-slate-700 rounded p-1.5 md:p-2">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">Loss</div>
                            <div className="flex items-center gap-1 text-[11px] md:text-xs font-bold text-slate-400 tabular-nums"><Coins className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" /> 500</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}