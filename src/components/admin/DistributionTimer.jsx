import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function DistributionTimer() {
    const [timers, setTimers] = useState([]);

    useEffect(() => {
        const updateTimers = () => {
            const utcNow = new Date();

            // Weekly: next Monday 23:00 UTC (the Monday that closes the *current* ISO week)
            const weeklyNext = new Date(utcNow);
            weeklyNext.setUTCDate(weeklyNext.getUTCDate() + ((1 - weeklyNext.getUTCDay() + 7) % 7 || 7));
            weeklyNext.setUTCHours(23, 0, 0, 0);

            // Seasonal: figure out which ISO week ends the current 4-week season,
            // then fire on the Monday after that week at 23:00 UTC.
            // Must mirror lib/periodIds.js (proper ISO 8601, Mon-start, Sun-end UTC) —
            // the previous Sun-start formula was off-by-one on Sundays which made the
            // seasonal countdown read a full week short.
            const tmp = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), utcNow.getUTCDate()));
            const dayNum = tmp.getUTCDay() || 7;
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
            const isoYear = tmp.getUTCFullYear();
            const yearStart = new Date(Date.UTC(isoYear, 0, 1));
            const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
            const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
            const lastWeekOfSeason = seasonNum * 4; // e.g. season 5 → week 20
            const weeksUntilSeasonEnd = lastWeekOfSeason - isoWeek;

            const seasonalNext = new Date(weeklyNext);
            seasonalNext.setUTCDate(seasonalNext.getUTCDate() + weeksUntilSeasonEnd * 7);

            const formatCountdown = (targetDate) => {
                const diff = targetDate - utcNow;
                if (diff <= 0) return 'Running now...';
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                return `${days}d ${hours}h ${mins}m`;
            };

            setTimers([
                { label: 'Weekly Distribution', next: weeklyNext, countdown: formatCountdown(weeklyNext), color: 'cyan' },
                { label: 'Seasonal Distribution', next: seasonalNext, countdown: formatCountdown(seasonalNext), color: 'amber' },
            ]);
        };

        updateTimers();
        const interval = setInterval(updateTimers, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-[#0b0416]/80 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-bold text-white">Distribution Schedule (UTC)</h2>
            </div>
            <div className="space-y-3">
                {timers.map((timer) => (
                    <div key={timer.label} className={`bg-slate-800/50 border border-${timer.color}-900/40 rounded-lg p-3`}>
                        <div className="flex justify-between items-start mb-1">
                            <span className={`font-bold text-${timer.color}-400`}>{timer.label}</span>
                            <span className="text-xs text-slate-400">{timer.next.toUTCString().replace(' GMT', '')}</span>
                        </div>
                        <div className={`text-xl font-mono font-bold text-${timer.color}-300`}>
                            {timer.countdown}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}