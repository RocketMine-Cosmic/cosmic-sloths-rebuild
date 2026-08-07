// Per-level scaling description for each weapon, shown in the level-up modal
// so players know exactly what a "+1 Level" pick will do.
//
// Base scaling (applies to ALL weapons): +15% damage, +8% area.
// Some weapons stack extra per-level effects on top — those are listed below.
//
// Source of truth: game/WeaponSystem.js. Keep these strings in sync if scaling changes.

const PER_WEAPON_EXTRAS = {
    // Pierce on the beam itself (line 96): pierce = 2 + Math.floor(level/2)
    napBeam:        'beam pierces +1 enemy every 2 levels',
    // Drone count (line 138): count = 1 + Math.floor(level/2)
    slothSwarm:     '+1 drone every 2 levels',
    // Pool duration (line 181): life = 3 + level
    napalm:         '+1s burning pool duration',
    // Beam pierce (line 299): pierce = 5 + Math.floor(level/2)
    laserNova:      'beams pierce +1 enemy every 2 levels',
    // Drone count (line 307): count = 2 + Math.floor(level/2)
    thornySwarm:    '+1 drone every 2 levels',
    // Drone count + beam pierce (line 331, 359)
    orbitalLasers:  '+1 drone every 2 levels, +1 beam pierce every 2 levels',
    // Pool duration (line 421): life = 2 + level*0.5
    flamingLash:    '+0.5s fire pool duration',
    // Beam pierce (line 449): pierce = 10 + level
    supernovaBeam:  'beam pierces +1 extra enemy',
    // Drone count + beam pierce (line 486, 514)
    orbitalDefense: '+1 drone every 2 levels, +1 beam pierce every 2 levels',
    // Pool duration (line 529): life = 5 + level
    hellfire:       '+1s inferno duration',
    // Buzzsaw count (line 599): count = 3 + Math.floor(level/2)
    buzzsawSwarm:   '+1 buzzsaw every 2 levels',
    // Cloud duration (line 626): life = 4 + level
    toxicCloud:     '+1s cloud duration',
    // Pool duration (line 652): life = 2.5 + level*0.5
    venomLash:      '+0.5s venom pool duration',
    // Barrier duration (line 259): life = 3 + level*0.5
    burningBarrier: '+0.5s barrier duration',
};

// Weapons that fire single-target projectiles get the projectile-speed kinetic bonus
// already mentioned in WeaponSystem (handled elsewhere) — we don't restate it here.

export function getWeaponLevelUpEffect(weaponId) {
    const base = '+15% damage, +8% area per level';
    const extra = PER_WEAPON_EXTRAS[weaponId];
    return extra ? `${base}; ${extra}` : base;
}