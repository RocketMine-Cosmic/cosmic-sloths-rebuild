import React from 'react';
import { Target } from 'lucide-react';
import { getAllocations, getBiasTargets, BIAS_PER_POINT } from '@/lib/poolBias';

// Small indicator shown above the choices in LevelUpModal so players who spent
// OMENX/gold on Pool Bias can SEE their bias is active during the run. Without
// this the bias system feels like a black box — players go "I bias-allocated
// weapons but I keep getting passives, is this broken?"
//
// Shows up to top 2 allocated targets with their +% boost. Self-hides when no
// allocations exist so players who haven't engaged with the system never see it.
export default function PoolBiasBadge({ save }) {
    const allocations = getAllocations(save);
    const entries = Object.entries(allocations).filter(([, pts]) => Number(pts) > 0);
    if (entries.length === 0) return null;

    // Build a quick lookup of target metadata (label + icon) so we can render
    // friendly names like "⚔️ Damage" instead of raw stat ids.
    const { stats, weapons } = getBiasTargets();
    const meta = new Map();
    for (const t of [...stats, ...weapons]) meta.set(t.id, t);

    const top = entries
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 2);

    return (
        <div className="mb-2 md:mb-3 px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg bg-fuchsia-950/40 border border-fuchsia-500/40 flex items-center gap-2 text-[10px] md:text-xs">
            <Target className="w-3 h-3 md:w-3.5 md:h-3.5 text-fuchsia-300 shrink-0" />
            <span className="text-fuchsia-300 font-bold uppercase tracking-wider shrink-0">Pool Bias</span>
            <span className="text-fuchsia-200/80 truncate">
                {top.map(([id, pts], i) => {
                    const m = meta.get(id);
                    if (!m) return null;
                    const pct = Math.round(Number(pts) * BIAS_PER_POINT * 100);
                    return (
                        <span key={id}>
                            {i > 0 && <span className="text-fuchsia-500/50 mx-1.5">·</span>}
                            <span>{m.icon} {m.label}</span>
                            <span className="text-emerald-300 font-mono ml-1">+{pct}%</span>
                        </span>
                    );
                })}
            </span>
        </div>
    );
}