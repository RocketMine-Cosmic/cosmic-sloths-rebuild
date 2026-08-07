import React from 'react';
import { CHARACTERS } from '@/game/Constants';
import { Lock, Unlock } from 'lucide-react';

const DEFAULT_CHARACTERS = ['neobyte'];

export default function UnlockedCharactersTable({ unlockedCharacters = [], nftCharacters = [] }) {
  const charList = CHARACTERS.filter(c => unlockedCharacters.includes(c.id));

  if (charList.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        No characters unlocked yet. Play runs to find them!
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-3 px-3 text-slate-400 font-bold text-xs uppercase tracking-wider">Character</th>
            <th className="text-left py-3 px-3 text-slate-400 font-bold text-xs uppercase tracking-wider">Unlock Source</th>
            <th className="text-left py-3 px-3 text-slate-400 font-bold text-xs uppercase tracking-wider">Rarity</th>
            <th className="text-left py-3 px-3 text-slate-400 font-bold text-xs uppercase tracking-wider">Bonuses</th>
          </tr>
        </thead>
        <tbody>
          {charList.map(char => {
            const isDefault = DEFAULT_CHARACTERS.includes(char.id);
            const isNFT = nftCharacters.includes(char.id);
            const rarity = isNFT ? 'Exotic' : isDefault ? 'Common' : 'Rare';
            const rarityColor = isNFT ? 'text-purple-400' : isDefault ? 'text-slate-400' : 'text-blue-400';
            const rarityBg = isNFT ? 'bg-purple-950/40 border-purple-500/30' : isDefault ? 'bg-slate-800/30 border-slate-700/30' : 'bg-blue-950/40 border-blue-500/30';

            return (
              <tr key={char.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2" style={{ borderColor: char.color }}>
                      {char.image ? (
                        <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-800" />
                      )}
                    </div>
                    <span className="font-bold text-white">{char.name}</span>
                  </div>
                </td>
                <td className="py-4 px-3">
                  <div className="flex items-center gap-2">
                    {isNFT ? (
                      <>
                        <span className="text-lg">💎</span>
                        <span className="text-purple-300 font-bold">NFT Holder</span>
                      </>
                    ) : isDefault ? (
                      <>
                        <span className="text-lg">⭐</span>
                        <span className="text-slate-300 font-bold">Starter</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">🎯</span>
                        <span className="text-blue-300 font-bold">Found</span>
                      </>
                    )}
                  </div>
                </td>
                <td className="py-4 px-3">
                  <span className={`${rarityColor} ${rarityBg} border px-2.5 py-1 rounded-lg font-bold text-xs`}>
                    {rarity}
                  </span>
                </td>
                <td className="py-4 px-3">
                  <div className="space-y-1">
                    {isNFT && (
                      <>
                        <div className="text-amber-300 text-xs font-bold flex items-center gap-1">
                          🪙 <span>+10% Gold Income</span>
                        </div>
                        <div className="text-amber-300 text-xs font-bold flex items-center gap-1">
                          💰 <span>-10% Upgrade Costs</span>
                        </div>
                      </>
                    )}
                    {isDefault && (
                      <div className="text-slate-400 text-xs flex items-center gap-1">
                        ✓ <span>Starter Bonus</span>
                      </div>
                    )}
                    {!isNFT && !isDefault && (
                      <div className="text-blue-400 text-xs flex items-center gap-1">
                        ✓ <span>Unique Skills</span>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}