export const CHARACTERS = [
  { id: 'neobyte', name: 'NeoByte', desc: 'Commander. Balanced all-rounder.', skillDesc: 'Deploys a support banner every 15s that boosts damage and cooldowns.', hp: 140, speed: 3.0, armor: 5, regen: 0.1, cost: 0, color: '#0066FF', image: '/assets/69c5d61e39690bf20f763b4c/beab0f249_NeoByteF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/11e3e66c7_NeoByteIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/34f5b1be2_NeoByteWalk.png', damageMult: 1.1, cooldownMult: 0.9, areaMult: 1.0, magnetRange: 72, luck: 0, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 1.0 },
  { id: 'pandypaws', name: 'Pandypaws', desc: 'Heavy Armor Mechanic. Tanky but slow.', skillDesc: '5% chance on kill to drop scrap that grants permanent armor.', hp: 220, speed: 2.5, armor: 10, regen: 0.7, cost: 1000, color: '#C2185B', image: '/assets/69c5d61e39690bf20f763b4c/82f3642e6_PandyPawsF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/e73a641fd_PandyPawsIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/a756cd378_PandyPawsWalk.png', damageMult: 1.0, cooldownMult: 1.15, areaMult: 1.25, magnetRange: 60, luck: 0, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 0.85 },
  { id: 'novabyte', name: 'NovaByte', desc: 'Comms & Demolitions. High area and damage, low HP.', skillDesc: '10% chance on kill to trigger a localized chain explosion.', hp: 95, speed: 3.0, armor: 3, regen: 0.1, cost: 2000, color: '#FF007F', image: '/assets/69c5d61e39690bf20f763b4c/9db3cfc07_NovaByteF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/f3d0b5231_NovaByteIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/169f06639_NovaByteWalk.png', damageMult: 1.35, cooldownMult: 1.05, areaMult: 1.55, magnetRange: 72, luck: 0, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 1.0 },
  { id: 'glitch', name: 'Glitch', desc: 'Stealth Assassin. Very fast, high damage, fragile.', skillDesc: '15% chance when hit to phase shift and gain invulnerability.', hp: 75, speed: 3.6, armor: 3, regen: 0, cost: 4000, color: '#FF00FF', image: '/assets/69c5d61e39690bf20f763b4c/2469b9070_GlitchF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/918b41ceb_GlitchIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/cbd3bc6c7_GlitchWalk.png', damageMult: 1.5, cooldownMult: 0.8, areaMult: 0.85, magnetRange: 48, luck: 2, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 1.2 },
  { id: 'holodrift', name: 'HoloDrift', desc: 'Engineer. High magnet range and XP gain.', skillDesc: 'Deploys a holographic decoy every 20s that taunts enemies.', hp: 110, speed: 2.9, armor: 4, regen: 0.2, cost: 6000, color: '#00FA9A', image: '/assets/69c5d61e39690bf20f763b4c/553fe0f67_HoloDriftF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/5d2346bbe_HoloDriftIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/e4b28984e_HoloDriftWalk.png', damageMult: 1.0, cooldownMult: 0.95, areaMult: 1.05, magnetRange: 144, luck: 1, goldMult: 1.0, xpMult: 1.35, projSpeedMult: 1.0 },
  { id: 'codebreaker', name: 'CodeBreaker', desc: 'Cyber Warfare Hacker. Fast cooldowns, high luck.', skillDesc: 'Hacks up to 3 nearby enemies every 10s, turning them against their allies.', hp: 90, speed: 3.1, armor: 4, regen: 0, cost: 8000, color: '#39FF14', image: '/assets/69c5d61e39690bf20f763b4c/d7c90aaac_CodeBreakerF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/661140437_CodeBreakerIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/7d2de0129_CodeBreakerWalk.png', damageMult: 0.7, cooldownMult: 0.6, areaMult: 1.0, magnetRange: 72, luck: 3, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 1.0 },
  { id: 'dataphantom', name: 'DataPhantom', desc: 'Strategic Hacker. High projectile speed, good armor.', skillDesc: 'Leeches data from nearby enemies to slow them and gain speed.', hp: 125, speed: 3.0, armor: 7, regen: 0.3, cost: 10000, color: '#98FF98', image: '/assets/69c5d61e39690bf20f763b4c/197092c32_DataPhantomF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/5e5068816_DataPhantomIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/d934f203d_DataPhantomWalk.png', damageMult: 1.15, cooldownMult: 0.95, areaMult: 1.0, magnetRange: 72, luck: 0, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 1.6 },
  { id: 'neonvortex', name: 'NeonVortex', desc: 'Elite Sniper. Extreme damage, very slow cooldowns.', skillDesc: 'Executes non-boss enemies below 20% HP with railgun blasts.', hp: 50, speed: 3.2, armor: 3, regen: 0, cost: 15000, color: '#7A00FF', image: '/assets/69c5d61e39690bf20f763b4c/467861605_NeonVortexF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/95c0e7e61_NeonVortexIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/f5ec27db1_NeonVortexWalk.png', damageMult: 2.0, cooldownMult: 1.5, areaMult: 0.7, magnetRange: 72, luck: 0, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 2.0 },
  { id: 'synthbeats', name: 'SynthBeats', desc: 'Diplomat. High gold gain and luck.', skillDesc: 'Automatically bribes death with 5 gold to negate incoming damage.', hp: 100, speed: 3.0, armor: 4, regen: 0.2, cost: 20000, color: '#FFD700', image: '/assets/69c5d61e39690bf20f763b4c/9eb5364ba_SynthBeatsF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/9f87d9681_SynthBeatsIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/f3624de57_SynthBeatsWalk.png', damageMult: 0.9, cooldownMult: 1.0, areaMult: 1.0, magnetRange: 84, luck: 2, goldMult: 1.5, xpMult: 1.0, projSpeedMult: 1.0 },
  { id: 'skybyte', name: 'SkyByte', desc: 'Ace Pilot. Very fast, good damage and area.', skillDesc: 'Charges a Sonic Boom while moving; triggers upon stopping.', hp: 90, speed: 3.5, armor: 3, regen: 0, cost: 25000, color: '#00D4FF', image: '/assets/69c5d61e39690bf20f763b4c/3cbfa8254_SkyByteF.png', idleSprite: '/assets/69c5d61e39690bf20f763b4c/ae36c6378_SkyByteIdle.png', walkSprite: '/assets/69c5d61e39690bf20f763b4c/489fe3f02_SkyByteWalk.png', damageMult: 1.2, cooldownMult: 0.9, areaMult: 1.2, magnetRange: 72, luck: 0, goldMult: 1.0, xpMult: 1.0, projSpeedMult: 1.3 }
];

export const DIFFICULTIES = [
  { id: 'easy', name: 'Easy', desc: 'Forgiving start for new pilots. -50% XP & Gold.', xpMult: 0.5, goldMult: 0.5, enemyHpMult: 0.7, enemyDmgMult: 0.6, hazardChance: 0, speedMult: 0.85 },
  { id: 'normal', name: 'Normal', desc: 'Standard experience. Balanced challenge.', xpMult: 1.0, goldMult: 1.0, enemyHpMult: 1.0, enemyDmgMult: 1.0, hazardChance: 0, speedMult: 1.0 },
  { id: 'hard', name: 'Hard', desc: 'Tougher enemies. Occasional hazards. +100% XP & Gold.', xpMult: 2.0, goldMult: 2.0, enemyHpMult: 1.5, enemyDmgMult: 1.5, hazardChance: 0.05, speedMult: 1.1 },
  { id: 'cosmic', name: 'Cosmic', desc: 'Extreme danger. Frequent hazards. +200% XP & Gold.', xpMult: 3.0, goldMult: 3.0, enemyHpMult: 2.5, enemyDmgMult: 2.5, hazardChance: 0.15, speedMult: 1.25 }
];

export const ARENAS = [
  { id: 'station', name: 'Azure Expanse', bg: '#1a1a2e', image: '/assets/69c5d61e39690bf20f763b4c/82c27e5c0_Map2.png', duration: 180, effect: 'neon_rain' },
  { id: 'asteroid', name: 'Mystic Cosmos', bg: '#2d1b19', image: '/assets/69c5d61e39690bf20f763b4c/1f6fc6cad_Map11.png', duration: 210, effect: 'fog' },
  { id: 'nebula', name: 'Ethereal Nebula', bg: '#2b103a', image: '/assets/69c5d61e39690bf20f763b4c/888640bf8_Map13.png', duration: 240, effect: 'fog' },
  { id: 'void', name: 'Crimson Void', bg: '#0a0a0a', image: '/assets/69c5d61e39690bf20f763b4c/dca64fcac_Map14.png', duration: 270, effect: 'none' },
  { id: 'plasma', name: 'Solar Storm', bg: '#3a001e', image: '/assets/69c5d61e39690bf20f763b4c/289f5cb1d_Map15.png', duration: 300, effect: 'solar_flare' },
  { id: 'crystal', name: 'Emerald Galaxy', bg: '#002222', image: '/assets/69c5d61e39690bf20f763b4c/a138bba7b_Map16.png', duration: 330, effect: 'neon_rain' },
  { id: 'moon', name: 'Shattered Core', bg: '#112233', image: '/assets/69c5d61e39690bf20f763b4c/ef5a7f3ec_Map17.png', duration: 360, effect: 'fog' },
  { id: 'blackhole', name: 'Abyssal Vortex', bg: '#000000', image: '/assets/69c5d61e39690bf20f763b4c/b29cf4702_map18.png', duration: 390, effect: 'solar_flare' },
  { id: 'mothership', name: 'Turquoise Drift', bg: '#220022', image: '/assets/69c5d61e39690bf20f763b4c/b7bfbd6fe_Map19.png', duration: 420, effect: 'neon_rain' },
  { id: 'dimension', name: 'Rainbow Rift', bg: '#110033', image: '/assets/69c5d61e39690bf20f763b4c/6f707a3e0_Map20.png', duration: 450, effect: 'solar_flare' },
  // ===== OUTER GALAXY (S11-S20) — endgame ladder, added 2026-06-04 =====
  // Sector indices 10-19 in this array → display sectors 11-20. Backgrounds in the
  // 69de258a7e072380b89d66e3 storage bucket. Effects reuse the existing 4 engine effects
  // (fog / neon_rain / solar_flare / none) — new effects can be added in a later pass.
  // Durations grow +30s per sector, 8:00 → 12:30. MUST match ARENA_DURATIONS in saveScore.
  { id: 'galactic_core', name: 'The Galactic Core', bg: '#0a0518', image: '/assets/69de258a7e072380b89d66e3/069d2b286_MilkyWay_Starfield.png', duration: 480, effect: 'fog' },
  { id: 'pillars', name: 'Pillars of Creation', bg: '#1a0a2a', image: '/assets/69de258a7e072380b89d66e3/5e69ed395_Nubula_Pillars.png', duration: 510, effect: 'neon_rain' },
  { id: 'saturnian', name: 'Saturnian Reach', bg: '#1a1a05', image: '/assets/69de258a7e072380b89d66e3/28e6f3f01_Ringed_planets.png', duration: 540, effect: 'none' },
  { id: 'andromeda', name: 'Andromeda\'s Edge', bg: '#05101a', image: '/assets/69de258a7e072380b89d66e3/4300cbae0_Spiral_Galaxy.png', duration: 570, effect: 'fog' },
  { id: 'painters_spiral', name: 'The Painter\'s Spiral', bg: '#1a1505', image: '/assets/69de258a7e072380b89d66e3/b2890294e_Majestic_spiral.png', duration: 600, effect: 'solar_flare' },
  { id: 'harmony', name: 'Harmony Drift', bg: '#0a1a15', image: '/assets/69de258a7e072380b89d66e3/04713b746_Harmony.png', duration: 630, effect: 'neon_rain' },
  { id: 'chromatic', name: 'Chromatic Tides', bg: '#1a0510', image: '/assets/69de258a7e072380b89d66e3/8717e0950_Swirling_nebulae.png', duration: 660, effect: 'fog' },
  { id: 'stormfront', name: 'Stormfront Nebula', bg: '#051520', image: '/assets/69de258a7e072380b89d66e3/c0893d46c_Cosmic_Storm.png', duration: 690, effect: 'solar_flare' },
  { id: 'supernova', name: 'Supernova Heart', bg: '#200510', image: '/assets/69de258a7e072380b89d66e3/c6b90fc36_SuperNova_Burst.png', duration: 720, effect: 'solar_flare' },
  { id: 'devourer', name: 'The Devourer', bg: '#000000', image: '/assets/69de258a7e072380b89d66e3/9161fafb4_Cosmic_BlackHole.png', duration: 750, effect: 'none' },
  // Squad Meteor — dedicated DPS-check arena. Background = QuantumHole.png, 3-min run,
  // no mob spawns (handled by GameEngine when arena.id === 'quantum_meteor'), single
  // stationary asteroid target. Not selectable in normal Hub/Loadouts — entered only
  // via the "Attack Meteor" button on the Squads page.
  { id: 'quantum_meteor', name: 'Quantum Meteor', bg: '#02040a', image: '/assets/69de258a7e072380b89d66e3/d5e6acf9c_QuantumHole.png', duration: 90, effect: 'none', isSquadMeteor: true, hideFromArenaPicker: true }
];

