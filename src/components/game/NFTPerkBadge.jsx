import React from 'react';
import { Zap } from 'lucide-react';
import { NFTPerkManager } from '@/game/NFTPerks';

export default function NFTPerkBadge() {
  const activePerks = NFTPerkManager.getActivePerks();

  if (activePerks.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {activePerks.map(perk => (
        <div
          key={perk.id}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/40 border border-amber-700/60 text-amber-300 text-xs md:text-sm font-bold shadow-[0_0_10px_rgba(217,119,6,0.2)]"
          title={perk.name}
        >
          <Zap className="w-3 h-3 md:w-4 md:h-4" />
          <span>{perk.name}</span>
          {perk.value !== undefined && (
            <span className="text-amber-200 opacity-75">
              {perk.baseValue > 1
                ? `+${Math.round((perk.value - 1) * 100)}%`
                : `-${Math.round((1 - perk.value) * 100)}%`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}