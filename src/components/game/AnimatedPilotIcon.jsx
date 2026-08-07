import React from 'react';
import { getChestAssetUrl } from '@/lib/chestCosmeticAssets';
import { isStandardAnimatedIcon, getStandardAnimatedIcon } from '@/lib/standardCosmetics';
import StandardIconSigil from '@/components/wardrobe/StandardIconSigils';
import ChestIconImage from './ChestIconImage';

// Renders the equipped pilot icon. Three render paths:
//   1. Chest animated icon — generated PNG asset.
//   2. Standard ("Support the Devs") icon — themed medallion: tinted plate,
//      coloured rim, inner shine ring, animated emoji core. Reads as a real
//      cosmetic, not raw emoji.
//   3. Fallback — standard pilot emoji / upload URL.
export default function AnimatedPilotIcon({ animatedId, fallback, className = 'w-10 h-10' }) {
    // Standard medallion.
    if (animatedId && isStandardAnimatedIcon(animatedId)) {
        const std = getStandardAnimatedIcon(animatedId);
        return (
            <div
                className={`${className} rounded-full relative flex items-center justify-center overflow-hidden`}
                style={{
                    background: std.plate,
                    border: `2px solid ${std.rim}`,
                    boxShadow: `0 0 0 1px rgba(15,23,42,0.9), inset 0 0 8px rgba(255,255,255,0.18), 0 0 12px ${std.rim}aa, 0 0 24px ${std.rim}55`,
                }}
            >
                {/* Inner shine highlight — top-left arc */}
                <span
                    className="absolute inset-[3px] rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22) 0%, transparent 55%)' }}
                />
                <div className={`${std.anim} relative z-10`} style={{ width: '95%', height: '95%' }}>
                    <StandardIconSigil id={std.id} color={std.rim} />
                </div>
            </div>
        );
    }

    // Chest animated icon — generated PNG with halo / overlay animation.
    const url = animatedId ? getChestAssetUrl(animatedId) : null;
    if (url) {
        return (
            <div className={`${className} rounded-full overflow-hidden border-2 border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.3)]`}>
                <ChestIconImage url={url} animatedId={animatedId} />
            </div>
        );
    }

    // Standard fallback — emoji char or uploaded image URL.
    const isUrl = typeof fallback === 'string' && fallback.startsWith('http');
    return (
        <div className={`${className} rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center text-xl overflow-hidden`}>
            {isUrl
                ? <img src={fallback} className="w-full h-full object-cover" alt="pilot" />
                : (fallback || '🦥')}
        </div>
    );
}