// Sprite sheet for the Quantum Meteor target. 4×4 grid (16 frames), 192px per frame.
// Looping pulse animation rendered by GameEngine when the meteor arena is active.
export const QUANTUM_METEOR_SPRITE = {
  url: '/assets/69de258a7e072380b89d66e3/6952b5286_sprite-192px-frames-16-rows-4-cols-4.png',
  frameSize: 192,
  cols: 4,
  rows: 4,
  frameCount: 16,
  animationSpeed: 0.10,
};

// Per-weapon thematic labels for the Armory upgrade panel. Keys: damage / area / cooldown.
// Same business logic as before — these only change the displayed label text.
export const WEAPONS = {
  neoBlaster: { id: 'neoBlaster', name: 'Blaster', type: 'weapon', desc: 'Fires reliable energy blasts.', masteryDesc: 'MASTERY: Fires a spread of 3 blasts.', baseDamage: 12, baseCooldown: 45, baseArea: 1, labels: { damage: 'Plasma Output', area: 'Beam Spread', cooldown: 'Cooling Rate' } },
  napBeam: { id: 'napBeam', name: 'Cosmic Nap Beam', type: 'weapon', desc: 'Fires a piercing beam.', masteryDesc: 'MASTERY: Beam chains to nearby enemies. (Blue Beam)', baseDamage: 10, baseCooldown: 50, baseArea: 1, labels: { damage: 'Beam Power', area: 'Beam Width', cooldown: 'Recharge Rate' } },
  vineWhip: { id: 'vineWhip', name: 'Plasma Whip', type: 'weapon', desc: 'Swipes nearby enemies.', masteryDesc: 'MASTERY: Heals player for 5% of damage dealt. (Red Whip)', baseDamage: 15, baseCooldown: 40, baseArea: 1, labels: { damage: 'Whip Power', area: 'Lash Reach', cooldown: 'Crack Rate' } },
  slothSwarm: { id: 'slothSwarm', name: 'Orbital Drones', type: 'weapon', desc: 'Orbiting defense drones.', masteryDesc: 'MASTERY: Drones move faster and shoot lasers. (Red Drones)', baseDamage: 6, baseCooldown: 90, baseArea: 1, labels: { damage: 'Drone Damage', area: 'Orbit Radius', cooldown: 'Spin Up' } },
  napalm: { id: 'napalm', name: 'Zero-G Napalm', type: 'weapon', desc: 'Leaves burning pools.', masteryDesc: 'MASTERY: Blue fire that slows enemies by 50%.', baseDamage: 5, baseCooldown: 75, baseArea: 1, labels: { damage: 'Burn Intensity', area: 'Pool Size', cooldown: 'Refuel Rate' } },
  novaPulse: { id: 'novaPulse', name: 'Nova Pulse', type: 'weapon', desc: 'A massive expanding energy blast.', masteryDesc: 'MASTERY: Triggers a second echo pulse. (Purple Blast)', baseDamage: 25, baseCooldown: 150, baseArea: 1, labels: { damage: 'Pulse Power', area: 'Blast Radius', cooldown: 'Recharge Rate' } },
  shieldBubble: { id: 'shieldBubble', name: 'Shield Bubble', type: 'weapon', desc: 'Pushes enemies away and damages them.', masteryDesc: 'MASTERY: Fires retaliatory lasers at enemies. (Golden Shield)', baseDamage: 15, baseCooldown: 180, baseArea: 1, labels: { damage: 'Barrier Strength', area: 'Bubble Size', cooldown: 'Recharge Rate' } },
  bouncingBlade: { id: 'bouncingBlade', name: 'Ricochet Blade', type: 'weapon', desc: 'Fires a bouncing sawblade.', masteryDesc: 'MASTERY: Blades bounce more times. (Silver Blade)', baseDamage: 15, baseCooldown: 60, baseArea: 1, labels: { damage: 'Blade Edge', area: 'Bounce Range', cooldown: 'Throw Rate' } },
  toxicCloud: { id: 'toxicCloud', name: 'Toxic Emitter', type: 'weapon', desc: 'Leaves a lingering poison cloud.', masteryDesc: 'MASTERY: Clouds grow larger over time. (Green Cloud)', baseDamage: 8, baseCooldown: 90, baseArea: 1, labels: { damage: 'Toxin Potency', area: 'Cloud Size', cooldown: 'Vent Rate' } },
  // Synergies
  burningBarrier: { id: 'burningBarrier', name: 'Burning Barrier', type: 'weapon', desc: 'SYNERGY: A fiery shield that burns and pushes enemies.', baseDamage: 18, baseCooldown: 150, baseArea: 1.5, isSynergy: true, labels: { damage: 'Flame Force', area: 'Barrier Radius', cooldown: 'Recharge Rate' } },
  laserNova: { id: 'laserNova', name: 'Laser Nova', type: 'weapon', desc: 'SYNERGY: An expanding blast of piercing lasers.', baseDamage: 45, baseCooldown: 120, baseArea: 1.2, isSynergy: true, labels: { damage: 'Beam Power', area: 'Blast Radius', cooldown: 'Charge Time' } },
  thornySwarm: { id: 'thornySwarm', name: 'Plasma Swarm', type: 'weapon', desc: 'SYNERGY: Orbiting drones armed with plasma whips.', baseDamage: 20, baseCooldown: 75, baseArea: 1.5, isSynergy: true, labels: { damage: 'Drone Damage', area: 'Orbit Radius', cooldown: 'Spin-Up Time' } },
  orbitalLasers: { id: 'orbitalLasers', name: 'Orbital Lasers', type: 'weapon', desc: 'SYNERGY: Drones that rapidly fire piercing beams.', baseDamage: 25, baseCooldown: 50, baseArea: 1.2, isSynergy: true, labels: { damage: 'Laser Power', area: 'Beam Range', cooldown: 'Fire Rate' } },
  seismicWhip: { id: 'seismicWhip', name: 'Seismic Whip', type: 'weapon', desc: 'SYNERGY: Whip strikes generate expanding shockwaves.', baseDamage: 35, baseCooldown: 35, baseArea: 1.5, isSynergy: true, labels: { damage: 'Quake Force', area: 'Shockwave Radius', cooldown: 'Strike Speed' } },
  flamingLash: { id: 'flamingLash', name: 'Flaming Lash', type: 'weapon', desc: 'SYNERGY: A molten whip that leaves persistent fire.', baseDamage: 28, baseCooldown: 35, baseArea: 1.5, isSynergy: true, labels: { damage: 'Burn Power', area: 'Lash Reach', cooldown: 'Crack Rate' } },
  venomLash: { id: 'venomLash', name: 'Venom Lash', type: 'weapon', desc: 'SYNERGY: A whip that applies toxic damage and slows.', baseDamage: 25, baseCooldown: 40, baseArea: 1.5, isSynergy: true, labels: { damage: 'Venom Potency', area: 'Lash Reach', cooldown: 'Strike Rate' } },
  supernovaBeam: { id: 'supernovaBeam', name: 'Supernova Beam', type: 'weapon', desc: 'EVOLVED: Massive piercing beam that explodes on impact.', baseDamage: 60, baseCooldown: 60, baseArea: 1.5, isEvolution: true, labels: { damage: 'Beam Power', area: 'Blast Radius', cooldown: 'Charge Time' } },
  vampiricLash: { id: 'vampiricLash', name: 'Vampiric Lash', type: 'weapon', desc: 'EVOLVED: Heals 1% of damage dealt (up to 5% Max HP per swing) and covers screen.', baseDamage: 45, baseCooldown: 50, baseArea: 2.2, isEvolution: true, labels: { damage: 'Drain Power', area: 'Lash Reach', cooldown: 'Strike Rate' } },
  orbitalDefense: { id: 'orbitalDefense', name: 'Orbital Defense Network', type: 'weapon', desc: 'EVOLVED: Indestructible drones that rapidly shoot lasers.', baseDamage: 35, baseCooldown: 40, baseArea: 2, isEvolution: true, labels: { damage: 'Drone Damage', area: 'Network Range', cooldown: 'Laser Fire Rate' } },
  hellfire: { id: 'hellfire', name: 'Hellfire', type: 'weapon', desc: 'EVOLVED: Blue flames that persist and melt everything.', baseDamage: 25, baseCooldown: 80, baseArea: 1.5, isEvolution: true, labels: { damage: 'Inferno Heat', area: 'Pool Size', cooldown: 'Drop Rate' } },
  quantumCollapse: { id: 'quantumCollapse', name: 'Quantum Collapse', type: 'weapon', desc: 'EVOLVED: Triple-pulse dark energy burst (each pulse hits harder than the last).', baseDamage: 75, baseCooldown: 80, baseArea: 2, isEvolution: true, labels: { damage: 'Pulse Yield', area: 'Collapse Radius', cooldown: 'Pulse Rate' } },
  aegisMatrix: { id: 'aegisMatrix', name: 'Aegis Matrix', type: 'weapon', desc: 'EVOLVED: Massive repulsion and retaliates with missiles.', baseDamage: 40, baseCooldown: 100, baseArea: 2, isEvolution: true, labels: { damage: 'Barrier Strength', area: 'Matrix Size', cooldown: 'Recharge Rate' } },
  buzzsawSwarm: { id: 'buzzsawSwarm', name: 'Buzzsaw Swarm', type: 'weapon', desc: 'EVOLVED: Multiple massive blades that ricochet wildly.', baseDamage: 30, baseCooldown: 50, baseArea: 1.5, isEvolution: true, labels: { damage: 'Blade Edge', area: 'Bounce Range', cooldown: 'Reload Speed' } },
};

