import { SoundManager } from './SoundManager';
import { SFXManager } from './SFXManager';
import { getWeaponStatsAndMastery } from './Constants';
import { isS6OrLater, isS7OrLater } from '@/lib/seasonGate';

// Cached at module load — see PickupSystem.js for the same pattern.
const _IS_S7 = isS7OrLater();

// S7 §4a-bis: softer pushback base damage cuts. §4a (CD floor) + §4b (decay)
// do the structural work of killing the stacked-shield exploit; these cuts
// just bring evolved pushback DPS down to median-tier offence (~50k vs the
// pre-S7 ~125k for Aegis). Multipliers vs Constants.js base values.
const S7_PUSHBACK_DMG_NERF = {
    shieldBubble:   12 / 15, // -20%
    aegisMatrix:    28 / 40, // -30%
    burningBarrier: 15 / 18, // -17%
};

// S6 visual-radius caps — applied ONLY to the drawn radius on each AoE weapon.
// Damage hitbox (p.radius) stays uncapped so area upgrades continue to scale the
// actual AoE — players were noticing upgrades stopped mattering past the cap.
// Numbers chosen to keep current legit max-stack builds at ~70-75% of their old
// visual footprint — readable but still satisfyingly large. See docs/S6_PATCH_NOTES.md §4.
// 2026-05-18: bumped shieldBubble 240→320 and aegisMatrix 320→420 after Texxy
// reported the bubbles "felt small" on mobile — the visual was clipping well
// below the true damage radius for maxed-area builds, making upgrades feel invisible.
const S6_VISUAL_RADIUS_CAP = {
    aegisMatrix:    420,
    shieldBubble:   320,
    burningBarrier: 280,
    hellfire:       240,
    // quantumCollapse: bumped 180 → 350 (2026-05-22, Anubis Discord).
    // QC is an expanding *pulse* (life 1.0s, grows at 500px/s) — the 180
    // cap was tuned for static AoE and made the rings cap at character
    // size, looking like they barely left the player. 350 matches the
    // other pulse weapons (novaPulse 350, laserNova 400) and lets the
    // rings actually expand to a satisfying size before clamping.
    quantumCollapse: 350,
    toxicCloud:     200,
    napalm:         180,
    // Expanding pulse rings — these grow at 500px/s in ProjectileSystem so the
    // DRAWN radius can balloon past 500px on high-area builds. Capping the visual
    // keeps the screen readable + bounds the glow-texture cache size; damage
    // hitbox (p.radius) still grows uncapped so area upgrades scale DPS.
    // ProjectileSystem grows p.visualRadius in lockstep, clamped to these caps.
    novaPulse:      350,
    laserNova:      400,
    seismicWhip:    300,
};
// Returns the visual cap for a weapon's drawn radius, or `undefined` when:
//  - season is pre-S6, OR
//  - this weapon has no cap entry.
// Callers should attach this as `visualRadius` on the projectile (when defined),
// leaving `radius` as the true damage hitbox.
function getVisualRadius(weaponId, radius) {
    if (!isS6OrLater()) return undefined;
    const cap = S6_VISUAL_RADIUS_CAP[weaponId];
    if (!cap) return undefined;
    if (radius <= cap) return undefined; // No clamp needed — they're the same.
    return cap;
}

// Damage hitbox cap for persistent AoE weapons (shields, pools, barriers).
// Visual is already clamped via getVisualRadius — past 1.5× the visual cap the
// damage hitbox is invisible to the player anyway AND the spatial-hash cell
// window explodes ((r+50)/100)² cells per checkAoe. This bounds the worst-case
// max-area-stacking scenario without affecting any normal build (Anubis/Leon
// Legion crash audit 2026-05-22). Pre-S6 unchanged.
function capDamageRadius(weaponId, radius) {
    if (!isS6OrLater()) return radius;
    const visCap = S6_VISUAL_RADIUS_CAP[weaponId];
    if (!visCap) return radius;
    return Math.min(visCap * 1.5, radius);
}

