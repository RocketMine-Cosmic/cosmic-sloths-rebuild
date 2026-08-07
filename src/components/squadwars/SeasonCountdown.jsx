import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

// Live countdown to the end of the current season (Sun 23:59 UTC of the season's last ISO week).
export default function SeasonCountdown({ endIso }) {
    const [remaining, setRemaining] = useState(() => computeRemaining(endIso));

    useEffect(() => {
        if (!endIso) return;
        const id = setInterval(() => setRemaining(computeRemaining(endIso)), 1000);
        return () => clearInterval(id);
    }, [endIso]);

    if (!endIso || !remaining) return null;

    const { days, hours, minutes, seconds, ended } = remaining;

    if (ended) {
        return (
            <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-500/40 rounded-lg px-3 py-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-rose-300" />
                <span className="text-rose-200 font-bold uppercase tracking-widest">Season ended — payout pending</span>
            </div>
        );
    }

    const Cell = ({ value, label }) => (
        <div className="flex flex-col items-center bg-amber-950/40 border border-amber-500/30 rounded-md px-2 py-1 min-w-[40px]">
            <span className="text-amber-100 font-black text-base md:text-lg tabular-nums leading-none">{String(value).padStart(2, '0')}</span>
            <span className="text-[8px] text-amber-300/70 uppercase tracking-widest mt-0.5">{label}</span>
        </div>
    );

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-amber-300">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-[10px] uppercase tracking-widest font-bold">Season ends in</span>
            </div>
            <div className="flex items-center gap-1">
                <Cell value={days} label="days" />
                <Cell value={hours} label="hrs" />
                <Cell value={minutes} label="min" />
                <Cell value={seconds} label="sec" />
            </div>
        </div>
    );
}

function computeRemaining(endIso) {
    if (!endIso) return null;
    const end = new Date(endIso).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return { ended: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return { ended: false, days, hours, minutes, seconds };
}