export const BOUNTIES_POOL = [
  { id: 'kills_200', desc: 'Defeat 200 enemies (Total)', type: 'kills', target: 200, reward: 150, currency: 'gold' },
  { id: 'kills_500', desc: 'Defeat 500 enemies (Total)', type: 'kills', target: 500, reward: 300, currency: 'gold' },
  { id: 'survive_300', desc: 'Survive for 5 mins (Single run)', type: 'survive', target: 300, reward: 2, currency: 'fragment' },
  { id: 'gold_100', desc: 'Earn 100 gold (Single run)', type: 'gold', target: 100, reward: 50, currency: 'gold' },
  { id: 'level_15', desc: 'Reach Level 15 (Single run)', type: 'level', target: 15, reward: 1, currency: 'fragment' },
  { id: 'play_3', desc: 'Play 3 runs', type: 'play', target: 3, reward: 100, currency: 'gold' }
];

export const DAILY_MISSIONS_POOL = [
  { id: 'dm_survive_600', desc: 'Survive for 10 mins (Single run)', type: 'survive', target: 600, reward: 10 },
  { id: 'dm_level_30', desc: 'Reach Level 30 (Single run)', type: 'level', target: 30, reward: 10 },
  { id: 'dm_kills_2000', desc: 'Defeat 2000 enemies (Total)', type: 'kills', target: 2000, reward: 10 },
  { id: 'dm_gold_500', desc: 'Earn 500 gold (Single run)', type: 'gold', target: 500, reward: 10 },
  { id: 'dm_play_5', desc: 'Play 5 runs', type: 'play', target: 5, reward: 10 }
];

export const SYNERGIES = [
  { weapon1: 'napalm', weapon2: 'shieldBubble', result: 'burningBarrier' },
  { weapon1: 'napBeam', weapon2: 'novaPulse', result: 'laserNova' },
  { weapon1: 'vineWhip', weapon2: 'slothSwarm', result: 'thornySwarm' },
  { weapon1: 'napBeam', weapon2: 'slothSwarm', result: 'orbitalLasers' },
  { weapon1: 'vineWhip', weapon2: 'novaPulse', result: 'seismicWhip' },
  { weapon1: 'napalm', weapon2: 'vineWhip', result: 'flamingLash' },
  { weapon1: 'toxicCloud', weapon2: 'vineWhip', result: 'venomLash' }
];

export const TRAIL_COSMETICS = [
    { id: 'default', name: 'No Trail',     goldCost: 0,     tokenCost: 0,   icon: '⚪', desc: 'Clean and simple.' },
    { id: 'fire',    name: 'Fire Trail',   goldCost: 3000,  tokenCost: 30,  icon: '🔥', desc: 'A blazing inferno follows your every move.' },
    { id: 'ice',     name: 'Ice Trail',    goldCost: 3000,  tokenCost: 30,  icon: '❄️', desc: 'Leaves a crystalline frost in your wake.' },
    { id: 'toxic',   name: 'Toxic Trail',  goldCost: 3000,  tokenCost: 30,  icon: '🧪', desc: 'Neon green slime marks your path.' },
    { id: 'plasma',  name: 'Plasma Trail', goldCost: 10000, tokenCost: 100, icon: '⚡', desc: 'Crackling cyan and magenta energy.' },
    { id: 'void',    name: 'Void Trail',   goldCost: 10000, tokenCost: 100, icon: '🌌', desc: 'Dark energy that bends space itself.' },
    { id: 'shadow',  name: 'Shadow Trail', goldCost: 10000, tokenCost: 100, icon: '🌑', desc: 'A shroud of absolute darkness.' },
    { id: 'gold',    name: 'Golden Trail', goldCost: 20000, tokenCost: 200, icon: '✨', desc: 'Pure wealth made visible.' },
    { id: 'blood',   name: 'Blood Trail',  goldCost: 20000, tokenCost: 200, icon: '🩸', desc: 'Leave a visceral red path.' },
    { id: 'pixel',   name: 'Pixel Trail',  goldCost: 20000, tokenCost: 200, icon: '👾', desc: 'Retro 8-bit digital fragments.' },
    { id: 'nebula',  name: 'Nebula Dust',  goldCost: 30000, tokenCost: 300, icon: '☄️', desc: 'Sprinkle cosmic stardust.' },
    { id: 'rainbow', name: 'Rainbow Trail',goldCost: 30000, tokenCost: 300, icon: '🌈', desc: 'All colors at once. Maximum flex.' },
];

export const KILL_COSMETICS = [
    { id: 'none',      name: 'No Effect',     goldCost: 0,     tokenCost: 0,   icon: '⚫', desc: 'Enemies die quietly.' },
    { id: 'explosion', name: 'Explosion',     goldCost: 3000,  tokenCost: 30,  icon: '💥', desc: 'Every kill bursts into flames.' },
    { id: 'freeze',    name: 'Freeze Burst',  goldCost: 3000,  tokenCost: 30,  icon: '🧊', desc: 'Enemies shatter into icy shards.' },
    { id: 'vaporize',  name: 'Vaporize',      goldCost: 3000,  tokenCost: 30,  icon: '☠️', desc: 'Enemies dissolve in toxic mist.' },
    { id: 'pixel_burst',name: 'Pixel Burst',  goldCost: 12000, tokenCost: 120, icon: '👾', desc: 'Enemies break into retro pixels.' },
    { id: 'implode',   name: 'Implode',       goldCost: 12000, tokenCost: 120, icon: '🌀', desc: 'Enemies collapse into a void singularity.' },
    { id: 'blood_splatter', name: 'Blood Splatter', goldCost: 12000, tokenCost: 120, icon: '🩸', desc: 'Messy biological destruction.' },
    { id: 'black_hole',name: 'Black Hole',    goldCost: 25000, tokenCost: 250, icon: '🕳️', desc: 'Sucks enemies into oblivion.' },
    { id: 'golden',    name: 'Gold Shatter',  goldCost: 25000, tokenCost: 250, icon: '💰', desc: 'Enemies explode into golden coins.' },
];

export const SKIN_COSMETICS = [
    { charId: 'neobyte',     id: 'neobyte_neon_vanguard', name: 'Neon Vanguard', goldCost: -1, tokenCost: -1, color: '#00D4FF', icon: '⚡', desc: 'Seasonal Reward: Neon blue sci-fi armor.', isSeasonalReward: true },
    { charId: 'pandypaws',   id: 'pandypaws_golden_sov', name: 'Golden Sovereign', goldCost: -1, tokenCost: -1, color: '#FFD700', icon: '👑', desc: 'Seasonal Reward: Heavy golden mechanical armor.', isSeasonalReward: true },
    { charId: 'novabyte',    id: 'novabyte_galactic_enforcer', name: 'Galactic Enforcer', goldCost: -1, tokenCost: -1, color: '#FF00FF', icon: '🌌', desc: 'Seasonal Reward: Hot pink enforcer gear.', isSeasonalReward: true },
    { charId: 'glitch',      id: 'glitch_toxic_phantom', name: 'Toxic Phantom', goldCost: -1, tokenCost: -1, color: '#39FF14', icon: '☣️', desc: 'Seasonal Reward: Sleek stealthy toxic green armor.', isSeasonalReward: true },
    { charId: 'holodrift',   id: 'holodrift_quantum_drifter', name: 'Quantum Drifter', goldCost: -1, tokenCost: -1, color: '#00FA9A', icon: '🌀', desc: 'Seasonal Reward: Emerald quantum suit.', isSeasonalReward: true },
    { charId: 'codebreaker', id: 'codebreaker_cyber_ninja', name: 'Cyber Ninja', goldCost: -1, tokenCost: -1, color: '#00FFFF', icon: '🥷', desc: 'Seasonal Reward: Cyan cyber stealth suit.', isSeasonalReward: true },
    { charId: 'dataphantom', id: 'dataphantom_abyssal_wraith', name: 'Abyssal Wraith', goldCost: -1, tokenCost: -1, color: '#8A2BE2', icon: '👻', desc: 'Seasonal Reward: Deep violet ethereal armor.', isSeasonalReward: true },
    { charId: 'neonvortex',  id: 'neonvortex_supernova_elite', name: 'Supernova Elite', goldCost: -1, tokenCost: -1, color: '#FF4500', icon: '☄️', desc: 'Seasonal Reward: Blazing orange hazard suit.', isSeasonalReward: true },
    { charId: 'synthbeats',  id: 'synthbeats_astro_dj', name: 'Astro DJ', goldCost: -1, tokenCost: -1, color: '#FF1493', icon: '🎧', desc: 'Seasonal Reward: Deep pink rhythmic gear.', isSeasonalReward: true },
    { charId: 'skybyte',     id: 'skybyte_nebula_ace', name: 'Nebula Ace', goldCost: -1, tokenCost: -1, color: '#1E90FF', icon: '🦅', desc: 'Seasonal Reward: Dodger blue flight suit.', isSeasonalReward: true },
    { charId: 'neobyte',     id: 'neobyte_default',    name: 'Electric Core Blue', goldCost: 0,     tokenCost: 0,    color: '#0066FF', icon: '🔵', desc: 'Electric Core Blue.' },
    { charId: 'neobyte',     id: 'neobyte_crimson',    name: 'Crimson',       goldCost: 5000,  tokenCost: 50,  color: '#DC143C', icon: '🔴', desc: 'Blood-red battle variant.' },
    { charId: 'neobyte',     id: 'neobyte_gold',       name: 'Gold Edition',  goldCost: 20000, tokenCost: 200, color: '#FFD700', icon: '🟡', desc: 'Gleaming prestige skin.' },
    { charId: 'pandypaws',   id: 'pandypaws_default',  name: 'Heavy Rose Pink', goldCost: 0,     tokenCost: 0,    color: '#C2185B', icon: '🩷', desc: 'Heavy Rose Pink armor.' },
    { charId: 'pandypaws',   id: 'pandypaws_obsidian', name: 'Obsidian',      goldCost: 5000,  tokenCost: 50,  color: '#222222', icon: '⬛', desc: 'Dark armour plating.' },
    { charId: 'pandypaws',   id: 'pandypaws_ice',      name: 'Cryo',          goldCost: 20000, tokenCost: 200, color: '#00CFFF', icon: '🩵', desc: 'Frozen tundra variant.' },
    { charId: 'novabyte',    id: 'novabyte_default',   name: 'Volatile Hot Pink', goldCost: 0,     tokenCost: 0,    color: '#FF007F', icon: '🟠', desc: 'Volatile Hot Pink.' },
    { charId: 'novabyte',    id: 'novabyte_void',      name: 'Void',          goldCost: 5000,  tokenCost: 50,  color: '#8A2BE2', icon: '🟣', desc: 'Corrupted by the void.' },
    { charId: 'novabyte',    id: 'novabyte_neon',      name: 'Neon',          goldCost: 20000, tokenCost: 200, color: '#39FF14', icon: '🟢', desc: 'Toxic neon glow.' },
    { charId: 'glitch',      id: 'glitch_default',     name: 'Neon Pink',     goldCost: 0,     tokenCost: 0,    color: '#FF00FF', icon: '🟣', desc: 'Neon Pink glitch form.' },
    { charId: 'glitch',      id: 'glitch_red',         name: 'Fatal Error',   goldCost: 5000,  tokenCost: 50,  color: '#FF0000', icon: '🔴', desc: 'Corrupted red state.' },
    { charId: 'glitch',      id: 'glitch_white',       name: 'Whitespace',    goldCost: 20000, tokenCost: 200, color: '#FFFFFF', icon: '⬜', desc: 'Pure emptiness.' },
    { charId: 'holodrift',   id: 'holodrift_default',  name: 'Holographic Green', goldCost: 0,     tokenCost: 0,    color: '#00FA9A', icon: '🩵', desc: 'Holographic Green form.' },
    { charId: 'holodrift',   id: 'holodrift_amber',    name: 'Amber',         goldCost: 5000,  tokenCost: 50,  color: '#FFA500', icon: '🟠', desc: 'Warm amber frequency.' },
    { charId: 'codebreaker', id: 'codebreaker_default',name: 'Neon Green',    goldCost: 0,     tokenCost: 0,    color: '#39FF14', icon: '🟢', desc: 'Neon Green hacker tech.' },
    { charId: 'codebreaker', id: 'codebreaker_pink',   name: 'Rootkit',       goldCost: 5000,  tokenCost: 50,  color: '#FF1493', icon: '🩷', desc: 'Stealth-mode pink.' },
    { charId: 'dataphantom', id: 'dataphantom_default',name: 'Ghost Green',   goldCost: 0,     tokenCost: 0,    color: '#98FF98', icon: '🔵', desc: 'Ghost Green presence.' },
    { charId: 'dataphantom', id: 'dataphantom_ghost',  name: 'Ghost',         goldCost: 5000,  tokenCost: 50,  color: '#C0C0C0', icon: '🩶', desc: 'Ethereal silver form.' },
    { charId: 'neonvortex',  id: 'neonvortex_default', name: 'Ultraviolet',   goldCost: 0,     tokenCost: 0,    color: '#7A00FF', icon: '🟡', desc: 'Ultraviolet energy.' },
    { charId: 'neonvortex',  id: 'neonvortex_plasma',  name: 'Plasma',        goldCost: 5000,  tokenCost: 50,  color: '#00E5FF', icon: '🩵', desc: 'Crackling plasma skin.' },
    { charId: 'synthbeats',  id: 'synthbeats_default', name: 'Rhythm Gold',   goldCost: 0,     tokenCost: 0,    color: '#FFD700', icon: '🟠', desc: 'Rhythm Gold aura.' },
    { charId: 'synthbeats',  id: 'synthbeats_violet',  name: 'Violet Drop',   goldCost: 5000,  tokenCost: 50,  color: '#9400D3', icon: '🟣', desc: 'Deep bass violet.' },
    { charId: 'skybyte',     id: 'skybyte_default',    name: 'Aerial Plasma Blue', goldCost: 0,     tokenCost: 0,    color: '#00D4FF', icon: '🩵', desc: 'Aerial Plasma Blue.' },
    { charId: 'skybyte',     id: 'skybyte_solar',      name: 'Solar Ace',     goldCost: 5000,  tokenCost: 50,  color: '#FF6600', icon: '🔶', desc: 'Blazing sunset variant.' },
];

