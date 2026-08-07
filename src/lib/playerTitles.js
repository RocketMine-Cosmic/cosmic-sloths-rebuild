// Centralised registry of player titles. Each entry defines:
//   id          — stored on user.data.player_title
//   label       — display text
//   tier        — rarity bucket; controls badge colour everywhere titles render
//   describe(s) — function returning a "how to earn" string given player stats
//   isUnlocked(s) — function returning whether the player meets the requirement
//   buff (opt)  — small in-run buff applied while this title is equipped.
//                 Shape: { damageMult, hpMult, goldMult, xpMult, luck, regen }
//                 Numbers are additive multipliers/flat values consistent with
//                 GameEngine's existing stat math (e.g. damageMult: 0.02 = +2%).
//                 Most titles have NO buff (buff: null) — they're just for show.
//
// `s` is a stats bag: { totalKills, leviathanKills, bestScore, gold,
//   totalGoldEarned, maxLevelReached, maxTimeSurvived, unlockedCharactersCount,
//   totalUnlockedCosmetics, totalUnlockedTalents, globalRaidDamage }

// Tier → tailwind-class colour set used for the title badge wherever it shows.
export const TITLE_TIERS = {
    starter:    { text: 'text-slate-300',   bg: 'bg-slate-900/80',    border: 'border-slate-600/50',    label: 'Starter' },
    common:     { text: 'text-emerald-300', bg: 'bg-emerald-950/60',  border: 'border-emerald-700/50',  label: 'Common' },
    uncommon:   { text: 'text-cyan-300',    bg: 'bg-cyan-950/60',     border: 'border-cyan-700/50',     label: 'Uncommon' },
    rare:       { text: 'text-blue-300',    bg: 'bg-blue-950/60',     border: 'border-blue-700/50',     label: 'Rare' },
    epic:       { text: 'text-purple-300',  bg: 'bg-purple-950/60',   border: 'border-purple-700/50',   label: 'Epic' },
    legendary:  { text: 'text-amber-300',   bg: 'bg-amber-950/70',    border: 'border-amber-600/60',    label: 'Legendary' },
    mythic:     { text: 'text-rose-300',    bg: 'bg-rose-950/70',     border: 'border-rose-600/60',     label: 'Mythic' },
};

// Tier display order — most prestigious first
export const TIER_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common', 'starter'];

// Helper: format a buff for display in the UI
export function formatBuff(buff) {
    if (!buff) return null;
    const parts = [];
    if (buff.damageMult) parts.push(`+${Math.round(buff.damageMult * 100)}% damage`);
    if (buff.hpMult) parts.push(`+${Math.round(buff.hpMult * 100)}% HP`);
    if (buff.goldMult) parts.push(`+${Math.round(buff.goldMult * 100)}% gold`);
    if (buff.xpMult) parts.push(`+${Math.round(buff.xpMult * 100)}% XP`);
    if (buff.luck) parts.push(`+${buff.luck} luck`);
    if (buff.regen) parts.push(`+${buff.regen.toFixed(1)} HP/s regen`);
    if (buff.magnetRange) parts.push(`+${buff.magnetRange} magnet`);
    if (buff.armor) parts.push(`+${buff.armor} armor`);
    if (buff.areaMult) parts.push(`+${Math.round(buff.areaMult * 100)}% area`);
    if (buff.speedMult) parts.push(`+${Math.round(buff.speedMult * 100)}% speed`);
    if (buff.cooldownMult) parts.push(`-${Math.round(Math.abs(buff.cooldownMult) * 100)}% cooldown`);
    return parts.join(', ');
}

