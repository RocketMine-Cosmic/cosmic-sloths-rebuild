import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Crown, Trophy, Medal, AlertTriangle, Users } from 'lucide-react';
import SeasonCountdown from './SeasonCountdown';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

// Live "Champions Pool" leaderboard — shows current season's top squads and the
// projected OMENX share each would receive if the season ended right now.
export default function ChampionsPanel({ mySquadId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await base44.functions.invoke('getSquadChampionsStandings', {});
                if (!cancelled) setData(res.data);
            } catch (e) {
                console.error('[ChampionsPanel] load failed:', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!data || !data.success) {
        return <div className="text-center text-slate-500 py-12">Couldn't load Champions Pool data.</div>;
    }

    const championsPool = data.champions_pool_omenx || 0;
    const standings = data.standings || [];

    return (
        <div className="space-y-3">
            {/* Pool banner */}
            <div className="bg-gradient-to-r from-amber-950/50 via-yellow-950/50 to-amber-950/50 border-2 border-amber-500/50 rounded-xl p-4 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <Crown className="w-6 h-6 text-amber-300" />
                    <h3 className="text-lg font-black uppercase tracking-widest text-amber-200">Champions Pool</h3>
                    <span className="text-[10px] bg-amber-500/30 text-amber-100 px-2 py-0.5 rounded font-bold">{data.period_id}</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <OmenXIcon className="w-7 h-7" />
                    <span className="text-3xl md:text-4xl font-black text-amber-100 tabular-nums">{Math.floor(championsPool).toLocaleString()}</span>
                    <span className="text-xs text-amber-300 font-bold uppercase tracking-wider">OMENX</span>
                </div>
                <div className="mt-3">
                    <SeasonCountdown endIso={data.season_end_iso} />
                </div>
                <p className="text-[11px] text-amber-200/80 mt-3 leading-snug">
                    10% of the seasonal OMENX pool is reserved for the top squads. Distributed at season end:
                    <strong className="text-amber-100"> 🥇 50%</strong> /
                    <strong className="text-amber-100"> 🥈 30%</strong> /
                    <strong className="text-amber-100"> 🥉 20%</strong>
                </p>
                <p className="text-[10px] text-amber-300/70 mt-1">Eligibility: ≥ {data.min_wars_for_eligibility} wars fought + ≥ {data.min_squad_members || 2} squad members. Pool grows as players spend OMENX during the season.</p>
            </div>

            {/* Standings */}
            {standings.length === 0 ? (
                <div className="text-center text-slate-500 py-12">No squad performance logged yet this season.</div>
            ) : (
                <div className="space-y-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Live Standings — Top 10</div>
                    {standings.map(s => {
                        const isMine = s.squad_id === mySquadId;
                        const isTop3 = s.rank <= 3 && s.eligible && s.projected_squad_share_omenx > 0;
                        const rankIcon = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`;
                        const rankColor = s.rank === 1 ? 'text-amber-300 border-amber-500/50 bg-amber-950/30'
                            : s.rank === 2 ? 'text-slate-200 border-slate-400/50 bg-slate-800/50'
                            : s.rank === 3 ? 'text-orange-300 border-orange-500/50 bg-orange-950/30'
                            : 'text-slate-400 border-slate-700 bg-slate-900/40';
                        return (
                            <div key={s.squad_id} className={`flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border ${rankColor} ${isMine ? 'ring-2 ring-cyan-400/50' : ''}`}>
                                <div className="text-base md:text-lg font-black w-7 md:w-10 text-center shrink-0">{rankIcon}</div>
                                <span className="text-xl md:text-2xl shrink-0 w-8 h-8 md:w-9 md:h-9 inline-flex items-center justify-center overflow-hidden rounded-md bg-slate-900">
                                    {s.squad_icon?.startsWith('http') ? <img src={s.squad_icon} className="w-full h-full object-cover" alt="" /> : (s.squad_icon || '🛡️')}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white text-xs md:text-sm flex items-center gap-1.5 flex-wrap">
                                        <span className="truncate min-w-0">{s.squad_name || 'Unknown'}</span>
                                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded shrink-0">[{s.squad_tag}]</span>
                                        {isMine && <span className="text-[10px] bg-cyan-900 text-cyan-300 px-1.5 rounded shrink-0">YOU</span>}
                                        {!s.eligible && <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 rounded shrink-0 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Need {data.min_wars_for_eligibility}+</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-x-1 gap-y-0.5 flex-wrap">
                                        <strong className="text-emerald-400">{s.wins}W</strong>·<strong className="text-rose-400">{s.losses}L</strong>·<strong className="text-slate-400">{s.ties}T</strong>
                                        <span>· {s.total_kills.toLocaleString()} kills · {s.wars_fought} wars</span>
                                        {s.member_count > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-slate-500">· <Users className="w-2.5 h-2.5" /> {s.member_count}</span>
                                        )}
                                    </div>
                                    {/* Projected payout — rendered inline on mobile only */}
                                    {isTop3 && (
                                        <div className="mt-1 md:hidden flex items-center gap-1 text-[10px] font-bold text-amber-200">
                                            <OmenXIcon className="w-3 h-3" />
                                            <span>~{Math.floor(s.projected_squad_share_omenx).toLocaleString()} OMENX</span>
                                            {s.projected_per_member_omenx > 0 && (
                                                <span className="text-amber-300/80 font-normal">(~{s.projected_per_member_omenx.toLocaleString()}/member)</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-base md:text-lg font-black text-amber-300 tabular-nums">{s.ranking_points}</div>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">pts</div>
                                    {/* Projected payout — desktop only (mobile shows it inline above) */}
                                    {isTop3 && (
                                        <div className="hidden md:block mt-1 space-y-0.5">
                                            <div className="text-[10px] font-bold text-amber-200 bg-amber-950/50 border border-amber-500/40 rounded px-1.5 py-0.5 flex items-center gap-1 justify-end" title="Projected total to the squad">
                                                <OmenXIcon className="w-3 h-3" /> ~{Math.floor(s.projected_squad_share_omenx).toLocaleString()}
                                            </div>
                                            {s.projected_per_member_omenx > 0 && (
                                                <div className="text-[9px] text-amber-300/80 flex items-center gap-1 justify-end" title="Projected per-member share">
                                                    <Users className="w-2.5 h-2.5" /> ~{s.projected_per_member_omenx.toLocaleString()}/member
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="text-[10px] text-slate-600 italic text-center pt-2">
                Projected payouts are estimates based on the current pool size. Final distribution happens at season end.
            </div>
        </div>
    );
}