export const EVOLUTIONS = [
    { baseWeapon: 'napBeam', passive: 'area_up', evolvedWeapon: 'supernovaBeam', name: 'Supernova Beam', desc: 'EVOLVED: Massive piercing beam that explodes on impact.' },
    { baseWeapon: 'vineWhip', passive: 'regen_up', evolvedWeapon: 'vampiricLash', name: 'Vampiric Lash', desc: 'EVOLVED: Heals 1% of damage dealt (up to 5% Max HP per swing) and covers screen.' },
    { baseWeapon: 'slothSwarm', passive: 'spd_up', evolvedWeapon: 'orbitalDefense', name: 'Orbital Defense Network', desc: 'EVOLVED: Indestructible drones that rapidly shoot lasers.' },
    { baseWeapon: 'napalm', passive: 'dmg_up', evolvedWeapon: 'hellfire', name: 'Hellfire', desc: 'EVOLVED: Blue flames that persist and melt everything.' },
    { baseWeapon: 'novaPulse', passive: 'cd_down', evolvedWeapon: 'quantumCollapse', name: 'Quantum Collapse', desc: 'EVOLVED: Triple-pulse dark energy burst (each pulse hits harder than the last).' },
    { baseWeapon: 'shieldBubble', passive: 'hp_up', evolvedWeapon: 'aegisMatrix', name: 'Aegis Matrix', desc: 'EVOLVED: Massive repulsion and retaliates with missiles.' },
    { baseWeapon: 'bouncingBlade', passive: 'proj_spd', evolvedWeapon: 'buzzsawSwarm', name: 'Buzzsaw Swarm', desc: 'EVOLVED: Multiple massive blades that ricochet wildly.' }
];

export const UPGRADES = [
  { id: 'dmg_up', name: 'Plasma Core', desc: '+10% Damage', type: 'passive', stat: 'damageMult', value: 0.1 },
  { id: 'spd_up', name: 'Hyperdrive Fuel', desc: '+10% Move Speed', type: 'passive', stat: 'speedMult', value: 0.1 },
  { id: 'hp_up', name: 'Exosuit Plating', desc: '+20 Max HP', type: 'passive', stat: 'maxHp', value: 20 },
  { id: 'area_up', name: 'Spatial Expander', desc: '+10% Area of Effect', type: 'passive', stat: 'areaMult', value: 0.1 },
  { id: 'cd_down', name: 'Quantum Accelerator', desc: '-5% Cooldowns', type: 'passive', stat: 'cooldownMult', value: -0.05 },
  { id: 'magnet_up', name: 'Tractor Beam', desc: '+25% Pickup Range', type: 'passive', stat: 'magnetRange', value: 25 },
  { id: 'regen_up', name: 'Nano-Repair Bots', desc: '+0.5 HP/sec', type: 'passive', stat: 'regen', value: 0.5 },
  { id: 'armor_up', name: 'Deflector Shield', desc: '+2 Armor', type: 'passive', stat: 'armor', value: 2 },
  { id: 'gold_up', name: 'Asteroid Miner', desc: '+20% Gold Drops', type: 'passive', stat: 'goldMult', value: 0.2 },
  { id: 'proj_spd', name: 'Ion Thrusters', desc: '+15% Projectile Speed (also adds bonus damage)', type: 'passive', stat: 'projSpeedMult', value: 0.15 },
  { id: 'xp_up', name: 'Neural Implant', desc: '+15% XP Gain', type: 'passive', stat: 'xpMult', value: 0.15 },
  { id: 'w_napBeam', name: 'Cosmic Nap Beam', desc: 'Fires a piercing beam.', type: 'weapon', weaponId: 'napBeam' },
  { id: 'w_vineWhip', name: 'Plasma Whip', desc: 'Swipes nearby enemies.', type: 'weapon', weaponId: 'vineWhip' },
  { id: 'w_slothSwarm', name: 'Orbital Drones', desc: 'Orbiting defense drones.', type: 'weapon', weaponId: 'slothSwarm' },
  { id: 'w_napalm', name: 'Zero-G Napalm', desc: 'Leaves burning pools.', type: 'weapon', weaponId: 'napalm' },
  { id: 'w_novaPulse', name: 'Nova Pulse', desc: 'A massive expanding energy blast.', type: 'weapon', weaponId: 'novaPulse' },
  { id: 'w_shieldBubble', name: 'Shield Bubble', desc: 'Pushes enemies away and damages them.', type: 'weapon', weaponId: 'shieldBubble' },
  { id: 'w_neoBlaster', name: 'Blaster', desc: 'Fires reliable energy blasts.', type: 'weapon', weaponId: 'neoBlaster' },
  { id: 'w_bouncingBlade', name: 'Ricochet Blade', desc: 'Fires a bouncing sawblade.', type: 'weapon', weaponId: 'bouncingBlade' },
  { id: 'w_toxicCloud', name: 'Toxic Emitter', desc: 'Leaves a lingering poison cloud.', type: 'weapon', weaponId: 'toxicCloud' },
];

const loadSprite = (filename) => {
    if (typeof window !== 'undefined') {
        const img = new Image();
        img.src = `/assets/69c5d61e39690bf20f763b4c/${filename}`;
        return img;
    }
    return null;
};

// Outer Galaxy sprite loader — new storage bucket (69de258...) for T11-T14 mobs and
// the Pulsar Guardian boss. Existing Inner Galaxy sprites stay in the original bucket
// via loadSprite() above. Same Image() preload pattern — only the path differs.
const loadSpriteOG = (filename) => {
    if (typeof window !== 'undefined') {
        const img = new Image();
        img.src = `/assets/69de258a7e072380b89d66e3/${filename}`;
        return img;
    }
    return null;
};

