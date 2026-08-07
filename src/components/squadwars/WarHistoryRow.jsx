import React from 'react';
import { Crown, Gift } from 'lucide-react';
import moment from 'moment';

// Compact one-line history of a past war for the current squad
export default function WarHistoryRow({ war, mySquadId, onClaim, claiming, myWalletLower }) {
    const isMineA = war.squad_a_id === mySquadId;
    const myKills = isMineA ? (war.kills_a || 0) : (war.kills_b || 0);
    const oppKills = isMineA ? (war.kills_b || 0) : (war.kills_a || 0);
    const oppName = isMineA ? war.squad_b_name : war.squad_a_name;
    const oppTag = isMineA ? war.squad_b_tag : war.squad_a_tag;
    const oppIcon = isMineA ? war.squad_b_icon : war.squad_a_icon;

    const isBye = war.result_kind === 'bye';
    const iWon = war.is_resolved && war.winner_squad_id === mySquadId;
    const isTie = war.is_resolved && war.result_kind === 'tie';
    const iLost = war.is_resolved && !iWon && !isTie && !isBye;

    const claimed = (war.rewarded_member_wallets || []).map(w => w.toLowerCase()).includes(myWalletLower);
    const canClaim = war.is_resolved && !claimed && myWalletLower;

    const statusBadge = isBye ? { label: 'Bye Win', cls: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40' }
        : iWon ? { label: 'Victory', cls: 'text-amber-300 bg-amber-950/40 border-amber-500/40' }
        : isTie ? { label: 'Tie',     cls: 'text-slate-300 bg-slate-800/60 border-slate-600' }
        : iLost ? { label: 'Defeat',  cls: 'text-rose-300 bg-rose-950/40 border-rose-500/40' }
        : { label: 'In Progress', cls: 'text-cyan-300 bg-cyan-950/40 border-cyan-500/40' };

    return (
        <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-2.5 md:p-3">
            {/* Top row: status + week + score + claim */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusBadge.cls} shrink-0`}>
                    {iWon && <Crown className="w-3 h-3 inline mr-0.5" />}{statusBadge.label}
                </span>
                <div className="text-[10px] font-mono text-slate-500 shrink-0">{war.week_id}</div>
                <div className="text-xs font-mono shrink-0 ml-auto">
                    <span className={iWon ? 'text-amber-300 font-bold' : 'text-slate-300'}>{myKills.toLocaleString()}</span>
                    <span className="text-slate-600 mx-1">–</span>
                    <span className={iLost ? 'text-rose-300 font-bold' : 'text-slate-400'}>{oppKills.toLocaleString()}</span>
                </div>
                {canClaim && (
                    <button
                        onClick={() => onClaim?.(war.id)}
                        disabled={claiming}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 shrink-0 animate-pulse">
                        <Gift className="w-3 h-3" /> CLAIM
                    </button>
                )}
                {war.is_resolved && claimed && (
                    <span className="text-[10px] text-emerald-500 font-bold shrink-0">✓ Claimed</span>
                )}
            </div>
            {/* Opponent row */}
            <div className="flex items-center gap-2 mt-1.5 min-w-0">
                {!isBye ? (
                    <>
                        <span className="text-base shrink-0 w-5 h-5 inline-flex items-center justify-center overflow-hidden rounded bg-slate-800">
                            {oppIcon?.startsWith('http') ? <img src={oppIcon} className="w-full h-full object-cover" alt="" /> : (oppIcon || '🛡️')}
                        </span>
                        <span className="text-xs text-white font-bold truncate min-w-0">vs {oppName} <span className="text-slate-500">[{oppTag}]</span></span>
                    </>
                ) : (
                    <span className="text-xs text-slate-400 italic">No opponent</span>
                )}
            </div>
        </div>
    );
}