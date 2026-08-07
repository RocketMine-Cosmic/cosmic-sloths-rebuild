import React from 'react';
import { Trophy } from 'lucide-react';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

// Live "Player Pool" banner shown on the Weekly + Seasonal + Weekly Kills leaderboards.
// Mirrors the Champions Pool banner style so the player can see the running OMENX pot
// they're competing for, what % of the total seasonal/weekly OMENX feeds it, and the
// rank-by-rank split that determines payouts.
//
// `poolPct` is passed in by the parent so admin-configured pool sizes
// (leaderboardPayoutConfig.weekly_pool_pct / seasonal_pool_pct / kill_pool_pct)
// flow through to the banner without needing a separate fetch here.
export default function LeaderboardPoolBanner({ view, periodId, totalSpent, timeLeft, poolPct }) {
    const isWeekly = view === 'weekly';
    const isKills = view === 'weekly_kills';
    const isSeasonal = view === 'seasonal';
    
    let accent, numColor, subColor, chipBg, label;
    // Safe fallbacks if poolPct prop isn't provided (mirrors backend defaults).
    let resolvedPoolPct = Number.isFinite(Number(poolPct)) ? Number(poolPct) : null;
    
    if (isWeekly) {
        if (resolvedPoolPct === null) resolvedPoolPct = 0.15;
        accent = 'from-cyan-950/50 via-blue-950/50 to-cyan-950/50 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.18)] text-cyan-200';
        numColor = 'text-cyan-100';
        subColor = 'text-cyan-300';
        chipBg = 'bg-cyan-500/30 text-cyan-100';
        label = 'Weekly Player Pool';
    } else if (isSeasonal) {
        if (resolvedPoolPct === null) resolvedPoolPct = 0.20;
        accent = 'from-purple-950/50 via-fuchsia-950/50 to-purple-950/50 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.18)] text-purple-200';
        numColor = 'text-purple-100';
        subColor = 'text-purple-300';
        chipBg = 'bg-purple-500/30 text-purple-100';
        label = 'Seasonal Player Pool';
    } else if (isKills) {
        if (resolvedPoolPct === null) resolvedPoolPct = 0.05;
        accent = 'from-orange-950/50 via-amber-950/50 to-orange-950/50 border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.18)] text-orange-200';
        numColor = 'text-orange-100';
        subColor = 'text-orange-300';
        chipBg = 'bg-orange-500/30 text-orange-100';
        label = 'Weekly Kill Pool';
    }
    
    const playerPool = Math.floor((totalSpent || 0) * resolvedPoolPct);

    return (
        <div className={`bg-gradient-to-r ${accent} border-2 rounded-xl p-4 mb-4`}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <Trophy className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-widest">{label}</h3>
                {periodId && <span className={`text-[10px] ${chipBg} px-2 py-0.5 rounded font-bold`}>{periodId}</span>}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
                <OmenXIcon className="w-7 h-7" />
                <span className={`text-3xl md:text-4xl font-black tabular-nums ${numColor}`}>{playerPool.toLocaleString()}</span>
                <span className={`text-xs ${subColor} font-bold uppercase tracking-wider`}>OMENX</span>
            </div>
            <p className={`text-[10px] ${subColor}/70 mt-2 leading-snug`}>
                Every OMENX spent increases the pool.
            </p>
        </div>
    );
}