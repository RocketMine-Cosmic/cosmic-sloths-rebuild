// Character unlock milestones for non-NFT players
// NFT holders get instant unlock + rarity perks

import { CHARACTERS } from './Constants';

// 10 milestones — must mirror functions/saveScore.js KILL_MILESTONES.
// Covers all 10 characters (1 starter + 9 random unlocks across the roster).
const KILL_MILESTONES = [
  { kills: 0, id: 'neobyte' },      // starter
  { kills: 2000 },                    // random unlock
  { kills: 5000 },                    // random unlock
  { kills: 10000 },                   // random unlock
  { kills: 20000 },                   // random unlock
  { kills: 35000 },                   // random unlock
  { kills: 55000 },                   // random unlock
  { kills: 80000 },                   // random unlock
  { kills: 115000 },                  // random unlock
  { kills: 160000 },                  // random unlock — full roster
];

export class CharacterUnlockManager {
  static getUnlockedByMilestones(totalKills) {
    const unlockedIds = [];
    
    KILL_MILESTONES.forEach((milestone) => {
      if (totalKills >= milestone.kills) {
        if (milestone.id) {
          // Named unlock (like 'neobyte')
          unlockedIds.push(milestone.id);
        } else {
          // Placeholder for random unlocks at this milestone
          unlockedIds.push(null);
        }
      }
    });
    
    return unlockedIds.filter(id => id !== null);
  }

  static checkAndGrantRandomUnlock(currentSave, newTotalKills) {
    const previousMilestones = this.getMilestonesReached(currentSave.totalKills || 0);
    const newMilestones = this.getMilestonesReached(newTotalKills);
    
    // Find milestones we just crossed
    const newlyReachedMilestones = newMilestones.filter(m => !previousMilestones.includes(m));
    
    if (newlyReachedMilestones.length === 0) return null;
    
    // For each newly reached milestone, grant a random unlock
    let grantedCharacter = null;
    newlyReachedMilestones.forEach((milestoneKills) => {
      const availableChars = CHARACTERS
        .map(c => c.id)
        .filter(charId => !currentSave.unlockedCharacters.includes(charId));
      
      if (availableChars.length > 0) {
        const randomIdx = Math.floor(Math.random() * availableChars.length);
        const grantedChar = availableChars[randomIdx];
        
        if (!currentSave.unlockedCharacters.includes(grantedChar)) {
          currentSave.unlockedCharacters.push(grantedChar);
          grantedCharacter = grantedChar;
          console.log(`[CharacterUnlocks] Granted ${grantedChar} at ${milestoneKills} kills`);
        }
      }
    });
    
    return grantedCharacter;
  }

  static getMilestonesReached(totalKills) {
    return KILL_MILESTONES
      .filter(m => totalKills >= m.kills)
      .map(m => m.kills);
  }
}