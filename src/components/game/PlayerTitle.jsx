import React from 'react';
import { getTitleStyle } from '@/lib/playerTitles';

// Centralised title pill renderer. Used by every site that shows a player's
// equipped title (LB row, profile header, end-of-run modal, squad chat).
//
// flairId (optional) is the equipped Title Flair chest cosmetic — when set,
// adds the `.title-flair-<id>` class so the CSS animations in index.css
// (rainbow shimmer, blue flame, liquid chrome) kick in.
export default function PlayerTitle({ title, flairId, className = '' }) {
    if (!title) return null;
    const st = getTitleStyle(title);
    const flairClass = flairId ? `title-flair-${flairId}` : '';
    return (
        <span className={`text-[10px] ${st.bg} ${st.text} px-1.5 py-0.5 rounded border ${st.border} tracking-wider font-bold truncate ${flairClass} ${className}`}>
            {title}
        </span>
    );
}