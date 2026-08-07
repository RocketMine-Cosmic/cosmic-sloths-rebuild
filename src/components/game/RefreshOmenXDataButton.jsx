import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SoundManager } from '../../game/SoundManager';

/**
 * Generic 24h-cooldown refresh button.
 *
 * Props:
 *  - label: string shown when the button is ready (e.g. "Refresh VIP").
 *  - onRefresh: async () => ({ ok, cooldownEnd }).
 *  - getCooldownEnd: () => number (timestamp ms).
 *  - title?: tooltip when ready.
 */
export default function RefreshOmenXDataButton({ label, onRefresh, getCooldownEnd, title }) {
    const [cooldownEnd, setCooldownEnd] = useState(getCooldownEnd());
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState(null);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const remaining = Math.max(0, cooldownEnd - now);
    const onCooldown = remaining > 0;

    const formatRemaining = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const handleClick = async () => {
        if (onCooldown || busy) return;
        SoundManager.playUIClick();
        setBusy(true);
        try {
            const res = await onRefresh();
            setCooldownEnd(res.cooldownEnd);
            setFlash(res.ok ? 'ok' : 'fail');
            setTimeout(() => setFlash(null), 2500);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={onCooldown || busy}
            title={onCooldown ? `Available in ${formatRemaining(remaining)}` : (title || label)}
            className={`flex items-center gap-1.5 md:gap-2 px-2.5 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border font-bold text-[10px] md:text-xs transition-colors ${
                flash === 'ok'
                    ? 'bg-emerald-900/40 border-emerald-500/60 text-emerald-300'
                    : onCooldown
                        ? 'bg-slate-900 border-slate-700 text-slate-500 cursor-not-allowed'
                        : busy
                            ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                            : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/40 hover:border-cyan-400'
            }`}
        >
            <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${busy ? 'animate-spin' : ''}`} />
            <span className="uppercase tracking-wider whitespace-nowrap">
                {busy ? 'Refreshing…' : flash === 'ok' ? 'Updated' : onCooldown ? `Refresh in ${formatRemaining(remaining)}` : label}
            </span>
        </button>
    );
}