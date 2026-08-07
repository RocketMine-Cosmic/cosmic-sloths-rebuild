import React from 'react';

export default function StatPips({ level, total = 5, statId = '' }) {
    const pips = [];
    for (let i = 0; i < total; i++) {
        pips.push(
            <div
                key={`${statId}-${i}`}
                className={`w-2 h-2 md:w-4 md:h-4 rounded-sm ${i < level ? 'bg-cyan-500' : 'bg-slate-600'}`}
            />
        );
    }
    return <div className="flex gap-1 mt-1">{pips}</div>;
}

export function SmallStatPips({ level, total = 5, statId = '' }) {
    const pips = [];
    for (let i = 0; i < total; i++) {
        pips.push(
            <div
                key={`${statId}-${i}`}
                className={`w-2 h-2 rounded-sm ${i < level ? 'bg-cyan-500' : 'bg-slate-700'}`}
            />
        );
    }
    return <div className="flex gap-1">{pips}</div>;
}