export const PLAYER_TITLES = [
    // ============ STARTER ============
    { id: 'Novice Pilot', label: 'Novice Pilot', tier: 'starter', buff: null,
      describe: () => 'Awarded to every pilot — your starter title.',
      isUnlocked: () => true },
    { id: 'Rookie', label: 'Rookie', tier: 'starter', buff: null,
      describe: () => 'Defeat 10 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 10 },
    { id: 'First Blood', label: 'First Blood', tier: 'starter', buff: null,
      describe: () => 'Defeat 100 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 100 },
    { id: 'Pocket Change', label: 'Pocket Change', tier: 'starter', buff: null,
      describe: () => 'Earn 10,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 10000 },
    { id: 'Dabbler', label: 'Dabbler', tier: 'starter', buff: null,
      describe: () => 'Reach level 5 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 5 },
    { id: 'Cadet', label: 'Cadet', tier: 'starter', buff: null,
      describe: () => 'Survive 2 minutes in a single run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 120 },
    { id: 'Apprentice', label: 'Apprentice', tier: 'starter', buff: null,
      describe: () => 'Unlock your first talent.',
      isUnlocked: (s) => s.totalUnlockedTalents >= 1 },

    // ============ COMMON ============
    { id: 'Survivor', label: 'Survivor', tier: 'common', buff: { hpMult: 0.01 },
      describe: () => 'Survive a full 5-minute run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 300 },
    { id: 'Vanguard', label: 'Vanguard', tier: 'common', buff: { damageMult: 0.01 },
      describe: () => 'Defeat 2,500 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 2500 },
    { id: 'Power Up', label: 'Power Up', tier: 'common', buff: { xpMult: 0.02 },
      describe: () => 'Reach level 15 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 15 },
    { id: 'Coin Collector', label: 'Coin Collector', tier: 'common', buff: { goldMult: 0.02 },
      describe: () => 'Earn 50,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 50000 },
    { id: 'Leviathan Slayer', label: 'Leviathan Slayer', tier: 'common', buff: { damageMult: 0.02 },
      describe: () => 'Defeat your first Leviathan boss.',
      isUnlocked: (s) => s.leviathanKills >= 1 },
    { id: 'Trendsetter', label: 'Trendsetter', tier: 'common', buff: null,
      describe: () => 'Unlock 3 cosmetic items.',
      isUnlocked: (s) => s.totalUnlockedCosmetics >= 3 },
    { id: 'Magnetised', label: 'Magnetised', tier: 'common', buff: { magnetRange: 10 },
      describe: () => 'Earn 100,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 100000 },
    { id: 'Quick Study', label: 'Quick Study', tier: 'common', buff: { cooldownMult: -0.01 },
      describe: () => 'Unlock 5 character talents.',
      isUnlocked: (s) => s.totalUnlockedTalents >= 5 },

    // ============ UNCOMMON ============
    { id: 'Veteran', label: 'Veteran', tier: 'uncommon', buff: { hpMult: 0.03 },
      describe: () => 'Survive 7 minutes in a single Endless run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 420 },
    { id: 'Exterminator', label: 'Exterminator', tier: 'uncommon', buff: { damageMult: 0.03 },
      describe: () => 'Defeat 10,000 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 10000 },
    { id: 'Ascendant', label: 'Ascendant', tier: 'uncommon', buff: { xpMult: 0.04 },
      describe: () => 'Reach level 25 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 25 },
    { id: 'Gold Hoarder', label: 'Gold Hoarder', tier: 'uncommon', buff: { goldMult: 0.04 },
      describe: () => 'Earn 250,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 250000 },
    { id: 'Lucky Sloth', label: 'Lucky Sloth', tier: 'uncommon', buff: { luck: 1 },
      describe: () => 'Defeat 5 Leviathan bosses.',
      isUnlocked: (s) => s.leviathanKills >= 5 },
    { id: 'Ironclad', label: 'Ironclad', tier: 'uncommon', buff: { armor: 1 },
      describe: () => 'Reach 50,000 score in a single run.',
      isUnlocked: (s) => s.bestScore >= 50000 },
    { id: 'Swift Foot', label: 'Swift Foot', tier: 'uncommon', buff: { speedMult: 0.03 },
      describe: () => 'Survive 6 minutes in a single run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 360 },
    { id: 'Tactician', label: 'Tactician', tier: 'uncommon', buff: { areaMult: 0.03 },
      describe: () => 'Unlock 10 character talents.',
      isUnlocked: (s) => s.totalUnlockedTalents >= 10 },
    { id: 'Raid Recruit', label: 'Raid Recruit', tier: 'uncommon', buff: { damageMult: 0.03 },
      describe: () => 'Deal 50,000 damage to a Global Raid boss.',
      isUnlocked: (s) => s.globalRaidDamage >= 50000 },

    // ============ RARE ============
    { id: 'Time Lord', label: 'Time Lord', tier: 'rare', buff: { hpMult: 0.03, regen: 0.2 },
      describe: () => 'Survive 10 minutes in a single Endless run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 600 },
    { id: 'Void Walker', label: 'Void Walker', tier: 'rare', buff: { damageMult: 0.04 },
      describe: () => 'Defeat 25,000 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 25000 },
    { id: 'Cosmic Destroyer', label: 'Cosmic Destroyer', tier: 'rare', buff: { damageMult: 0.04, areaMult: 0.04 },
      describe: () => 'Defeat 50,000 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 50000 },
    { id: 'Top Survivor', label: 'Top Survivor', tier: 'rare', buff: { hpMult: 0.03 },
      describe: () => 'Reach 150,000 score in a single run.',
      isUnlocked: (s) => s.bestScore >= 150000 },
    { id: 'Filthy Rich', label: 'Filthy Rich', tier: 'rare', buff: { goldMult: 0.05 },
      describe: () => 'Earn 750,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 750000 },
    { id: 'Beyond Limits', label: 'Beyond Limits', tier: 'rare', buff: { xpMult: 0.04 },
      describe: () => 'Reach level 35 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 35 },
    { id: 'Raid Trooper', label: 'Raid Trooper', tier: 'rare', buff: { damageMult: 0.04 },
      describe: () => 'Deal 250,000 damage to a Global Raid boss.',
      isUnlocked: (s) => s.globalRaidDamage >= 250000 },
    { id: 'Fashionista', label: 'Fashionista', tier: 'rare', buff: { luck: 2 },
      describe: () => 'Unlock 12 cosmetic items.',
      isUnlocked: (s) => s.totalUnlockedCosmetics >= 12 },
    { id: 'Skillful', label: 'Skillful', tier: 'rare', buff: { cooldownMult: -0.02 },
      describe: () => 'Unlock 25 character talents.',
      isUnlocked: (s) => s.totalUnlockedTalents >= 25 },
    { id: 'Boss Hunter', label: 'Boss Hunter', tier: 'rare', buff: { damageMult: 0.04 },
      describe: () => 'Defeat 15 Leviathan bosses.',
      isUnlocked: (s) => s.leviathanKills >= 15 },
    { id: 'Aegis Bearer', label: 'Aegis Bearer', tier: 'rare', buff: { armor: 2, hpMult: 0.02 },
      describe: () => 'Survive 12 minutes in a single Endless run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 720 },
    // ============ EPIC ============
    { id: 'Eternal', label: 'Eternal', tier: 'epic', buff: { hpMult: 0.05, regen: 0.3 },
      describe: () => 'Survive 15 minutes in a single Endless run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 900 },
    { id: 'Genocidal Sloth', label: 'Genocidal Sloth', tier: 'epic', buff: { damageMult: 0.05 },
      describe: () => 'Defeat 100,000 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 100000 },
    { id: 'Apex Predator', label: 'Apex Predator', tier: 'epic', buff: { damageMult: 0.04, critBonus: 0.02 },
      describe: () => 'Defeat 25 Leviathan bosses.',
      isUnlocked: (s) => s.leviathanKills >= 25 },
    { id: 'Billionaire', label: 'Billionaire', tier: 'epic', buff: { goldMult: 0.06 },
      describe: () => 'Earn 2,500,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 2500000 },
    { id: 'God Tier', label: 'God Tier', tier: 'epic', buff: { xpMult: 0.05, hpMult: 0.03 },
      describe: () => 'Reach level 45 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 45 },
    { id: 'Raid Captain', label: 'Raid Captain', tier: 'epic', buff: { damageMult: 0.04 },
      describe: () => 'Deal 1,000,000 damage to a Global Raid boss.',
      isUnlocked: (s) => s.globalRaidDamage >= 1000000 },
    { id: 'Score Tyrant', label: 'Score Tyrant', tier: 'epic', buff: { damageMult: 0.04, xpMult: 0.03 },
      describe: () => 'Reach 300,000 score in a single run.',
      isUnlocked: (s) => s.bestScore >= 300000 },
    { id: 'Stylist', label: 'Stylist', tier: 'epic', buff: { luck: 3, goldMult: 0.05 },
      describe: () => 'Unlock 20 cosmetic items.',
      isUnlocked: (s) => s.totalUnlockedCosmetics >= 20 },
    { id: 'Talent Sage', label: 'Talent Sage', tier: 'epic', buff: { cooldownMult: -0.03, xpMult: 0.03 },
      describe: () => 'Unlock 35 character talents.',
      isUnlocked: (s) => s.totalUnlockedTalents >= 35 },

    // ============ LEGENDARY ============
    { id: 'Immortal Sloth', label: 'Immortal Sloth', tier: 'legendary', buff: { hpMult: 0.07, regen: 0.5 },
      describe: () => 'Survive 20 minutes in a single Endless run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 1200 },
    { id: 'Sloth God', label: 'Sloth God', tier: 'legendary', buff: { damageMult: 0.07 },
      describe: () => 'Defeat 250,000 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 250000 },
    { id: 'Cosmic Legend', label: 'Cosmic Legend', tier: 'legendary', buff: { damageMult: 0.05, hpMult: 0.05 },
      describe: () => 'Reach 500,000 score in a single run.',
      isUnlocked: (s) => s.bestScore >= 500000 },
    { id: 'Sloth of Wall Street', label: 'Sloth of Wall Street', tier: 'legendary', buff: { goldMult: 0.10 },
      describe: () => 'Earn 10,000,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 10000000 },
    { id: 'Maximum Overdrive', label: 'Maximum Overdrive', tier: 'legendary', buff: { damageMult: 0.05, xpMult: 0.05, hpMult: 0.05 },
      describe: () => 'Reach level 55 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 55 },
    { id: 'Leviathan Warden', label: 'Leviathan Warden', tier: 'legendary', buff: { damageMult: 0.06, armor: 3 },
      describe: () => 'Defeat 75 Leviathan bosses.',
      isUnlocked: (s) => s.leviathanKills >= 75 },
    { id: 'Raid Vanquisher', label: 'Raid Vanquisher', tier: 'legendary', buff: { damageMult: 0.06, hpMult: 0.04 },
      describe: () => 'Deal 2,500,000 damage to a Global Raid boss.',
      isUnlocked: (s) => s.globalRaidDamage >= 2500000 },

    // ============ MYTHIC ============
    { id: 'Bringer of Extinction', label: 'Bringer of Extinction', tier: 'mythic', buff: { damageMult: 0.10 },
      describe: () => 'Defeat 750,000 enemies (lifetime).',
      isUnlocked: (s) => s.totalKills >= 750000 },
    { id: 'Omniscient', label: 'Omniscient', tier: 'mythic', buff: { cooldownMult: -0.05, areaMult: 0.05 },
      describe: () => 'Unlock 30 character talents.',
      isUnlocked: (s) => s.totalUnlockedTalents >= 30 },
    { id: 'World Eater Bane', label: 'World Eater Bane', tier: 'mythic', buff: { damageMult: 0.08, hpMult: 0.05 },
      describe: () => 'Deal 5,000,000 damage to a Global Raid boss.',
      isUnlocked: (s) => s.globalRaidDamage >= 5000000 },
    { id: 'Eternal Sovereign', label: 'Eternal Sovereign', tier: 'mythic', buff: { hpMult: 0.08, regen: 0.6, armor: 4 },
      describe: () => 'Survive 30 minutes in a single Endless run.',
      isUnlocked: (s) => s.maxTimeSurvived >= 1800 },
    { id: 'Wealth Incarnate', label: 'Wealth Incarnate', tier: 'mythic', buff: { goldMult: 0.15, luck: 4 },
      describe: () => 'Earn 25,000,000 gold (lifetime).',
      isUnlocked: (s) => s.totalGoldEarned >= 25000000 },
    { id: 'Ascended', label: 'Ascended', tier: 'mythic', buff: { damageMult: 0.06, xpMult: 0.06, hpMult: 0.06 },
      describe: () => 'Reach level 70 in a single run.',
      isUnlocked: (s) => s.maxLevelReached >= 70 },
    { id: 'Completionist', label: 'Completionist', tier: 'legendary', buff: { damageMult: 0.05, hpMult: 0.05, goldMult: 0.05 },
      describe: () => 'Unlock all 10 characters.',
      isUnlocked: (s) => s.unlockedCharactersCount >= 10 },
];

// Look up a title's tier-styling by id. Returns starter styling for unknown ids.
export function getTitleStyle(titleId) {
    if (!titleId) return TITLE_TIERS.starter;
    const t = PLAYER_TITLES.find(x => x.id === titleId);
    return TITLE_TIERS[t?.tier] || TITLE_TIERS.starter;
}

// Look up a title's buff by id. Returns null if no buff defined.
export function getTitleBuff(titleId) {
    if (!titleId) return null;
    const t = PLAYER_TITLES.find(x => x.id === titleId);
    return t?.buff || null;
}