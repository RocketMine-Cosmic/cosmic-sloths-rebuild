// Squad leveling system
// XP is awarded based on weekly kills contributed

export const SQUAD_LEVELS = [
  { level: 1,  xpRequired: 0,      name: 'Recruits',    badge: '🦥', borderColor: '#64748b', glowColor: 'rgba(100,116,139,0.4)' },
  { level: 2,  xpRequired: 5000,   name: 'Drifters',    badge: '⭐', borderColor: '#3b82f6', glowColor: 'rgba(59,130,246,0.4)' },
  { level: 3,  xpRequired: 15000,  name: 'Hunters',     badge: '🔥', borderColor: '#10b981', glowColor: 'rgba(16,185,129,0.4)' },
  { level: 4,  xpRequired: 35000,  name: 'Vanguards',   badge: '⚡', borderColor: '#f59e0b', glowColor: 'rgba(245,158,11,0.5)' },
  { level: 5,  xpRequired: 75000,  name: 'Reapers',     badge: '💀', borderColor: '#ef4444', glowColor: 'rgba(239,68,68,0.5)' },
  { level: 6,  xpRequired: 150000, name: 'Legends',     badge: '👑', borderColor: '#a855f7', glowColor: 'rgba(168,85,247,0.6)' },
  { level: 7,  xpRequired: 300000, name: 'Cosmic Elite', badge: '🌌', borderColor: '#ec4899', glowColor: 'rgba(236,72,153,0.7)' },
  { level: 8,  xpRequired: 600000,    name: 'Void Sovereigns',    badge: '🛸', borderColor: '#8b5cf6', glowColor: 'rgba(139,92,246,0.7)' },
  { level: 9,  xpRequired: 1200000,   name: 'Star Forgers',       badge: '⚔️', borderColor: '#f97316', glowColor: 'rgba(249,115,22,0.7)' },
  { level: 10, xpRequired: 2500000,   name: 'Eternal Ascendants', badge: '🌠', borderColor: '#fbbf24', glowColor: 'rgba(251,191,36,0.75)' },
  { level: 11, xpRequired: 5000000,   name: 'Galaxy Wardens',     badge: '🪐', borderColor: '#06b6d4', glowColor: 'rgba(6,182,212,0.75)' },
  { level: 12, xpRequired: 10000000,  name: 'Nebula Tyrants',     badge: '☄️', borderColor: '#d946ef', glowColor: 'rgba(217,70,239,0.8)' },
  { level: 13, xpRequired: 20000000,  name: 'Singularity Lords',  badge: '🕳️', borderColor: '#7c3aed', glowColor: 'rgba(124,58,237,0.85)' },
  { level: 14, xpRequired: 40000000,  name: 'Ascended Pantheon',  badge: '🔱', borderColor: '#facc15', glowColor: 'rgba(250,204,21,0.9)' },
  { level: 15, xpRequired: 80000000,  name: 'Omenforged',         badge: '✨', borderColor: '#f43f5e', glowColor: 'rgba(244,63,94,0.95)' },
];

export const MAX_SQUAD_LEVEL = SQUAD_LEVELS.length;

export function getSquadLevel(xp = 0) {
  let current = SQUAD_LEVELS[0];
  for (const lvl of SQUAD_LEVELS) {
    if (xp >= lvl.xpRequired) current = lvl;
    else break;
  }
  return current;
}

export function getNextSquadLevel(xp = 0) {
  const currentLevel = getSquadLevel(xp);
  return SQUAD_LEVELS.find(l => l.level === currentLevel.level + 1) || null;
}

export function getSquadXpProgress(xp = 0) {
  const current = getSquadLevel(xp);
  const next = getNextSquadLevel(xp);
  if (!next) return 100; // Max level
  const progressXp = xp - current.xpRequired;
  const neededXp = next.xpRequired - current.xpRequired;
  return Math.min(100, (progressXp / neededXp) * 100);
}

// XP awarded = kills contributed this week (1 kill = 1 XP)
export function calculateXpFromKills(kills) {
  return kills;
}