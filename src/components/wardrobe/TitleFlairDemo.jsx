import React from 'react';

// Live CSS preview of a Title Flair cosmetic. Renders sample text styled with
// the same .title-flair-<id> class the in-game LB row / profile / chat will use,
// so the player sees exactly how their title will look once equipped.
//
// flairId examples: 'rainbow_shimmer', 'blue_flame', 'liquid_chrome'
// Pass any title text — defaults to "Cosmic Legend" so previewers see
// medium-length text rather than just "Equipped".
export default function TitleFlairDemo({ flairId, sampleText = 'Cosmic Legend' }) {
    if (!flairId) return null;
    return (
        <div className="w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center gap-3 py-12">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">title preview</div>
            <div className={`title-flair-${flairId} text-3xl md:text-4xl tracking-wide`}>
                {sampleText}
            </div>
            <div className="text-xs text-slate-500">Shown wherever your title appears</div>
        </div>
    );
}