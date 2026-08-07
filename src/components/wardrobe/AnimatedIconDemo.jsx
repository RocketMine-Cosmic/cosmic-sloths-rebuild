import React from 'react';
import { isStandardAnimatedIcon, getStandardAnimatedIcon } from '@/lib/standardCosmetics';
import StandardIconSigil from './StandardIconSigils';
import ChestIconImage from '@/components/game/ChestIconImage';

// Preview of an animated pilot icon.
//
// Standard ("Support the Devs"): renders the themed medallion at multiple sizes
// so players see exactly how it'll look on the LB row + chat + profile.
// Chest: renders the generated PNG at multiple sizes.

const StandardMedallion = ({ std, size }) => (
    <div
        className="relative rounded-full flex items-center justify-center overflow-hidden"
        style={{
            width: size, height: size,
            background: std.plate,
            border: `2px solid ${std.rim}`,
            boxShadow: `0 0 0 1px rgba(15,23,42,0.9), inset 0 0 10px rgba(255,255,255,0.2), 0 0 20px ${std.rim}aa, 0 0 44px ${std.rim}55`,
        }}
    >
        <span
            className="absolute inset-[3px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.28) 0%, transparent 55%)' }}
        />
        <div className={`${std.anim} relative z-10`} style={{ width: size * 0.95, height: size * 0.95 }}>
            <StandardIconSigil id={std.id} color={std.rim} />
        </div>
    </div>
);

export default function AnimatedIconDemo({ iconId, iconUrl }) {
    if (iconId && isStandardAnimatedIcon(iconId)) {
        const std = getStandardAnimatedIcon(iconId);
        return (
            <div className="w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center gap-5 py-10">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">pilot icon preview</div>
                <StandardMedallion std={std} size={128} />
                <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Chat</span>
                    <StandardMedallion std={std} size={32} />
                    <span>Profile</span>
                    <StandardMedallion std={std} size={48} />
                    <span>Leaderboard</span>
                </div>
            </div>
        );
    }

    if (!iconUrl) {
        return (
            <div className="w-full bg-slate-950 rounded-lg flex items-center justify-center py-10 text-slate-500 text-xs">
                Asset not yet generated.
            </div>
        );
    }
    const Wrapped = ({ size }) => (
        <div className="rounded-full overflow-hidden border-2 border-cyan-500/30" style={{ width: size, height: size }}>
            <ChestIconImage url={iconUrl} animatedId={iconId} />
        </div>
    );
    return (
        <div className="w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center gap-4 py-10">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">pilot icon preview</div>
            <Wrapped size={128} />
            <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>Small</span>
                <Wrapped size={32} />
                <span>Medium</span>
                <Wrapped size={48} />
                <span>Leaderboard</span>
            </div>
        </div>
    );
}