export const ENEMIES = [
  // Tier 1
  { id: 't1_void_glow', name: 'Void Glow Orb', hp: 10, speed: 2.2, damage: 6, color: '#a855f7', radius: 27, xp: 1, tier: 1, spriteImage: loadSprite('ffb4f7068_void_glow_orb_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't1_nebula_jelly', name: 'Nebula Jelly', hp: 8, speed: 2.0, damage: 5, color: '#06b6d4', radius: 27, xp: 1, tier: 1, spriteImage: loadSprite('eb5805fe1_nebula_jelly_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't1_probe', name: 'Mini Probe Drone', hp: 12, speed: 2.5, damage: 8, color: '#84cc16', radius: 23, xp: 1, tier: 1, spriteImage: loadSprite('45cfb9820_mini_probe_drone_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't1_floater', name: 'Crystal Floater', hp: 14, speed: 1.8, damage: 7, color: '#ec4899', radius: 32, xp: 1, tier: 1, spriteImage: loadSprite('a70ff7ac4_crystal_floater_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 2
  { id: 't2_serpent', name: 'Plasma Serpent', hp: 18, speed: 2.4, damage: 12, color: '#f97316', radius: 32, xp: 2, tier: 2, isRanged: true, spriteImage: loadSprite('7baf81106_plasma_serpent_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't2_eye_tentacle', name: 'Eye Tentacle', hp: 22, speed: 1.5, damage: 15, color: '#d946ef', radius: 36, xp: 2, tier: 2, spriteImage: loadSprite('e1e15823a_eye_tentacle_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't2_spore_wasp', name: 'Spore Wasp', hp: 15, speed: 2.6, damage: 10, color: '#84cc16', radius: 27, xp: 2, tier: 2, spriteImage: loadSprite('3b545ef7a_spore_wasp_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't2_rock', name: 'Rock Fragment', hp: 35, speed: 0.8, damage: 14, color: '#f97316', radius: 41, xp: 2, tier: 2, isTank: true, spriteImage: loadSprite('0452ce6df_rock_fragment_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 3
  { id: 't3_manta', name: 'Void Manta', hp: 30, speed: 2.0, damage: 16, color: '#8b5cf6', radius: 41, xp: 3, tier: 3, spriteImage: loadSprite('9842135cf_void_mantra_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't3_energy_phantom', name: 'Energy Phantom', hp: 28, speed: 1.8, damage: 15, color: '#0ea5e9', radius: 36, xp: 3, tier: 3, spriteImage: loadSprite('74d31fdc0_energy_phantom_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't3_starfish', name: 'Stellar Starfish', hp: 35, speed: 1.2, damage: 18, color: '#eab308', radius: 36, xp: 3, tier: 3, spriteImage: loadSprite('bdcbfb6bd_stellar_starfish_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't3_angler', name: 'Angler Lantern', hp: 32, speed: 1.5, damage: 17, color: '#3b82f6', radius: 41, xp: 3, tier: 3, isRanged: true, spriteImage: loadSprite('b00d8e25b_angler_lantern_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 4
  { id: 't4_spinner', name: 'Quantum Spinner', hp: 45, speed: 2.2, damage: 20, color: '#06b6d4', radius: 41, xp: 4, tier: 4, spriteImage: loadSprite('a2df90068_quantum_spinner_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't4_ribbon', name: 'Ribbon Phantom', hp: 40, speed: 1.9, damage: 22, color: '#d946ef', radius: 36, xp: 4, tier: 4, spriteImage: loadSprite('06dc947b3_ribbon_phantom_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't4_vortex', name: 'Vortex Drifter', hp: 55, speed: 1.4, damage: 25, color: '#ec4899', radius: 45, xp: 4, tier: 4, spriteImage: loadSprite('28251fe02_vortex_drifter_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't4_mothra', name: 'Neon Mothra', hp: 38, speed: 2.4, damage: 18, color: '#14b8a6', radius: 36, xp: 4, tier: 4, isRanged: true, spriteImage: loadSprite('23d933892_neon_mothra_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 5
  { id: 't5_spike_virus', name: 'Spike Virus', hp: 65, speed: 1.8, damage: 28, color: '#a855f7', radius: 45, xp: 5, tier: 5, spriteImage: loadSprite('9b4da0034_spike_virus_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't5_coral', name: 'Coral Bloom', hp: 80, speed: 1.2, damage: 25, color: '#f43f5e', radius: 50, xp: 5, tier: 5, spriteImage: loadSprite('c045ec43a_coral_bloom_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't5_blade', name: 'Blade Arrowhead', hp: 60, speed: 2.5, damage: 30, color: '#94a3b8', radius: 41, xp: 5, tier: 5, isRanged: true, spriteImage: loadSprite('e573c6ccc_blade_arrowhead_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 6
  { id: 't6_chain_eye', name: 'Chain Eye', hp: 100, speed: 1.6, damage: 35, color: '#d946ef', radius: 54, xp: 6, tier: 6, isRanged: true, spriteImage: loadSprite('65ffb3fae_chain_eye_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't6_frost_wyrm', name: 'Frost Wyrm', hp: 120, speed: 1.8, damage: 38, color: '#38bdf8', radius: 59, xp: 6, tier: 6, spriteImage: loadSprite('ab422464d_frost_wyrm_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't6_flame_wyrm', name: 'Flame Wyrmling', hp: 90, speed: 2.2, damage: 42, color: '#ef4444', radius: 50, xp: 6, tier: 6, spriteImage: loadSprite('906ceba81_flame_wyrmling_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 7
  { id: 't7_frost_specter', name: 'Frost Specter', hp: 150, speed: 1.7, damage: 48, color: '#0ea5e9', radius: 59, xp: 7, tier: 7, spriteImage: loadSprite('f6ad447be_frost_specter_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't7_thunder', name: 'Thunder Sphere', hp: 140, speed: 2.1, damage: 52, color: '#eab308', radius: 54, xp: 7, tier: 7, isRanged: true, spriteImage: loadSprite('5cbd6ac67_thunder_sphere_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't7_gear_swarm', name: 'Nano Gear Swarm', hp: 160, speed: 1.4, damage: 45, color: '#94a3b8', radius: 63, xp: 7, tier: 7, spriteImage: loadSprite('0987d4652_nano_gear_swarm_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 8
  { id: 't8_whisper', name: 'Whispering Void', hp: 200, speed: 1.5, damage: 60, color: '#7e22ce', radius: 68, xp: 8, tier: 8, spriteImage: loadSprite('0438a0ffd_whispering_void_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't8_bio_bloom', name: 'Bio Bloom Pod', hp: 240, speed: 1.0, damage: 55, color: '#22c55e', radius: 72, xp: 8, tier: 8, spriteImage: loadSprite('578d7e2aa_bio_bloom_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't8_ray_fish', name: 'Cosmic Ray Fish', hp: 180, speed: 2.3, damage: 65, color: '#38bdf8', radius: 63, xp: 8, tier: 8, spriteImage: loadSprite('bcd99f449_cosmic_ray_fish_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 9
  { id: 't9_lava_blob', name: 'Lava Rock Blob', hp: 300, speed: 1.2, damage: 85, color: '#ef4444', radius: 77, xp: 9, tier: 9, isTank: true, spriteImage: loadSprite('f01e56245_lava_rock_blob_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't9_jelly_swarm', name: 'Plasma Jelly Swarm', hp: 260, speed: 1.9, damage: 80, color: '#06b6d4', radius: 68, xp: 9, tier: 9, spriteImage: loadSprite('70f1f9342_plasma_jelly_swarm_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 10
  { id: 't10_shadow', name: 'Shadow Stalker', hp: 420, speed: 2.2, damage: 120, color: '#1e293b', radius: 81, xp: 10, tier: 10, spriteImage: loadSprite('9199eef7e_shadow_stalker_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't10_crystal_vortex', name: 'Crystal Vortex', hp: 480, speed: 1.6, damage: 130, color: '#d946ef', radius: 86, xp: 10, tier: 10, isRanged: true, spriteImage: loadSprite('703e0a56e_crystal_vortex_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // ===== OUTER GALAXY (S11-S20) — T11-T14 endgame mobs, added 2026-06-04 =====
  // Sprites in the 69de258a7e072380b89d66e3 bucket via loadSpriteOG. All use the same
  // 4×4 / 16-frame format as existing mobs. Stats scale roughly from the T10 baseline
  // (T10: HP 420-480 / dmg 120-130) up through T14 mythic apex tier.

  // Tier 11 — Outer Galaxy swarm + fast + tank mix
  { id: 't11_asteroid_crab', name: 'Asteroid Crab', hp: 700, speed: 1.0, damage: 150, color: '#3b82f6', radius: 90, xp: 11, tier: 11, isTank: true, spriteImage: loadSpriteOG('d058a4791_Asteroid_Crab_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_cosmic_jellyfish', name: 'Cosmic Jellyfish', hp: 600, speed: 1.6, damage: 140, color: '#06b6d4', radius: 95, xp: 11, tier: 11, spriteImage: loadSpriteOG('93adad41e_Cosmic_Jellyfish_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_galaxy_mantis', name: 'Galaxy Mantis', hp: 550, speed: 1.9, damage: 160, color: '#14b8a6', radius: 82, xp: 11, tier: 11, isRanged: true, spriteImage: loadSpriteOG('a0c3ffe18_Galaxy_Mantis_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_spectral_mothlet', name: 'Spectral Mothlet', hp: 500, speed: 2.2, damage: 135, color: '#f0abfc', radius: 72, xp: 11, tier: 11, spriteImage: loadSpriteOG('da4b6bf5a_neon_mothra_sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_star_scarab', name: 'Star Scarab Beetle', hp: 600, speed: 1.7, damage: 145, color: '#0ea5e9', radius: 85, xp: 11, tier: 11, spriteImage: loadSpriteOG('150bb4721_Star_Scarab_Beetle_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_void_bat', name: 'Void Bat', hp: 500, speed: 2.1, damage: 140, color: '#7e22ce', radius: 75, xp: 11, tier: 11, spriteImage: loadSpriteOG('d6da65840_Void_Bat_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_void_eel', name: 'Void Eel', hp: 550, speed: 2.5, damage: 155, color: '#0d9488', radius: 80, xp: 11, tier: 11, spriteImage: loadSpriteOG('b9f304545_Void_Eel_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't11_shadow_mantling', name: 'Shadow Mantling', hp: 580, speed: 2.4, damage: 150, color: '#1e1b4b', radius: 78, xp: 11, tier: 11, spriteImage: loadSpriteOG('ec5f8466f_void_mantra_sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 12 — Outer Galaxy elites + heavy ranged
  { id: 't12_nebula_octopus', name: 'Nebula Octopus', hp: 1100, speed: 1.4, damage: 195, color: '#a855f7', radius: 100, xp: 12, tier: 12, spriteImage: loadSpriteOG('78215c244_Nebula_Octopus_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't12_nebula_scorpion', name: 'Nebula Scorpion', hp: 1000, speed: 1.6, damage: 205, color: '#c026d3', radius: 95, xp: 12, tier: 12, isRanged: true, spriteImage: loadSpriteOG('9a42c9c27_Nebula_Scorpion_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't12_aurora_moth', name: 'Aurora Moth', hp: 850, speed: 2.0, damage: 175, color: '#34d399', radius: 85, xp: 12, tier: 12, spriteImage: loadSpriteOG('f3a323dae_Aurora_Moth_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't12_galaxy_wasp', name: 'Galaxy Wasp', hp: 900, speed: 2.1, damage: 190, color: '#9333ea', radius: 80, xp: 12, tier: 12, isRanged: true, spriteImage: loadSpriteOG('1779a4a15_Galaxy_Wasp_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 13 — Outer Galaxy mythic-tier elites
  { id: 't13_aurora_serpent', name: 'Aurora Serpent', hp: 1600, speed: 1.8, damage: 250, color: '#22d3ee', radius: 105, xp: 13, tier: 13, spriteImage: loadSpriteOG('a982ba85c_Aurora_Serpent_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't13_comet_ray', name: 'Comet Ray', hp: 1400, speed: 2.0, damage: 270, color: '#f97316', radius: 100, xp: 13, tier: 13, isRanged: true, spriteImage: loadSpriteOG('c9ca34e78_Comit_Ray_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't13_nebula_serpent', name: 'Nebula Serpent', hp: 1700, speed: 1.7, damage: 245, color: '#d946ef', radius: 110, xp: 13, tier: 13, spriteImage: loadSpriteOG('2f0782efb_Nebula_Serpent_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't13_plasma_raptor', name: 'Plasma Raptor', hp: 1450, speed: 2.5, damage: 265, color: '#fb923c', radius: 100, xp: 13, tier: 13, spriteImage: loadSpriteOG('7a54d1f3f_Plasma_Raptor_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't13_void_shark', name: 'Void Shark', hp: 1500, speed: 2.4, damage: 275, color: '#581c87', radius: 105, xp: 13, tier: 13, spriteImage: loadSpriteOG('33a8cf065_Void_Shark_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Tier 14 — Outer Galaxy apex mythics (intended to spawn only in S16-S20)
  { id: 't14_cosmic_manta_ray', name: 'Cosmic Manta Ray', hp: 2500, speed: 1.9, damage: 310, color: '#1e3a8a', radius: 120, xp: 14, tier: 14, spriteImage: loadSpriteOG('aa4cd6eb7_Cosmic_Manta_Ray_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't14_nebula_panther', name: 'Nebula Panther', hp: 2400, speed: 2.3, damage: 330, color: '#7c2d12', radius: 115, xp: 14, tier: 14, spriteImage: loadSpriteOG('37f8125b9_Nebula_Panther_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },
  { id: 't14_plasma_wyrm', name: 'Plasma Wyrm', hp: 2800, speed: 1.8, damage: 320, color: '#dc2626', radius: 125, xp: 14, tier: 14, spriteImage: loadSpriteOG('68e0a16db_Plasma_Wyrm_Sheet.png'), frameCount: 16, animationSpeed: 0.15 },

  // Bosses (spawn anywhere at the end)
  { id: 'boss_nebula_devourer', name: 'Nebula Devourer', hp: 7000, speed: 0.8, damage: 60, color: '#8b5cf6', radius: 124, xp: 800, isBoss: true, spriteImage: loadSprite('34fdca1a0_nebula_devourer_sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'back', weakDesc: 'Attack from behind' },
  { id: 'boss_plasma_kraken', name: 'Plasma Kraken', hp: 6000, speed: 0.6, damage: 70, color: '#ef4444', radius: 113, xp: 700, isBoss: true, spriteImage: loadSprite('7464748bb_plasma_kraken_sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'side', weakDesc: 'Attack from the sides' },
  { id: 'boss_stellar_colossus', name: 'Stellar Colossus', hp: 9000, speed: 1.0, damage: 55, color: '#f59e0b', radius: 135, xp: 900, isBoss: true, spriteImage: loadSprite('d39368909_stellar_colossus_sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'back', weakDesc: 'Attack from behind' },
  { id: 'boss_cosmic_wyrm', name: 'Cosmic Wyrm Lord', hp: 11000, speed: 0.9, damage: 80, color: '#0ea5e9', radius: 146, xp: 1000, isBoss: true, spriteImage: loadSprite('88e8a0d84_cosmic_wyrm_lord_sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'side', weakDesc: 'Attack from the sides' },
  { id: 'boss_supernova_empress', name: 'Supernova Empress', hp: 14000, speed: 1.2, damage: 90, color: '#ec4899', radius: 110, xp: 1200, isBoss: true, spriteImage: loadSprite('4d3a1f090_supernova_empress_sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'back', weakDesc: 'Attack from behind' },
  { id: 'boss_nexus_annihilator', name: 'Nexus Annihilator', hp: 18000, speed: 0.5, damage: 120, color: '#1e293b', radius: 160, xp: 1500, isBoss: true, spriteImage: loadSprite('29ea7426c_nexus_annihilator_sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'side', weakDesc: 'Attack from the sides' },
  // Outer Galaxy boss — joins the shared boss rotation pool. Anchors S20 (The Devourer)
  // as the guaranteed mythic finale; eligible on S12/S14/S16/S18 alongside the other 6.
  // Same 5×5 / 25-frame sheet format as existing bosses.
  { id: 'boss_pulsar_guardian', name: 'Pulsar Guardian', hp: 22000, speed: 0.7, damage: 110, color: '#fbbf24', radius: 150, xp: 1700, isBoss: true, spriteImage: loadSpriteOG('83baa9440_Pulsar_Guardian_Sheet.png'), frameCount: 25, animationSpeed: 0.12, weakSide: 'back', weakDesc: 'Attack from behind' }
];

// Talent trees redesigned around two themed paths per character.
// Path A and Path B are intentionally different playstyles tied to that
// character's lore/role — picking one should feel like a meaningful identity choice.
// IDs MUST stay exactly as before — server (functions/spendGold.js) validates by these.
export const CHARACTER_TALENTS = {
  // NeoByte — Fleet Commander. A: aggressive offence | B: resilient frontline.
  neobyte: [
    { id: 'neo_1', name: 'Tactical Doctrine', desc: '+10% Area (banner reach)', stat: 'areaMult', value: 0.1, tier: 1 },
    { id: 'neo_2a', name: 'Offensive Maneuvers', desc: 'Path A — +15% Damage', stat: 'damageMult', value: 0.15, tier: 2, requires: 'neo_1', excludes: 'neo_2b' },
    { id: 'neo_2b', name: 'Defensive Formation', desc: 'Path B — +40 Max HP', stat: 'maxHp', value: 40, tier: 2, requires: 'neo_1', excludes: 'neo_2a' },
    { id: 'neo_3a', name: 'Orbital Bombardment', desc: '-12% Cooldown — fire orders rain down', stat: 'cooldownMult', value: -0.12, tier: 3, requires: 'neo_2a' },
    { id: 'neo_3b', name: 'Aegis Bulwark', desc: '+5 Armor — hold the line', stat: 'armor', value: 5, tier: 3, requires: 'neo_2b' }
  ],

  // Pandypaws — Heavy Mechanic. A: juggernaut crusher | B: immortal bulwark.
  pandypaws: [
    { id: 'pan_1', name: 'Titanium Alloy', desc: '+3 Armor — base hull plating', stat: 'armor', value: 3, tier: 1 },
    { id: 'pan_2a', name: 'Hydraulic Hammers', desc: 'Path A — +20% Area (crushing strikes)', stat: 'areaMult', value: 0.2, tier: 2, requires: 'pan_1', excludes: 'pan_2b' },
    { id: 'pan_2b', name: 'Nanite Forge', desc: 'Path B — +0.6 HP Regen/sec', stat: 'regen', value: 0.6, tier: 2, requires: 'pan_1', excludes: 'pan_2a' },
    { id: 'pan_3a', name: 'Demolition Master', desc: '+25% Damage — every swing devastates', stat: 'damageMult', value: 0.25, tier: 3, requires: 'pan_2a' },
    { id: 'pan_3b', name: 'Dreadnought Chassis', desc: '+60 Max HP — unkillable wall', stat: 'maxHp', value: 60, tier: 3, requires: 'pan_2b' }
  ],

  // NovaByte — Comms & Demolitions. A: glass-cannon nuker | B: rapid-fire sapper.
  novabyte: [
    { id: 'nova_1', name: 'Volatile Payload', desc: '+10% Damage — every shot hits harder', stat: 'damageMult', value: 0.1, tier: 1 },
    { id: 'nova_2a', name: 'Antimatter Warheads', desc: 'Path A — +25% Area (bigger blasts)', stat: 'areaMult', value: 0.25, tier: 2, requires: 'nova_1', excludes: 'nova_2b' },
    { id: 'nova_2b', name: 'Quick-Fuse Rigging', desc: 'Path B — -12% Cooldown (faster detonations)', stat: 'cooldownMult', value: -0.12, tier: 2, requires: 'nova_1', excludes: 'nova_2a' },
    { id: 'nova_3a', name: 'Supernova Core', desc: '+25% Damage — total annihilation', stat: 'damageMult', value: 0.25, tier: 3, requires: 'nova_2a' },
    { id: 'nova_3b', name: 'Chain Reaction', desc: '+20% Projectile Speed — bombs reach further', stat: 'projSpeedMult', value: 0.2, tier: 3, requires: 'nova_2b' }
  ],

  // Glitch — Stealth Assassin. A: lethal one-shot crit build | B: untouchable evasion.
  glitch: [
    { id: 'gli_1', name: 'Neural Overclock', desc: '+10% Speed — strike from anywhere', stat: 'speedMult', value: 0.1, tier: 1 },
    { id: 'gli_2a', name: 'Critical Exploit', desc: 'Path A — +5% Crit chance', stat: 'critBonus', value: 0.05, tier: 2, requires: 'gli_1', excludes: 'gli_2b' },
    { id: 'gli_2b', name: 'Phantom Footwork', desc: 'Path B — +15% Speed (slippery)', stat: 'speedMult', value: 0.15, tier: 2, requires: 'gli_1', excludes: 'gli_2a' },
    { id: 'gli_3a', name: 'Fatal Error', desc: '+30% Damage — assassin headshot', stat: 'damageMult', value: 0.3, tier: 3, requires: 'gli_2a' },
    { id: 'gli_3b', name: 'Lucky Glitch', desc: '+3 Luck — improbability incarnate', stat: 'luck', value: 3, tier: 3, requires: 'gli_2b' }
  ],

  // HoloDrift — Engineer. A: greedy XP/loot scavenger | B: defensive decoy warden.
  holodrift: [
    { id: 'holo_1', name: 'Salvage Protocol', desc: '+10% XP — learn from every wreck', stat: 'xpMult', value: 0.1, tier: 1 },
    { id: 'holo_2a', name: 'Magnetic Sweep', desc: 'Path A — +40 Magnet Range', stat: 'magnetRange', value: 40, tier: 2, requires: 'holo_1', excludes: 'holo_2b' },
    { id: 'holo_2b', name: 'Hardlight Plating', desc: 'Path B — +3 Armor (decoys reinforce hull)', stat: 'armor', value: 3, tier: 2, requires: 'holo_1', excludes: 'holo_2a' },
    { id: 'holo_3a', name: 'Greed Subroutine', desc: '+30% Gold — every kill is profit', stat: 'goldMult', value: 0.3, tier: 3, requires: 'holo_2a' },
    { id: 'holo_3b', name: 'Mirror Field', desc: '+0.5 HP Regen — sustain through chaos', stat: 'regen', value: 0.5, tier: 3, requires: 'holo_2b' }
  ],

  // CodeBreaker — Cyber Hacker. A: rapid-fire overclocker | B: fortune crypto miner.
  codebreaker: [
    { id: 'code_1', name: 'Subroutine Bypass', desc: '-5% Cooldown — read enemy code', stat: 'cooldownMult', value: -0.05, tier: 1 },
    { id: 'code_2a', name: 'Overclocked CPU', desc: 'Path A — -12% Cooldown (rapid hacks)', stat: 'cooldownMult', value: -0.12, tier: 2, requires: 'code_1', excludes: 'code_2b' },
    { id: 'code_2b', name: 'Crypto Mining Rig', desc: 'Path B — +20% Gold (passive farming)', stat: 'goldMult', value: 0.2, tier: 2, requires: 'code_1', excludes: 'code_2a' },
    { id: 'code_3a', name: 'Infinite Loop', desc: '+20% Projectile Speed — perpetual motion', stat: 'projSpeedMult', value: 0.2, tier: 3, requires: 'code_2a' },
    { id: 'code_3b', name: 'Omniscience Protocol', desc: '+3 Luck — see all probabilities', stat: 'luck', value: 3, tier: 3, requires: 'code_2b' }
  ],

  // DataPhantom — Strategic Hacker. A: long-range marksman | B: phasing wraith.
  dataphantom: [
    { id: 'data_1', name: 'Phase Calibration', desc: '+15% Projectile Speed — bullets phase through space', stat: 'projSpeedMult', value: 0.15, tier: 1 },
    { id: 'data_2a', name: 'Spectral Optics', desc: 'Path A — +20% Damage (target locks)', stat: 'damageMult', value: 0.2, tier: 2, requires: 'data_1', excludes: 'data_2b' },
    { id: 'data_2b', name: 'Wraith Shielding', desc: 'Path B — +3 Armor (ethereal carapace)', stat: 'armor', value: 3, tier: 2, requires: 'data_1', excludes: 'data_2a' },
    { id: 'data_3a', name: 'Particle Accelerator', desc: '+25% Projectile Speed — instant travel', stat: 'projSpeedMult', value: 0.25, tier: 3, requires: 'data_2a' },
    { id: 'data_3b', name: 'Ghost Protocol', desc: '+50 Max HP — phase out of death', stat: 'maxHp', value: 50, tier: 3, requires: 'data_2b' }
  ],

  // NeonVortex — Elite Sniper. A: pure damage executioner | B: gravity-bender control.
  neonvortex: [
    { id: 'neon_1', name: 'Targeting Optics', desc: '+10% Projectile Speed — perfect aim', stat: 'projSpeedMult', value: 0.1, tier: 1 },
    { id: 'neon_2a', name: 'Hollow-Point Rounds', desc: 'Path A — +20% Damage', stat: 'damageMult', value: 0.2, tier: 2, requires: 'neon_1', excludes: 'neon_2b' },
    { id: 'neon_2b', name: 'Gravity Lens', desc: 'Path B — +25% Area (bend space)', stat: 'areaMult', value: 0.25, tier: 2, requires: 'neon_1', excludes: 'neon_2a' },
    { id: 'neon_3a', name: 'Singularity Shot', desc: '+30% Damage — execution perfected', stat: 'damageMult', value: 0.3, tier: 3, requires: 'neon_2a' },
    { id: 'neon_3b', name: 'Event Horizon', desc: '+60 Magnet — pull everything in', stat: 'magnetRange', value: 60, tier: 3, requires: 'neon_2b' }
  ],

  // SynthBeats — Diplomat. A: greedy tycoon | B: rhythm maestro.
  synthbeats: [
    { id: 'syn_1', name: 'Charm Frequency', desc: '+10% Gold — golden tongue', stat: 'goldMult', value: 0.1, tier: 1 },
    { id: 'syn_2a', name: 'Black Market Deals', desc: 'Path A — +20% Gold (exploit every trade)', stat: 'goldMult', value: 0.2, tier: 2, requires: 'syn_1', excludes: 'syn_2b' },
    { id: 'syn_2b', name: 'Tempo Shift', desc: 'Path B — -12% Cooldown (rhythm beats)', stat: 'cooldownMult', value: -0.12, tier: 2, requires: 'syn_1', excludes: 'syn_2a' },
    { id: 'syn_3a', name: 'Billionaire Club', desc: '+2 Luck — fortune favours the rich', stat: 'luck', value: 2, tier: 3, requires: 'syn_2a' },
    { id: 'syn_3b', name: 'Bass Drop', desc: '+30% Area — soundwaves shatter all', stat: 'areaMult', value: 0.3, tier: 3, requires: 'syn_2b' }
  ],

  // SkyByte — Ace Pilot. A: bombing-run carpet bomber | B: agile dogfighter.
  skybyte: [
    { id: 'sky_1', name: 'Slipstream Thrusters', desc: '+10% Speed — outrun anything', stat: 'speedMult', value: 0.1, tier: 1 },
    { id: 'sky_2a', name: 'Carpet Bomber', desc: 'Path A — +25% Area (saturation strikes)', stat: 'areaMult', value: 0.25, tier: 2, requires: 'sky_1', excludes: 'sky_2b' },
    { id: 'sky_2b', name: 'Evasive Pilot', desc: 'Path B — +15% Speed (impossible to hit)', stat: 'speedMult', value: 0.15, tier: 2, requires: 'sky_1', excludes: 'sky_2a' },
    { id: 'sky_3a', name: 'Strike Squadron', desc: '+25% Damage — bombs of judgement', stat: 'damageMult', value: 0.25, tier: 3, requires: 'sky_2a' },
    { id: 'sky_3b', name: 'Barrel Roll', desc: '+3 Armor — graceful under fire', stat: 'armor', value: 3, tier: 3, requires: 'sky_2b' }
  ]
};

export const RELICS = [
    { id: 'relic_lucky_dice', name: 'Cosmic Dice', desc: 'Increases chance of crits and rare drops globally.', icon: '🎲', fragmentCost: 2, stat: 'luck', values: [1, 2, 3, 4, 5] },
    { id: 'relic_gold_magnet', name: 'Midas Core', desc: 'Boosts Gold Multiplier. Farm faster.', icon: '💰', fragmentCost: 3, stat: 'goldMult', values: [0.1, 0.2, 0.3, 0.4, 0.5] },
    { id: 'relic_xp_drive', name: 'Knowledge Drive', desc: 'Boosts XP Gain. Level up incredibly fast.', icon: '🧠', fragmentCost: 3, stat: 'xpMult', values: [0.1, 0.2, 0.3, 0.4, 0.5] },
    { id: 'relic_blood_chalice', name: 'Blood Chalice', desc: 'Increases HP Regen. Essential for long runs.', icon: '🍷', fragmentCost: 4, stat: 'regen', values: [0.2, 0.4, 0.6, 0.8, 1.0] },
    { id: 'relic_damage_core', name: 'Annihilation Core', desc: 'Boosts Base Damage. Annihilate your foes.', icon: '💥', fragmentCost: 5, stat: 'damageMult', values: [0.05, 0.10, 0.15, 0.20, 0.25] },
];

export const RELIC_RARITIES = [
    { level: 1, name: 'Common', color: 'text-slate-400', border: 'border-slate-500', bg: 'bg-slate-900', glow: 'shadow-[0_0_15px_rgba(100,116,139,0.3)]' },
    { level: 2, name: 'Uncommon', color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-950/20', glow: 'shadow-[0_0_15px_rgba(74,222,128,0.3)]' },
    { level: 3, name: 'Rare', color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-950/20', glow: 'shadow-[0_0_15px_rgba(96,165,250,0.3)]' },
    { level: 4, name: 'Epic', color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-950/20', glow: 'shadow-[0_0_15px_rgba(192,132,252,0.3)]' },
    { level: 5, name: 'Legendary', color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-950/20', glow: 'shadow-[0_0_15px_rgba(250,204,21,0.3)]' },
];

export const getEnemyMasteryMilestones = (enemy) => {
    if (!enemy) return [{ kills: 10, bonus: 0 }];
    if (enemy.isBoss) {
        return [
            { kills: 5, bonus: 2 },
            { kills: 15, bonus: 4 },
            { kills: 25, bonus: 6 },
            { kills: 35, bonus: 8 },
            { kills: 50, bonus: 10 }
        ];
    } else if (enemy.tier >= 9) {
        return [
            { kills: 50, bonus: 2 },
            { kills: 125, bonus: 4 },
            { kills: 250, bonus: 6 },
            { kills: 375, bonus: 8 },
            { kills: 500, bonus: 10 }
        ];
    } else if (enemy.tier >= 5) {
        return [
            { kills: 100, bonus: 2 },
            { kills: 250, bonus: 4 },
            { kills: 500, bonus: 6 },
            { kills: 750, bonus: 8 },
            { kills: 1000, bonus: 10 }
        ];
    } else {
        return [
            { kills: 200, bonus: 2 },
            { kills: 500, bonus: 4 },
            { kills: 1000, bonus: 6 },
            { kills: 1500, bonus: 8 },
            { kills: 2000, bonus: 10 }
        ];
    }
};

// Shared mastery tiers 1–5 — apply identically to every character.
export const CHARACTER_MASTERY_LEVELS = [
    { level: 1, killsRequired: 0,     title: 'Cadet',          bonusDesc: 'No bonus — earn your wings',  stat: null,           value: 0,    badge: '🥚' },
    { level: 2, killsRequired: 2000,  title: 'Star Runner',    bonusDesc: '+5% Speed',                   stat: 'speedMult',    value: 0.05, badge: '🚀' },
    { level: 3, killsRequired: 5000,  title: 'Void Reaper',    bonusDesc: '+10% Damage',                 stat: 'damageMult',   value: 0.10, badge: '⚔️' },
    { level: 4, killsRequired: 10000, title: 'Nebula Warden',  bonusDesc: '+15% Area',                   stat: 'areaMult',     value: 0.15, badge: '🌌' },
    { level: 5, killsRequired: 25000, title: 'Cosmic Overlord',bonusDesc: '-10% Cooldown',               stat: 'cooldownMult', value: -0.10, badge: '👑' },
];

// Per-character signature bonuses unlocked at the highest two mastery tiers.
// Tier 6 (50K kills) — a stat boost that matches each character's identity.
// Tier 7 (100K kills) — boosts that character's signature active ability or core trait.
//   - `abilityBoost` is read by CharacterMechanics.js / GameEngine to tweak active skills.
//   - When `stat` is set, it stacks with the shared tiers as a passive bonus.
export const CHARACTER_MASTERY_SIGNATURE = {
    neobyte: {
        tier6:  { title: 'Fleet Admiral',     bonusDesc: '+10% to all stats',          badge: '🌟', stat: 'allStats',     value: 0.10 },
        tier7:  { title: 'Galactic Sovereign',bonusDesc: 'Banner buff +50% stronger & 33% larger', badge: '💎', abilityBoost: { banner: { buffMult: 1.5, radiusMult: 1.33 } } },
    },
    pandypaws: {
        tier6:  { title: 'Iron Wall',         bonusDesc: '+50 Max HP & +3 Armor',      badge: '🌟', multiStat: { maxHp: 50, armor: 3 } },
        tier7:  { title: 'Unbreakable',       bonusDesc: 'Scrap drop chance doubled (5% → 10%)', badge: '💎', abilityBoost: { scrapDropMult: 2.0 } },
    },
    novabyte: {
        tier6:  { title: 'Demolitions Ace',   bonusDesc: '+15% Damage & +15% Area',    badge: '🌟', multiStat: { damageMult: 0.15, areaMult: 0.15 } },
        tier7:  { title: 'Annihilator',       bonusDesc: 'Chain explosion chance doubled (10% → 20%)', badge: '💎', abilityBoost: { chainExplosionMult: 2.0 } },
    },
    glitch: {
        tier6:  { title: 'Spectral Edge',     bonusDesc: '+15% Speed & +20% Damage',   badge: '🌟', multiStat: { speedMult: 0.15, damageMult: 0.20 } },
        tier7:  { title: 'Untouchable',       bonusDesc: 'Phase shift chance 15% → 25%', badge: '💎', abilityBoost: { phaseShiftChance: 0.25 } },
    },
    holodrift: {
        tier6:  { title: 'Quantum Engineer',  bonusDesc: '+50 Magnet & +20% XP',       badge: '🌟', multiStat: { magnetRange: 50, xpMult: 0.20 } },
        tier7:  { title: 'Mirage Master',     bonusDesc: 'Decoy cooldown 20s → 14s',   badge: '💎', abilityBoost: { decoyCooldownMult: 0.7 } },
    },
    codebreaker: {
        tier6:  { title: 'Cyber Tactician',   bonusDesc: '-10% Cooldown & +2 Luck',    badge: '🌟', multiStat: { cooldownMult: -0.10, luck: 2 } },
        tier7:  { title: 'Master Hacker',     bonusDesc: 'Hack cooldown 10s → 7s',     badge: '💎', abilityBoost: { hackCooldownMult: 0.7 } },
    },
    dataphantom: {
        tier6:  { title: 'Phantom Lord',      bonusDesc: '+30% Proj Speed & +3 Armor', badge: '🌟', multiStat: { projSpeedMult: 0.30, armor: 3 } },
        tier7:  { title: 'Wraith',            bonusDesc: 'Phantom boost duration 2s → 3.5s', badge: '💎', abilityBoost: { phantomBoostDuration: 3.5 } },
    },
    neonvortex: {
        tier6:  { title: 'Apex Marksman',     bonusDesc: '+25% Damage & +25% Proj Speed', badge: '🌟', multiStat: { damageMult: 0.25, projSpeedMult: 0.25 } },
        tier7:  { title: 'Executioner',       bonusDesc: 'Execute threshold 20% → 30% HP', badge: '💎', abilityBoost: { executeThreshold: 0.30 } },
    },
    synthbeats: {
        tier6:  { title: 'Cosmic Tycoon',     bonusDesc: '+30% Gold & +2 Luck',        badge: '🌟', multiStat: { goldMult: 0.30, luck: 2 } },
        tier7:  { title: 'Death\'s Dealer',   bonusDesc: 'Bribe cost 5g → 3g',         badge: '💎', abilityBoost: { bribeCost: 3 } },
    },
    skybyte: {
        tier6:  { title: 'Sky Captain',       bonusDesc: '+15% Speed & +15% Area',     badge: '🌟', multiStat: { speedMult: 0.15, areaMult: 0.15 } },
        tier7:  { title: 'Sonic Legend',      bonusDesc: 'Charges 33% faster + unlocks HYPER BOOM (charge past 100% for 2.5× dmg & 1.6× radius)', badge: '💎', abilityBoost: { sonicChargeMult: 1.33 } },
    },
};

export const getCharacterMastery = (kills, characterId = null) => {
    // Build a virtual list including character-specific tier 6 + 7 if a charId is supplied.
    const sig = characterId ? CHARACTER_MASTERY_SIGNATURE[characterId] : null;
    const allTiers = [...CHARACTER_MASTERY_LEVELS];
    if (sig) {
        if (sig.tier6) allTiers.push({ level: 6, killsRequired: 50000,  ...sig.tier6 });
        if (sig.tier7) allTiers.push({ level: 7, killsRequired: 100000, ...sig.tier7 });
    }

    let current = allTiers[0];
    let next = allTiers[1] || null;
    let unlockedTiers = [allTiers[0]];
    for (let i = 1; i < allTiers.length; i++) {
        if (kills >= allTiers[i].killsRequired) {
            current = allTiers[i];
            next = allTiers[i+1] || null;
            unlockedTiers.push(allTiers[i]);
        } else {
            next = allTiers[i];
            break;
        }
    }
    return { current, next, unlockedTiers };
};

// Evolved/synergy weapons inherit mastery from their parent base weapon — without this
// players who grind 5/5/5 to master Plasma Whip lose the mastery bonus the second their
// weapon evolves into Vampiric Lash mid-run (Hugo feedback 2026-05-06). Maps each
// derived weapon to the base whose mastery should carry over.
// Direct evolutions inherit from a single parent. Synergies inherit from BOTH parents
// (the array form below) so a player who invested forge/upgrades in either source weapon
// gets credit — we take the MAX of each stat across both parents, so investing in both
// is rewarded but doesn't double-stack into OP territory. wDmgCap/wAreaCap still clamp.
const EVOLUTION_PARENT = {
    // Direct evolutions (from EVOLUTIONS array) — single parent.
    supernovaBeam:  'napBeam',
    vampiricLash:   'vineWhip',
    orbitalDefense: 'slothSwarm',
    hellfire:       'napalm',
    quantumCollapse:'novaPulse',
    aegisMatrix:    'shieldBubble',
    buzzsawSwarm:   'bouncingBlade',
    // Synergies — inherit from BOTH source weapons (take the max of each stat).
    burningBarrier: ['napalm',     'shieldBubble'],
    laserNova:      ['napBeam',    'novaPulse'],
    thornySwarm:    ['vineWhip',   'slothSwarm'],
    orbitalLasers:  ['napBeam',    'slothSwarm'],
    seismicWhip:    ['vineWhip',   'novaPulse'],
    flamingLash:    ['napalm',     'vineWhip'],
    venomLash:      ['toxicCloud', 'vineWhip'],
};

// PERF 2026-08-03 — frame-scoped memo for getWeaponStatsAndMastery.
//
// The function below is not cheap: it builds a parents array, runs pickMax three
// times (each allocating a result object), does a flatMap, a Set, an Array.from
// and a counts object. It was being called TWICE per weapon fire (GameEngine
// updateWeapons + WeaponSystem fireWeapon) across six weapons on short cooldowns,
// AND twice per FRAME from the draw path (GameEngineDraw slothSwarm / thornySwarm).
//
// The inputs are meta-progression that cannot change mid-frame, so caching for the
// duration of one frame is safe by construction — no staleness window longer than
// 16ms, and a level-up or forge lands on a later frame. GameEngine.update() calls
// bustWeaponStatsCache() once per tick.
const _wsCache = new Map();
export function bustWeaponStatsCache() { _wsCache.clear(); }

export const getWeaponStatsAndMastery = (save, wId, isOuterGalaxy = false) => {
    if (!save) return { dmgMult: 1, areaMult: 1, cdMult: 1, isMastered: false };
    const _ck = isOuterGalaxy ? wId + '|o' : wId;
    const _hit = _wsCache.get(_ck);
    if (_hit !== undefined) return _hit;
    const _res = _computeWeaponStatsAndMastery(save, wId, isOuterGalaxy);
    _wsCache.set(_ck, _res);
    return _res;
};

const _computeWeaponStatsAndMastery = (save, wId, isOuterGalaxy = false) => {
    // For evolved weapons (single parent) — direct lookup. For synergies (array of two
    // parents) — take the MAX of each tier across both parents. This rewards players
    // who invested in either source weapon without doubling totals when both are stacked.
    const parent = EVOLUTION_PARENT[wId];
    const parents = Array.isArray(parent) ? parent : [parent || wId];
    const pickMax = (key1, key2) => {
        let dmg = 0, area = 0, cd = 0;
        for (const id of parents) {
            const u = save[key1]?.[id] || {};
            if ((u.damage || 0)   > dmg)  dmg  = u.damage || 0;
            if ((u.area || 0)     > area) area = u.area || 0;
            if ((u.cooldown || 0) > cd)   cd   = u.cooldown || 0;
        }
        return { damage: dmg, area, cooldown: cd };
    };
    const perm   = pickMax('permanentWeaponUpgrades');
    const week   = pickMax('weeklyWeaponUpgrades');
    const season = pickMax('seasonalWeaponUpgrades');
    // Forge augments: union of all augments forged on any parent (max tier per stat).
    // Inner Galaxy: dedup'd (legacy behavior — duplicates count as singletons).
    // Outer Galaxy (S11-S20): tier-3 augments can be "overforged" to 2 copies for
    // 2× bonus on that weapon (e.g. damage_3 × 2 = +120% instead of +60%). Tier 1/2
    // and the isMastered check stay dedup'd. See docs/SECTORS_11_20_PLAN.md.
    const allForgeAugments = parents.flatMap(id => save.forgeWeaponAugments?.[id] || []);
    const forgeAugments = Array.from(new Set(allForgeAugments));
    const forgeAugmentCounts = {};
    for (const a of allForgeAugments) forgeAugmentCounts[a] = (forgeAugmentCounts[a] || 0) + 1;
    // Overforge multiplier: a 2nd copy of a tier-3 augment grants +0.5 bonus (not +1).
    // Nerfed from 2× → 1.5× on 2026-06-23 because S7's STACK_FACTOR fix didn't account
    // for Overforge stacking on top of permanent/weekly/seasonal — at 2× the CD overforge
    // (-70%) was producing S7-style runaway DPS in Outer Galaxy. Fragment cost is still
    // 2× the base tier-3 cost, so value is preserved but the power curve is flattened.
    const tier3Mult = (id) => {
        const owned = forgeAugmentCounts[id] || 0;
        if (!isOuterGalaxy || owned <= 1) return Math.min(1, owned);
        return 1.5; // overforged (2 copies) on Outer Galaxy
    };
    const lookupId = parents[0]; // for compatibility — only used by isMastered check below
    
    // Diminishing returns when all 3 period tiers stack. Tightened from 0.66 → 0.5
    // (2026-05-06) after Tijckers' 249k-gold 3:31 run revealed weapon mastery was still
    // the dominant DPS amplifier — triple-maxed weapons reached ~4.7× DPS vs ~3.3× for
    // permanent-only, letting whales clear 13 bosses in 3:31 (vs 4-5 designed). At 0.5,
    // triple-stack peaks at ~3.5× — much closer to permanent-only, so weekly/seasonal
    // are still meaningful boosts but no longer compound into runaway DPS.
    // Permanent-only progression is unchanged (still 2.5× damage at perm 5/5/5).
    // Mastery check below still requires permanent 5/5/5 only.
    const STACK_FACTOR = 0.5;
    const dmgUpgradeLevel = (perm.damage || 0) + ((week.damage || 0) + (season.damage || 0)) * STACK_FACTOR;
    const areaUpgradeLevel = (perm.area || 0) + ((week.area || 0) + (season.area || 0)) * STACK_FACTOR;
    const cdUpgradeLevel = (perm.cooldown || 0) + ((week.cooldown || 0) + (season.cooldown || 0)) * STACK_FACTOR;
    
    let forgeDmg = 0;
    if (forgeAugments.includes('damage_1')) forgeDmg += 0.15;
    if (forgeAugments.includes('damage_2')) forgeDmg += 0.35;
    if (forgeAugments.includes('damage_3')) forgeDmg += 0.60 * tier3Mult('damage_3');

    let forgeArea = 0;
    if (forgeAugments.includes('area_1')) forgeArea += 0.15;
    if (forgeAugments.includes('area_2')) forgeArea += 0.35;
    if (forgeAugments.includes('area_3')) forgeArea += 0.60 * tier3Mult('area_3');
    
    let forgeCd = 0;
    if (forgeAugments.includes('cd_1')) forgeCd += 0.10;
    if (forgeAugments.includes('cd_2')) forgeCd += 0.20;
    if (forgeAugments.includes('cd_3')) forgeCd += 0.35 * tier3Mult('cd_3');

    // Mastery requires PERMANENT upgrades only (weekly/seasonal don't count toward mastery).
    const isMastered = ((perm.damage || 0) >= 5 && (perm.area || 0) >= 5 && (perm.cooldown || 0) >= 5) ||
                       (forgeAugments.includes('damage_3') && forgeAugments.includes('area_3') && forgeAugments.includes('cd_3'));
                       
    return {
        dmgMult: 1 + (dmgUpgradeLevel * 0.1) + forgeDmg,
        areaMult: 1 + (areaUpgradeLevel * 0.1) + forgeArea,
        cdMult: 1 - (cdUpgradeLevel * 0.05) - forgeCd,
        isMastered
    };
};