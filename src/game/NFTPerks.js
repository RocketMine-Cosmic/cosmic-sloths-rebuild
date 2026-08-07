// NFT-based perk system
// Maps NFT metadata to passive bonuses

import { normalizeNftCharacterName } from '@/lib/nftNameNormalize';

export const NFT_PERK_MAPPINGS = {
  // Mapping NFT collection/name patterns to perk types
  // Adjust patterns based on your actual OmenX NFT names/metadata
};

// Rarity-based perk multipliers (applied per character selected in a run)
const RARITY_PERKS = {
  common: { goldMult: 1.05, relicMult: 1.05 },
  uncommon: { goldMult: 1.07, relicMult: 1.08 },
  rare: { goldMult: 1.10, relicMult: 1.10 },
  epic: { goldMult: 1.12, relicMult: 1.13 },
  legendary: { goldMult: 1.15, relicMult: 1.15 },
};

export const PERKS = {
  GOLD_MULTIPLIER: { id: 'gold_mult', name: 'Gold Multiplier' },
  RELIC_FRAGMENT_BONUS: { id: 'relic_bonus', name: 'Relic Fragment Bonus' },
};

// Default perks (will be enhanced by NFT ownership)
const DEFAULT_PERKS = {
  goldMultiplier: 1.0,
  relicFragmentMultiplier: 1.0,
};

export class NFTPerkManager {
  static perks = { ...DEFAULT_PERKS };

  // Get bonuses for a specific character when used in a run.
  // If a player owns multiple NFTs for the same character (duplicates of any
  // rarity), only the HIGHEST rarity one is applied — perks DO NOT stack.
  // This keeps things fair: owning 3× Legendary NeoByte gives the same perk
  // as owning 1× Legendary NeoByte.
  static getCharacterPerks(characterId, nftData) {
    const perks = { ...DEFAULT_PERKS };

    if (!nftData || !Array.isArray(nftData)) return perks;

    // Rarity priority — higher index = stronger.
    const rarityRank = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

    // Collect ALL NFTs matching this character, then pick the best rarity.
    let bestRarity = null;
    let bestRank = -1;
    for (const nft of nftData) {
      if (normalizeNftCharacterName(nft.metadata?.name) !== characterId.toLowerCase()) continue;
      const rarityAttr = nft.metadata?.attributes?.find(a => a.trait_type === 'rarity');
      const rarity = rarityAttr?.value?.toLowerCase();
      if (!rarity || !RARITY_PERKS[rarity]) continue;
      const rank = rarityRank.indexOf(rarity);
      if (rank > bestRank) {
        bestRank = rank;
        bestRarity = rarity;
      }
    }

    if (bestRarity) {
      const rarityPerks = RARITY_PERKS[bestRarity];
      perks.goldMultiplier = rarityPerks.goldMult;
      perks.relicFragmentMultiplier = rarityPerks.relicMult;
    }

    return perks;
  }

  static applyNFTPerks(nftData) {
    // Reset to defaults
    this.perks = { ...DEFAULT_PERKS };

    if (!nftData || !Array.isArray(nftData)) return;

    // Legacy: any NFT holder gets base bonus (will be overridden by character-specific perks in-game)
    if (nftData.length > 0) {
      this.perks.goldMultiplier = 1.05;
      this.perks.relicFragmentMultiplier = 1.05;
      console.log('[NFTPerkManager] Base NFT holder perks applied');
    }

    return this.perks;
  }

  static getGoldMultiplier() {
    return this.perks.goldMultiplier;
  }

  static getRelicFragmentMultiplier() {
    return this.perks.relicFragmentMultiplier;
  }

  static getUpgradeCostMultiplier() {
    // Inverse of gold multiplier — higher gold mult = lower upgrade cost
    return 1.0 / (this.perks.goldMultiplier || 1.0);
  }

  static getActivePerks() {
    const active = [];
    if (this.perks.goldMultiplier > 1.0) {
      active.push({ ...PERKS.GOLD_MULTIPLIER, value: this.perks.goldMultiplier });
    }
    if (this.perks.relicFragmentMultiplier > 1.0) {
      active.push({ ...PERKS.RELIC_FRAGMENT_BONUS, value: this.perks.relicFragmentMultiplier });
    }
    return active;
  }
}