export function fireWeaponLogic(engine, w) {
    SFXManager.playWeaponFire(w.id);
    // 3rd arg = isOuterGalaxy — on S11+ runs, tier-3 forge augments can stack to 2×
    // (the "Overforge" Outer Galaxy mechanic). Inner Galaxy passes false → existing
    // behavior preserved.
    const stats = getWeaponStatsAndMastery(engine.save, w.id, engine._outerGalaxyActive);
    
    const isMastered = stats.isMastered;
    const wDmgMult = stats.dmgMult;
    const wAreaMult = stats.areaMult;

    // S6 tightened the global caps to flatten extreme stacking — peaks landed under
    // the old caps anyway (Tijckers ~3.5 area / ~1.66 dmg) so legit builds untouched.
    // S5 keeps the original ceilings so end-of-season runs aren't retroactively nerfed.
    const _s6 = isS6OrLater();
    const playerAreaCap = _s6 ? 3.0 : 4.0;
    const playerDmgCap  = _s6 ? 4.0 : 5.0;
    const wAreaCap      = _s6 ? 1.6 : 2.0;
    const wDmgCap       = _s6 ? 1.8 : 2.0;
    // Per-level area scaling — S6 drops 0.08 → 0.05 so weapon level isn't a third
    // independent area faucet on top of upgrades + forge. Damage scaling unchanged
    // (0.15) so level-ups still feel impactful.
    const areaPerLevel  = _s6 ? 0.05 : 0.08;

    // Level cap follows the season: S5 stops scaling at lvl 20 (legacy), S6+ at lvl 25.
    const _lvlCap = _s6 ? 24 : 19;
    const weaponLevelMult = 1 + Math.min(_lvlCap, w.level - 1) * 0.15;
    let dmg = w.baseDamage * Math.min(playerDmgCap, engine.player.damageMult) * weaponLevelMult * Math.min(wDmgCap, wDmgMult);
    let area = w.baseArea * Math.min(playerAreaCap, engine.player.areaMult) * (1 + Math.min(_lvlCap, w.level - 1) * areaPerLevel) * Math.min(wAreaCap, wAreaMult);

    // S7 §4a-bis: scaled-back pushback weapon base damage (CD floor + decay are
    // the real nerfs; this just brings them down to median offence tier).
    if (_IS_S7 && S7_PUSHBACK_DMG_NERF[w.id]) {
        dmg *= S7_PUSHBACK_DMG_NERF[w.id];
    }

    // Projectile Speed → Damage scaling (kinetic energy):
    // Faster projectiles hit harder. Applies ONLY to projectile-based weapons (not melee/AoE).
    // +50% projSpeedMult → +25% damage. Capped so it can't double damage on its own.
    const PROJECTILE_WEAPONS = new Set([
        'neoBlaster', 'napBeam', 'bouncingBlade', 'buzzsawSwarm',
        'supernovaBeam', 'orbitalLasers', 'orbitalDefense', 'laserNova'
    ]);
    if (PROJECTILE_WEAPONS.has(w.id)) {
        const speedBonus = Math.min(1.0, (Math.max(1.0, engine.player.projSpeedMult) - 1.0) * 0.5);
        dmg *= 1 + speedBonus;
    }
    
    if (engine.player.synAmpTimer > 0) area *= 2.0;
    
    if (engine.player.charAugments?.includes('neo_rail')) {
        engine.player.railCount = (engine.player.railCount || 0) + 1;
        if (engine.player.railCount % 5 === 0) dmg *= 3.0;
    }
    
    let isBeatPush = false;
    if (engine.player.charAugments?.includes('syn_beat')) {
        engine.player.beatCount = (engine.player.beatCount || 0) + 1;
        if (engine.player.beatCount % 4 === 0) isBeatPush = true;
    }

    const startIndex = engine.projectiles.length;
    
    if (w.id === 'neoBlaster') {
        let nearest = null;
        let minDist = Infinity;
        engine.enemies.forEach(e => {
            const d = Math.hypot(e.x - engine.player.x, e.y - engine.player.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        let angle = nearest ? Math.atan2(nearest.y - engine.player.y, nearest.x - engine.player.x) : Math.random() * Math.PI * 2;
        
        const count = isMastered ? 3 : 1;
        for (let i = 0; i < count; i++) {
            const a = count > 1 ? angle + (i - 1) * 0.2 : angle;
            engine.projectiles.push({
                x: engine.player.x, y: engine.player.y,
                vx: Math.cos(a) * 500 * engine.player.projSpeedMult,
                vy: Math.sin(a) * 500 * engine.player.projSpeedMult,
                // C7 2026-08-03 — was engine.player.color, UNCONDITIONALLY: the
                // starter weapon had no identity of its own at any level, and
                // because GameEngineDraw paints the player sprite in that same
                // colour, the shots visually merged with the character firing
                // them. Mastery is still read from the shot count (1 -> 3).
                radius: 6 * area, damage: dmg, pierce: 1, life: 1.5, color: '#9dff5c', type: 'blaster_shot'
            });
        }
    }
    else if (w.id === 'napBeam') {
        let nearest = null;
        let minDist = Infinity;
        engine.enemies.forEach(e => {
            const d = Math.hypot(e.x - engine.player.x, e.y - engine.player.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        
        let angle = nearest ? Math.atan2(nearest.y - engine.player.y, nearest.x - engine.player.x) : Math.random() * Math.PI * 2;
        
        // C7 2026-08-03 — unmastered was the character colour (see neoBlaster).
        // Pale blue -> royal blue keeps mastery as a shift WITHIN one identity
        // rather than a swap into a different one, which is the rule the rest of
        // this pass follows.
        let projColor = isMastered ? '#4169E1' : '#8fb8ff';
        let projType = 'beam';
        
        if (engine.characterId === 'skybyte') { projType = 'dual_laser'; }
        else if (engine.characterId === 'neobyte') { projType = 'lightning'; }
        else if (engine.characterId === 'glitch') { projType = 'glitch_slash'; }
        else if (engine.characterId === 'pandypaws') { projType = 'stomp'; }
        else if (engine.characterId === 'holodrift') { projType = 'repair_beam'; }
        else if (engine.characterId === 'novabyte') { projType = 'missile'; }
        else if (engine.characterId === 'codebreaker') { projType = 'data_pulse'; }
        else if (engine.characterId === 'dataphantom') { projType = 'phantom_orb'; }
        else if (engine.characterId === 'neonvortex') { projType = 'railgun'; }
        else if (engine.characterId === 'synthbeats') { projType = 'sonic_wave'; }

        const spawnOffset = engine.player.radius + 5;
        engine.projectiles.push({
            x: engine.player.x + Math.cos(angle) * spawnOffset,
            y: engine.player.y + Math.sin(angle) * spawnOffset,
            vx: Math.cos(angle) * 300 * engine.player.projSpeedMult,
            vy: Math.sin(angle) * 300 * engine.player.projSpeedMult,
            radius: 5 * area,
            damage: dmg,
            pierce: 2 + Math.floor(w.level/2),
            life: 2,
            color: projColor,
            type: projType,
            isMastered: isMastered,
            weaponId: 'napBeam'
        });
        
        if (projType === 'dual_laser') {
             engine.projectiles.push({
                x: engine.player.x + Math.cos(angle) * spawnOffset + Math.cos(angle + Math.PI/2)*10,
                y: engine.player.y + Math.sin(angle) * spawnOffset + Math.sin(angle + Math.PI/2)*10,
                vx: Math.cos(angle) * 300 * engine.player.projSpeedMult, vy: Math.sin(angle) * 300 * engine.player.projSpeedMult,
                radius: 4 * area, damage: dmg, pierce: 2 + Math.floor(w.level/2), life: 2, color: projColor, type: projType, isMastered, weaponId: 'napBeam'
            });
        }
    }
    else if (w.id === 'vineWhip') {
        // C7 2026-08-03 — `charColor` deleted; it existed only to feed color1 the
        // player's colour. Pale rose -> crimson, same shift-within-an-identity
        // rule as napBeam above. Mastered #ff0055 is unchanged.
        const color1 = isMastered ? '#ff0055' : '#ff7a9c';
        const color2 = isMastered ? '#ffaa00' : '#ffffff';
        
        engine.particleManager.particles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0, life: 0.2, maxLife: 0.2,
            color: '#ffffff', tint: color1, type: 'slash', size: 60 * area, rotation: Math.random() * Math.PI * 2
        });

        engine.enemies.forEach(e => {
            if (Math.hypot(e.x - engine.player.x, e.y - engine.player.y) < 100 * area) {
                engine.damageEnemy(e, dmg, { weaponId: w.id });
                engine.addParticle(e.x, e.y, color1, 10, 'spark', 1.5);
                engine.addParticle(e.x, e.y, color2, 5, 'spark', 1);
                if (engine.player.charAugments?.includes('pan_stomp')) e.slowTimer = 2.0;
                if (isMastered) {
                    engine.player.hp = Math.min(engine.player.maxHp, engine.player.hp + (dmg * 0.05));
                    engine.callbacks.onHpChange(engine.player.hp, engine.player.maxHp);
                }
            }
        });
    }
    else if (w.id === 'slothSwarm') {
        const count = 1 + Math.floor(w.level / 2);
        // Mastery: drones orbit 80% faster (was identical speed — Anubis bug 2026-05-11).
        const orbitSpeed = isMastered ? 5.4 : 3;
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + engine.time * orbitSpeed;
            const px = engine.player.x + Math.cos(angle) * (60 * area);
            const py = engine.player.y + Math.sin(angle) * (60 * area);
            engine.enemies.forEach(e => {
                if (Math.hypot(e.x - px, e.y - py) < 20) {
                    engine.damageEnemy(e, dmg * 0.2, { weaponId: w.id });
                    engine.addParticle(e.x, e.y, isMastered ? '#FF0000' : '#8B4513', 2);
                }
            });
            
            if (isMastered) {
                let nearest = null;
                let minDist = 200;
                engine.enemies.forEach(e => {
                    const d = Math.hypot(e.x - px, e.y - py);
                    if (d < minDist) { minDist = d; nearest = e; }
                });
                if (nearest) {
                    const lAngle = Math.atan2(nearest.y - py, nearest.x - px);
                    engine.projectiles.push({
                        x: px, y: py,
                        vx: Math.cos(lAngle) * 300,
                        vy: Math.sin(lAngle) * 300,
                        radius: 3,
                        damage: dmg * 0.5,
                        pierce: 1,
                        life: 1,
                        color: '#FF0000',
                        type: 'beam'
                    });
                }
            }
        }
    }
    else if (w.id === 'napalm') {
        const r = capDamageRadius('napalm', 40 * area);
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: r,
            visualRadius: getVisualRadius('napalm', r),
            damage: dmg * 0.5,
            pierce: 999,
            // Pool life capped at 15s (was up to 28s at lvl 25) (audit 2026-05-22).
            life: Math.min(15, 3 + w.level),
            // Mastery flips the pool to blue plasma fire to clearly distinguish it from
            // the orange base version (Anubis bug 2026-05-11 — old #ff2200 was nearly
            // identical to non-mastered #ff4500).
            color: isMastered ? '#00BFFF' : '#ff4500',
            isAoe: true,
            isMastered: isMastered,
            weaponId: 'napalm',
            type: 'napalm_pool'
        });
    }
    else if (w.id === 'novaPulse') {
        // masteryDesc explicitly says "(Purple Blast)" — primary was magenta/pink (#ff00ff)
        // which reads more as hot pink than purple. Swapped to true purple/violet so the
        // mastered pulse matches its description (Hugo audit 2026-05-12).
        const primaryColor = isMastered ? '#9400d3' : '#00ffff';
        const secondaryColor = isMastered ? '#c77dff' : '#ffffff';
        
        if (engine.player.charAugments?.includes('nova_chain')) {
            for(let i=0; i<2; i++) {
                const a = Math.random() * Math.PI * 2;
                engine.projectiles.push({
                    x: engine.player.x, y: engine.player.y,
                    vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                    radius: 5, damage: dmg * 0.5, pierce: 1, life: 2, color: '#ff0000', type: 'missile'
                });
            }
        }
        
        const novaR = 10 * area;
        const novaVisCap = getVisualRadius('novaPulse', 9999); // cap value if S6+
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: novaR,
            visualRadius: novaR,
            visualMaxRadius: novaVisCap,
            damage: dmg,
            pierce: 999,
            life: 0.5,
            color: primaryColor,
            isAoe: true,
            pulse: true,
            type: 'nova_pulse'
        });
        if (isMastered) {
            // setTimeout → engine.deferredSpawns (same rationale as quantumCollapse).
            (engine.deferredSpawns = engine.deferredSpawns || []).push({
                fireAt: engine.time + 0.5,
                spawn: () => ({
                    x: engine.player.x, y: engine.player.y,
                    vx: 0, vy: 0,
                    radius: novaR,
                    visualRadius: novaR,
                    visualMaxRadius: novaVisCap,
                    damage: dmg * 0.5,
                    pierce: 999,
                    life: 0.5,
                    color: secondaryColor,
                    isAoe: true,
                    pulse: true,
                    type: 'nova_pulse',
                    weaponId: 'novaPulse'
                })
            });
        }
    }
    else if (w.id === 'shieldBubble') {
        // C6/C7 2026-08-03 — the gold three-way. Unmastered used engine.player.color,
        // and SynthBeats' character colour is #FFD700, so playing SynthBeats an
        // unmastered bubble was pixel-identical to the mastered "(Golden Shield)".
        // The shield line now ramps within one identity instead of colliding:
        //   shieldBubble unmastered #d9a441 (amber-bronze)
        //   shieldBubble mastered   #ffd700 (true gold)
        //   aegisMatrix             #fff3a0 (pale platinum-gold, see that branch)
        // Also gives the weapon its own colour from level 1 rather than merging
        // with the player sprite, which is drawn in the same character colour.
        const color = isMastered ? '#ffd700' : '#d9a441';
        // Removed the 8-circle activation burst (was: addParticle ... 8, 'circle', ..., {speed: 200}).
        // Texxy 2026-05-20: when the bubble fires on a short cooldown, each refresh
        // spawned 8 expanding circle particles from the player position. Stacked
        // bursts created a flickering flashlight effect on top of the bubble —
        // unsafe for epileptic players. The bubble's own dashed outline + fill
        // pulse already provides clear activation feedback.
        const r = capDamageRadius('shieldBubble', 80 * area);
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: r,
            visualRadius: getVisualRadius('shieldBubble', r),
            damage: dmg,
            pierce: 999,
            // 2026-07-05 (Mustard Discord): life bumped 2.0 → 2.5s. Base cooldown
            // is 3.0s (180 frames @ 60fps), so at zero CDR the shield was DOWN
            // for a full 1.0s between activations — players reported "monster
            // touched me without any resistance" during that gap. 2.5s cuts the
            // gap to 0.5s (still a real off-window so shield stacking has meaning
            // at high CDR, but no longer feels broken to fresh runs).
            life: 2.5,
            // S7 §4b: stored at spawn so ProjectileSystem can compute lifeFrac
            // for pushback decay in the final 25%. Pre-S7 reads ignore this.
            maxLife: 2.5,
            color: color,
            isAoe: true,
            pushback: 250,
            isMastered: isMastered,
            weaponId: 'shieldBubble',
            type: 'shield_bubble'
        });
    }
    else if (w.id === 'burningBarrier') {
        const r = capDamageRadius('burningBarrier', 100 * area);
        const barrierLife = 3.0 + (w.level * 0.5);
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: r,
            visualRadius: getVisualRadius('burningBarrier', r),
            damage: dmg,
            pierce: 999,
            life: barrierLife,
            // S7 §4b: pushback-decay reference (see shieldBubble).
            maxLife: barrierLife,
            color: '#ff4500',
            isAoe: true,
            pushback: 150,
            burn: true,
            type: 'burning_barrier'
        });
    }
    else if (w.id === 'laserNova') {
        if (engine.player.charAugments?.includes('nova_chain')) {
            for(let i=0; i<2; i++) {
                const a = Math.random() * Math.PI * 2;
                engine.projectiles.push({
                    x: engine.player.x, y: engine.player.y,
                    vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                    radius: 5, damage: dmg * 0.5, pierce: 1, life: 2, color: '#ff0000', type: 'missile'
                });
            }
        }
        
        const lnR = 15 * area;
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: lnR,
            visualRadius: lnR,
            visualMaxRadius: getVisualRadius('laserNova', 9999),
            damage: dmg,
            pierce: 999,
            life: 0.8,
            color: '#00ffff',
            isAoe: true,
            pulse: true,
            type: 'laser_nova_pulse'
        });
        // Laser Nova was the #1 reported screen-crasher (Anubis 2026-05-22).
        // Beams 8→6, pierce capped at 5+min(6,level/2) (was unbounded → 17 at
        // lvl 25), life 2s→1.2s. At high CDR, original could keep 40+ beams
        // alive simultaneously, each with trails and chain potential.
        const _lnBeamCount = 6;
        for (let i = 0; i < _lnBeamCount; i++) {
            const angle = (Math.PI * 2 / _lnBeamCount) * i;
            engine.projectiles.push({
                x: engine.player.x, y: engine.player.y,
                vx: Math.cos(angle) * 400 * engine.player.projSpeedMult,
                vy: Math.sin(angle) * 400 * engine.player.projSpeedMult,
                radius: 8 * area,
                damage: dmg * 0.5,
                pierce: 5 + Math.min(6, Math.floor(w.level / 2)),
                life: 1.2,
                color: '#ff00ff',
                type: 'beam'
            });
        }
    }
    else if (w.id === 'thornySwarm') {
        // Display name is "Plasma Swarm" with "plasma whips" — old forest-green particles
        // were a leftover from when this was called "Thorny Swarm" (plant theme).
        // Plasma cyan + magenta now matches the in-game weapon name/description (Hugo audit 2026-05-12).
        //
        // Anubis feedback 2026-05-20: this synergy was strictly WORSE than both its
        // parent components — orbs only contact-damaged at radius 30 for dmg*0.3, and
        // the AoE "plasma whip lash" only fired 30% of frames at dmg*1.0. Players were
        // trading up to a weaker weapon when forming the synergy. Fixes:
        //   • Orb contact: dmg*0.3 → dmg*0.5 at radius 30 (matches Orbital Lasers).
        //   • Plasma lash: was 30% RNG → now guaranteed every frame at dmg*0.6 (the
        //     "lash" is the weapon's identity per the description, shouldn't be RNG).
        //   • Lash damage tuned to 0.6 (not 1.0) since it now ALWAYS fires — net DPS
        //     roughly 2× the old expected value, putting it ahead of both parents.
        // Drone count capped at 7 (was 14 at lvl 25) — same rationale as
        // orbitalLasers above (audit 2026-05-22).
        const count = Math.min(7, 2 + Math.floor(w.level / 2));
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + engine.time * 4;
            const px = engine.player.x + Math.cos(angle) * (80 * area);
            const py = engine.player.y + Math.sin(angle) * (80 * area);
            
            engine.enemies.forEach(e => {
                if (Math.hypot(e.x - px, e.y - py) < 30) {
                    engine.damageEnemy(e, dmg * 0.5, { weaponId: w.id });
                    engine.addParticle(e.x, e.y, '#00ffff', 5);
                }
            });
            
            // Guaranteed plasma-whip lash — the weapon's signature mechanic.
            // Lash radius bumped 120 → 170 (2026-06-04, Anubis Discord) so the
            // kill-zones around adjacent drones overlap and there are no "dead
            // lanes" between drones that enemies could slip through.
            // C10 2026-08-03 — DRAWING ONLY. Read the guard below before editing.
            let lashHit = false;
            engine.enemies.forEach(e => {
                if (Math.hypot(e.x - px, e.y - py) < 170 * area) {
                    engine.damageEnemy(e, dmg * 0.6, { weaponId: w.id });
                    if (Math.random() < 0.3) engine.addParticle(e.x, e.y, '#ff00ff', 10);
                    lashHit = true;
                }
            });
            // C10: the lash is this weapon's main damage and had NO visual at all
            // — not a projectile, not a particle, only a 30%-chance spark on each
            // victim. Enemies died several body-lengths from anything the player
            // could see. One faint ring per drone that actually connected, at the
            // reach it actually has.
            //
            // 🔴 The 170 * area below is READ FROM the damage check above, never
            // the other way round. If these ever disagree, change the drawing.
            // Aligning the hit radius to a drawing is a gameplay change and is
            // explicitly out of scope for this pass.
            //
            // size * 0.9 is the drawn radius for a 'ring' particle (ParticleManager
            // draws the shockwave texture at size * 1.8, centred), hence the 1.11.
            // 'ring' is deliberately not 'shockwave' — shockwave self-expands in
            // the update loop and would drift off the real radius.
            if (lashHit) {
                engine.particleManager.particles.push({
                    x: px, y: py, vx: 0, vy: 0,
                    life: 0.18, maxLife: 0.18,
                    color: '#ff00ff', tint: '#ff00ff',
                    type: 'ring', size: (170 * area) * 1.11, rotation: 0
                });
            }
        }
        // Player-centered plasma aura (2026-06-04, Anubis Discord). Small
        // continuous tick around the player so close-range enemies that get
        // inside the drone orbit aren't ignored. Lower DPS than the lashes
        // — fixes the "feels useless at point-blank" complaint without
        // turning the weapon into a no-fly ring.
        let auraHit = false;
        engine.enemies.forEach(e => {
            if (Math.hypot(e.x - engine.player.x, e.y - engine.player.y) < 90 * area) {
                engine.damageEnemy(e, dmg * 0.25, { weaponId: w.id });
                auraHit = true;
            }
        });
        // C10: the point-blank aura was the other invisible damage source. Same
        // rule as the lash ring above — 90 * area is read from the check, and the
        // check is not to be changed to match it.
        if (auraHit) {
            engine.particleManager.particles.push({
                x: engine.player.x, y: engine.player.y, vx: 0, vy: 0,
                life: 0.15, maxLife: 0.15,
                color: '#00ffff', tint: '#00ffff',
                type: 'ring', size: (90 * area) * 1.11, rotation: 0
            });
        }
    }
    else if (w.id === 'orbitalLasers') {
        // Drone count capped at 7 (was 14 at lvl 25). Each drone runs TWO full
        // enemy-list scans per cast — uncapped count produced thousands of
        // distance calcs per fire-tick on dense fields (audit 2026-05-22).
        const count = Math.min(7, 2 + Math.floor(w.level / 2));
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + engine.time * 2;
            const px = engine.player.x + Math.cos(angle) * (60 * area);
            const py = engine.player.y + Math.sin(angle) * (60 * area);
            
            engine.enemies.forEach(e => {
                if (Math.hypot(e.x - px, e.y - py) < 25) {
                    engine.damageEnemy(e, dmg * 0.5, { weaponId: w.id });
                    engine.addParticle(e.x, e.y, '#00ffff', 3);
                }
            });
            
            let nearest = null;
            let minDist = 300 * area;
            engine.enemies.forEach(e => {
                const d = Math.hypot(e.x - px, e.y - py);
                if (d < minDist) { minDist = d; nearest = e; }
            });
            
            if (nearest) {
                const lAngle = Math.atan2(nearest.y - py, nearest.x - px);
                engine.projectiles.push({
                    x: px, y: py,
                    vx: Math.cos(lAngle) * 400 * engine.player.projSpeedMult,
                    vy: Math.sin(lAngle) * 400 * engine.player.projSpeedMult,
                    radius: 4,
                    damage: dmg,
                    pierce: 3 + Math.floor(w.level/2),
                    life: 1.5,
                    color: '#00ffff',
                    type: 'beam'
                });
            }
        }
    }
    else if (w.id === 'seismicWhip') {
        // C7 2026-08-03 — removed a dead `const charColor = engine.player.color;`
        // here. It was assigned and never read.
        engine.particleManager.particles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
            // C6 2026-08-03 — Seismic Whip flashed magenta then emitted a cyan ring,
            // reading as two different weapons. Unified on amber, which matches its
            // "Quake Force" label; #ff00ff also collided exactly with Glitch's
            // character colour, and #00ffff is shared by five other effects.
            color: '#ffffff', tint: '#ff9500', type: 'slash', size: 80 * area, rotation: Math.random() * Math.PI * 2
        });
        let hitAny = false;
        let hitX = engine.player.x;
        let hitY = engine.player.y;
        
        engine.enemies.forEach(e => {
            if (Math.hypot(e.x - engine.player.x, e.y - engine.player.y) < 120 * area) {
                engine.damageEnemy(e, dmg, { weaponId: w.id });
                if (Math.random() < 0.3) engine.addParticle(e.x, e.y, '#ff9500', 4, 'spark', 1.5);
                hitAny = true;
                hitX = e.x;
                hitY = e.y;
            }
        });
        
        if (hitAny) {
            engine.addParticle(hitX, hitY, '#ffc46b', 15, 'spark', 2);
            const swR = 30 * area;
            engine.projectiles.push({
                x: hitX, y: hitY,
                vx: 0, vy: 0,
                radius: swR,
                visualRadius: swR,
                visualMaxRadius: getVisualRadius('seismicWhip', 9999),
                damage: dmg * 1.5,
                pierce: 999,
                life: 0.5,
                color: '#ff9500',
                isAoe: true,
                pulse: true,
                type: 'seismic_shockwave'
            });
        }
    }
    else if (w.id === 'flamingLash') {
        engine.particleManager.particles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
            color: '#ffffff', tint: '#ff4500', type: 'slash', size: 80 * area, rotation: Math.random() * Math.PI * 2
        });
        engine.enemies.forEach(e => {
            if (Math.hypot(e.x - engine.player.x, e.y - engine.player.y) < 120 * area) {
                engine.damageEnemy(e, dmg, { weaponId: w.id });
                if (Math.random() < 0.3) engine.addParticle(e.x, e.y, '#ff4500', 4, 'spark', 1.5);
                
                engine.projectiles.push({
                    x: e.x, y: e.y,
                    vx: 0, vy: 0,
                    radius: 30 * area,
                    damage: dmg * 0.4,
                    pierce: 999,
                    // Pool life capped at 15s (audit 2026-05-22).
                    life: Math.min(15, 2.0 + (w.level * 0.5)),
                    color: '#ff4500',
                    isAoe: true,
                    burn: true,
                    type: 'flaming_lash_pool'
                });
            }
        });
    }
    else if (w.id === 'supernovaBeam') {
        let nearest = null;
        let minDist = Infinity;
        engine.enemies.forEach(e => {
            const d = Math.hypot(e.x - engine.player.x, e.y - engine.player.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        let angle = nearest ? Math.atan2(nearest.y - engine.player.y, nearest.x - engine.player.x) : Math.random() * Math.PI * 2;
        const spawnOffset = engine.player.radius + 5;
        
        // Supernova Beam evolves from napBeam (whose mastered form is the "Blue Beam"),
        // so the evolution should preserve that blue identity rather than flipping to
        // orange. Bright cyan-blue keeps the supernova "super-charged" feel while
        // honoring the parent weapon's mastery color (Hugo audit 2026-05-12).
        engine.addParticle(engine.player.x, engine.player.y, '#4169E1', 10, 'spark', 2 * area, { speed: 400 });
        
        engine.projectiles.push({
            x: engine.player.x + Math.cos(angle) * spawnOffset,
            y: engine.player.y + Math.sin(angle) * spawnOffset,
            vx: Math.cos(angle) * 400 * engine.player.projSpeedMult,
            vy: Math.sin(angle) * 400 * engine.player.projSpeedMult,
            radius: 15 * area,
            damage: dmg,
            pierce: 10 + w.level,
            life: 3,
            color: '#4169E1',
            type: 'supernova_beam',
            isMastered: true,
            weaponId: 'supernovaBeam'
        });
    }
    else if (w.id === 'vampiricLash') {
        engine.particleManager.particles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
            color: '#ffffff', tint: '#ff0000', type: 'slash', size: 100 * area, rotation: Math.random() * Math.PI * 2
        });
        engine.particleManager.particles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            life: 0.5, maxLife: 0.5,
            color: '#ff0000', tint: '#ff0000',
            type: 'shockwave',
            size: 20 * area, growthRate: 1200 * area, lineWidth: 10
        });
        let totalHeal = 0;
        engine.enemies.forEach(e => {
            if (Math.hypot(e.x - engine.player.x, e.y - engine.player.y) < 180 * area) {
                engine.damageEnemy(e, dmg, { weaponId: w.id });
                if (Math.random() < 0.2) engine.addParticle(e.x, e.y, '#ff0000', 4, 'spark', 1.5);
                totalHeal += dmg * 0.01;
            }
        });
        if (totalHeal > 0) {
            // Heal cap: 5% Max HP per swing on Inner Galaxy. Lifted to 10% on Outer
            // Galaxy (S11-S20) where enemy damage outpaces the old cap — without
            // this, sustain builds become unplayable past S13. Sector detection
            // via the engine's _outerGalaxyActive flag (set in GameEngine ctor).
            const healCap = engine._outerGalaxyActive ? 0.10 : 0.05;
            totalHeal = Math.min(totalHeal, engine.player.maxHp * healCap);
            engine.player.hp = Math.min(engine.player.maxHp, engine.player.hp + totalHeal);
            engine.callbacks.onHpChange(engine.player.hp, engine.player.maxHp);
        }
    }
    else if (w.id === 'orbitalDefense') {
        // Evolves from slothSwarm whose mastered color is red (#FF0000).
        // Was magenta — broke the parent-color inheritance rule (Hugo audit 2026-05-12).
        // Drone count capped at 7 (was unbounded) — ReZuM reported white-screen
        // crashes at lvl 13+ from beam-projectile spam. Each drone fires a beam every
        // fire-tick with pierce (5 + level/2) and life 1.5s; uncapped count produced
        // 30-60+ beams-in-flight which overwhelmed the renderer. Beam life also
        // tightened 2.0s → 1.5s (matches parent orbitalLasers) to keep flight count
        // bounded. Level scaling continues via beam pierce and global damage.
        const count = Math.min(7, 4 + Math.floor(w.level / 2));
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + engine.time * 3;
            const px = engine.player.x + Math.cos(angle) * (70 * area);
            const py = engine.player.y + Math.sin(angle) * (70 * area);
            
            engine.enemies.forEach(e => {
                if (Math.hypot(e.x - px, e.y - py) < 30) {
                    engine.damageEnemy(e, dmg * 0.5, { weaponId: w.id });
                    engine.addParticle(e.x, e.y, '#ff3030', 3);
                }
            });
            
            let nearest = null;
            let minDist = 400 * area;
            engine.enemies.forEach(e => {
                const d = Math.hypot(e.x - px, e.y - py);
                if (d < minDist) { minDist = d; nearest = e; }
            });
            
            if (nearest) {
                const lAngle = Math.atan2(nearest.y - py, nearest.x - px);
                engine.projectiles.push({
                    x: px, y: py,
                    vx: Math.cos(lAngle) * 500 * engine.player.projSpeedMult,
                    vy: Math.sin(lAngle) * 500 * engine.player.projSpeedMult,
                    radius: 5,
                    damage: dmg,
                    pierce: 5 + Math.floor(w.level/2),
                    life: 1.5,
                    color: '#ff3030',
                    type: 'beam'
                });
            }
        }
    }
    else if (w.id === 'hellfire') {
        const r = capDamageRadius('hellfire', 60 * area);
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: r,
            visualRadius: getVisualRadius('hellfire', r),
            damage: dmg,
            pierce: 999,
            // Pool life capped at 15s (was up to 30s at lvl 25) (audit 2026-05-22).
            life: Math.min(15, 5 + w.level),
            // Hellfire description says "Blue flames that persist" — was red (#ff0000)
            // which contradicted the description and clashed visually with napalm.
            // C6 2026-08-03 — #1E90FF did NOT distinguish it from mastered napalm
            // (#00BFFF): both render through the same pool branch differing only by
            // alpha 0.4/0.3 and 5/4 segments, so the *evolution* read as slightly
            // more of the base weapon. Pushed to violet-blue, which stays inside
            // "blue flames" while being unmistakably not napalm.
            color: '#4d5bff',
            isAoe: true,
            burn: true,
            isMastered: true,
            weaponId: 'hellfire',
            type: 'hellfire'
        });
    }
    else if (w.id === 'quantumCollapse') {
        // setTimeout → engine.deferredSpawns. Original timers kept firing after
        // game-over (the early-return guard caught it but the queue still ran).
        // Engine-tick deferral is cleaner: spawns drain inside updateProjectiles,
        // which won't run post game-over. Position captured at fire time, not
        // cast time — matches original behavior (audit 2026-05-22).
        // FIXED 2026-05-22 (Anubis Discord): visualRadius was using the
        // wrong pattern — passing the start radius to getVisualRadius meant
        // it was either `undefined` (no cap) or LOCKED to the cap forever.
        // Combined with ProjectileSystem only growing visualRadius when BOTH
        // visualRadius AND visualMaxRadius are set, the ring's visual got
        // pinned at 180px while the damage hitbox kept growing — so the
        // expanding outward rings appeared trapped inside any Bubble Shield
        // (320px visual cap). Mirror the novaPulse / laserNova pattern:
        // initial visualRadius = damage radius, separate visualMaxRadius cap.
        const qcVisCap = getVisualRadius('quantumCollapse', 9999);
        const queueCollapse = (multiplier, delayMs) => {
            const spawn = () => {
                const r = 25 * area * multiplier;
                return {
                    x: engine.player.x, y: engine.player.y,
                    vx: 0, vy: 0,
                    radius: r,
                    visualRadius: r,
                    visualMaxRadius: qcVisCap,
                    damage: dmg * multiplier,
                    pierce: 999,
                    life: 1.0,
                    color: '#8a2be2',
                    isAoe: true,
                    pulse: true,
                    type: 'quantum_collapse',
                    weaponId: 'quantumCollapse'
                };
            };
            if (delayMs === 0) {
                engine.projectiles.push(spawn());
            } else {
                (engine.deferredSpawns = engine.deferredSpawns || []).push({
                    fireAt: engine.time + delayMs / 1000,
                    spawn
                });
            }
        };
        queueCollapse(1.0, 0);
        queueCollapse(1.2, 300);
        queueCollapse(1.4, 600);
    }
    else if (w.id === 'aegisMatrix') {
        // Evolves from shieldBubble whose mastered color is gold (#ffd700).
        // Was green — broke the parent-color inheritance rule (Hugo audit 2026-05-12).
        // Removed the 12-circle activation burst (was: addParticle ... 12, 'circle', ..., {speed: 300}).
        // Same epilepsy-safety pass as shieldBubble (Texxy 2026-05-20) — stacked
        // bursts on every cooldown created a strobing flashlight effect overlaying
        // the matrix. The dual-octagon rotation already signals activation.
        const r = capDamageRadius('aegisMatrix', 120 * area);
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: r,
            visualRadius: getVisualRadius('aegisMatrix', r),
            damage: dmg,
            pierce: 999,
            life: 2.5,
            // S7 §4b: pushback-decay reference (see shieldBubble).
            maxLife: 2.5,
            // C6 2026-08-03 — was #ffd700, identical to a mastered shieldBubble.
            // Aegis is the evolution, so it sits one step brighter on the same ramp.
            color: '#fff3a0',
            isAoe: true,
            pushback: 300,
            isMastered: true,
            weaponId: 'aegisMatrix',
            type: 'aegis_matrix'
        });
        // Retaliation missiles — described in WEAPONS.aegisMatrix.desc but were never
        // implemented. Fires homing-style missiles at the nearest enemies in range
        // (bug reported by Hugo 2026-05-06). Count scales with weapon level.
        // Missile count capped at 8 (was unbounded → 16 at lvl 25) to match the
        // drone-cap pattern on buzzsawSwarm / orbitalDefense (audit 2026-05-22).
        const missileCount = Math.min(8, 4 + Math.floor(w.level / 2));
        const targets = engine.enemies
            .map(e => ({ e, d: Math.hypot(e.x - engine.player.x, e.y - engine.player.y) }))
            .filter(t => t.d < 600 * area)
            .sort((a, b) => a.d - b.d)
            .slice(0, missileCount);
        for (let i = 0; i < missileCount; i++) {
            const target = targets[i % Math.max(1, targets.length)];
            const a = target
                ? Math.atan2(target.e.y - engine.player.y, target.e.x - engine.player.x)
                : (Math.PI * 2 / missileCount) * i;
            engine.projectiles.push({
                x: engine.player.x, y: engine.player.y,
                vx: Math.cos(a) * 350 * engine.player.projSpeedMult,
                vy: Math.sin(a) * 350 * engine.player.projSpeedMult,
                radius: 6, damage: dmg * 0.6, pierce: 1, life: 2.0,
                color: '#ffd700', type: 'missile', weaponId: 'aegisMatrix'
            });
        }
    }
    else if (w.id === 'bouncingBlade') {
        const count = isMastered ? 3 : 1;
        for (let i = 0; i < count; i++) {
            let angle = Math.random() * Math.PI * 2;
            engine.projectiles.push({
                x: engine.player.x, y: engine.player.y,
                vx: Math.cos(angle) * 400 * engine.player.projSpeedMult,
                vy: Math.sin(angle) * 400 * engine.player.projSpeedMult,
                radius: 15 * area,
                damage: dmg,
                pierce: 999,
                chainCount: isMastered ? 8 : 4,
                life: 4,
                color: isMastered ? '#c0c0c0' : '#888888',
                weaponId: 'bouncingBlade',
                type: 'buzzsaw',
                rotation: 0,
                rotSpeed: 15
            });
        }
    }
    else if (w.id === 'buzzsawSwarm') {
        // Drone count capped at 7 (was unbounded) — Texxy reported lvl 24 buzzsaw
        // swarm filling the entire screen (image: hundreds of blades obscuring all
        // gameplay). Each blade has life: 6s and chainCount: 15, so uncapped count
        // produced ~90+ blades on screen at once. Level scaling still applies via
        // global damage + area; count cap just bounds the visual / performance load.
        const count = Math.min(7, 3 + Math.floor(w.level / 2));
        for (let i = 0; i < count; i++) {
            let angle = (Math.PI * 2 / count) * i;
            engine.projectiles.push({
                x: engine.player.x, y: engine.player.y,
                vx: Math.cos(angle) * 600 * engine.player.projSpeedMult,
                vy: Math.sin(angle) * 600 * engine.player.projSpeedMult,
                radius: 25 * area,
                damage: dmg,
                pierce: 999,
                // chainCount 15→8, life 6s→4s. Original spawned 105 chain
                // events per cast (7 blades × 15 chains, each with full-enemy
                // scan). At max CDR, multiple casts overlapped (audit 2026-05-22).
                chainCount: 8,
                life: 4,
                // Description says "Multiple massive BLADES that ricochet wildly" — the base
                // Ricochet Blade is metallic silver, so the evolution should be a brighter
                // chrome/steel, not red flames (Hugo audit 2026-05-12).
                color: '#e0e0e0',
                weaponId: 'buzzsawSwarm',
                type: 'buzzsaw',
                rotation: 0,
                rotSpeed: 25
            });
        }
    }
    else if (w.id === 'toxicCloud') {
        const baseRadius = capDamageRadius('toxicCloud', 50 * area);
        const maxRadius = capDamageRadius('toxicCloud', baseRadius * 2);
        engine.projectiles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0,
            radius: baseRadius,
            // Visual cap applies to whatever the cloud has grown to — damage hitbox
            // (p.radius / maxRadius) stays uncapped so area upgrades scale DPS.
            visualRadius: getVisualRadius('toxicCloud', baseRadius),
            visualMaxRadius: getVisualRadius('toxicCloud', maxRadius),
            // Mastery: cloud grows over time, capped at 2× base. Read in
            // ProjectileSystem's per-frame AoE update (Anubis bug 2026-05-11).
            baseRadius: baseRadius,
            maxRadius: maxRadius,
            growthRate: isMastered ? baseRadius / (4 + w.level) : 0,
            damage: dmg * 0.4,
            pierce: 999,
            // Pool life capped at 15s (was up to 29s at lvl 25). Combined with
            // mastery growth, old clouds piled up dozens-deep (audit 2026-05-22).
            life: Math.min(15, 4 + w.level),
            color: isMastered ? '#00ff00' : '#32cd32',
            isAoe: true,
            isMastered: isMastered,
            weaponId: 'toxicCloud',
            type: 'toxic_cloud'
        });
    }
    else if (w.id === 'venomLash') {
        engine.particleManager.particles.push({
            x: engine.player.x, y: engine.player.y,
            vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
            color: '#ffffff', tint: '#00ff88', type: 'slash', size: 80 * area, rotation: Math.random() * Math.PI * 2
        });
        engine.enemies.forEach(e => {
            if (Math.hypot(e.x - engine.player.x, e.y - engine.player.y) < 120 * area) {
                engine.damageEnemy(e, dmg, { weaponId: w.id });
                e.slowTimer = 2.0;
                if (Math.random() < 0.3) engine.addParticle(e.x, e.y, '#00ff88', 4, 'spark', 1.5);
                
                engine.projectiles.push({
                    x: e.x, y: e.y,
                    vx: 0, vy: 0,
                    radius: 30 * area,
                    damage: dmg * 0.3,
                    pierce: 999,
                    // Pool life capped at 15s (audit 2026-05-22).
                    life: Math.min(15, 2.5 + (w.level * 0.5)),
                    color: '#00ff88',
                    isAoe: true,
                    type: 'toxic_cloud'
                });
            }
        });
    }

    // Apply Augments to newly created projectiles + tag with weaponId for stat tracking.
    for (let i = startIndex; i < engine.projectiles.length; i++) {
        let p = engine.projectiles[i];
        if (!p.weaponId) p.weaponId = w.id;
        if (engine.player.charAugments?.includes('neo_range')) p.life *= 1.2;
        if (engine.player.charAugments?.includes('neo_pierce') && p.pierce !== undefined) p.pierce += 1;
        if (isBeatPush && !p.isAoe) p.pushback = (p.pushback || 0) + 150;
        // neo_chain: ADDS 1 chain to non-AoE projectiles. Use additive so Ricochet Blade
        // (chainCount: 4/8) and other already-chaining projectiles get a bonus instead
        // of being clobbered down to 1 (Texxy bug 2026-05-19).
        if (engine.player.charAugments?.includes('neo_chain') && !p.isAoe && p.pierce !== undefined) {
            p.chainCount = (p.chainCount || 0) + 1;
        }
    }
    
    // sky_twin: Twin Laser Array — fires every shot (was 50% RNG so it felt invisible —
    // Hugo bug 2026-05-06). Renders as TWO parallel lasers offset perpendicular to the
    // shot direction so they're clearly visible side-by-side. SYNERGY: if blaster is
    // mastered, fires 3 pairs (= 6 shots total) in a spread, matching blaster mastery's
    // 3-shot pattern.
    if (engine.player.charAugments?.includes('sky_twin')) {
        let nearest = null;
        let minDist = Infinity;
        engine.enemies.forEach(e => {
            const d = Math.hypot(e.x - engine.player.x, e.y - engine.player.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        if (nearest) {
            const angle = Math.atan2(nearest.y - engine.player.y, nearest.x - engine.player.x);
            // 6-shot fan if blaster is mastered, otherwise 1 pair.
            const blasterMastered = getWeaponStatsAndMastery(engine.save, 'neoBlaster').isMastered;
            const pairCount = blasterMastered ? 3 : 1;
            const offset = 14; // perpendicular spacing — visibly side-by-side
            for (let i = 0; i < pairCount; i++) {
                const a = pairCount > 1 ? angle + (i - 1) * 0.18 : angle;
                const px = Math.cos(a + Math.PI / 2) * offset;
                const py = Math.sin(a + Math.PI / 2) * offset;
                for (const sign of [-1, 1]) {
                    engine.projectiles.push({
                        x: engine.player.x + px * sign,
                        y: engine.player.y + py * sign,
                        vx: Math.cos(a) * 450 * engine.player.projSpeedMult,
                        vy: Math.sin(a) * 450 * engine.player.projSpeedMult,
                        radius: 4 * area, damage: dmg * 0.45, pierce: 2, life: 1.6,
                        color: '#00D4FF', type: 'dual_laser', isMastered: blasterMastered, weaponId: 'neoBlaster'
                    });
                }
            }
        }
    }
}