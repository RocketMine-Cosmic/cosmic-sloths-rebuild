// Projectile update logic extracted from GameEngine.
// Handles player projectile movement, AoE, collisions, chains, and enemy projectiles.
import { isS7OrLater, isS8OrLater } from '@/lib/seasonGate';
import { CELL_SIZE, cellKey } from './GameEngine';

// Cached at module load — same pattern as PickupSystem/_IS_S6.
const _IS_S7 = isS7OrLater();
// S8 FPS-fairness gate — flips pool/shield damage ticks from frameCount-based
// (unfair to 30fps mobile) to real-time accumulators (4Hz on every device).
// Held back until W29 rollover so the in-flight S7 leaderboard stays fair.
const _IS_S8 = isS8OrLater();

// Swept circle-vs-point hit test: returns true if the line segment from (px0,py0)
// to (px,py) passes within `r` of point (ex,ey). Handles fast projectiles + moving
// bosses where simple point-in-circle would miss between frames.
// Uses squared distances throughout to skip the sqrt — same result, ~3× faster
// in this hot path.
function sweptHit(px0, py0, px, py, ex, ey, r) {
    const r2 = r * r;
    const dx = px - px0;
    const dy = py - py0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.0001) {
        const ddx = px - ex, ddy = py - ey;
        return ddx * ddx + ddy * ddy < r2;
    }
    // Project enemy onto segment, clamp t to [0,1].
    let t = ((ex - px0) * dx + (ey - py0) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = px0 + dx * t;
    const cy = py0 + dy * t;
    const ddx = ex - cx, ddy = ey - cy;
    return ddx * ddx + ddy * ddy < r2;
}

// Scratch set reused by checkAoe (see comment at its use site).
const _aoeSeen = new Set();

export function updateProjectiles(engine, dt) {
    // Drain deferred spawns whose fireAt has elapsed. Replaces the old
    // setTimeout-based quantum-collapse / nova-pulse-echo pattern — those
    // timers kept firing after game-over and were unbounded if many casts
    // queued up (audit 2026-05-22).
    if (engine.deferredSpawns && engine.deferredSpawns.length > 0) {
        const now = engine.time;
        engine.deferredSpawns = engine.deferredSpawns.filter(d => {
            if (now >= d.fireAt) {
                engine.projectiles.push(d.spawn());
                return false;
            }
            return true;
        });
    }

    engine.projectiles = engine.projectiles.filter(p => {
        if (p.dead) return false;
        // Capture pre-move position so collision checks can sweep the full path
        // travelled this frame. Without this, a 500px/s projectile at 50ms dt
        // (mobile lag spike or fleeing-boss frame) jumps 25px and can teleport
        // PAST a boss that's also moving — players see the visual hit but the
        // single-point collision check missed entirely.
        const px0 = p.x;
        const py0 = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.rotSpeed) p.rotation = (p.rotation || 0) + p.rotSpeed * dt;

        // Trails. Throttled to every 4th frame for heavy-spam weapons when
        // many projectiles are alive — trail particles were the dominant
        // particle source on Laser Nova / Orbital Defense screen-crashes
        // (audit 2026-05-22).
        const _heavyLoad = engine.projectiles.length > 80;
        const _isHeavyTrail = p.weaponId === 'laserNova' || p.weaponId === 'orbitalDefense' || p.weaponId === 'orbitalLasers';
        const _trailEvery = (_heavyLoad && _isHeavyTrail) ? 4 : 2;
        if (!p.isAoe && engine.frameCount % _trailEvery === 0) {
            if (p.type === 'dual_laser') engine.addParticle(p.x, p.y, p.color, 1, 'spark', 0.5);
            else if (p.type === 'lightning') engine.addParticle(p.x + (Math.random()-0.5)*10, p.y + (Math.random()-0.5)*10, p.color, 1, 'spark', 0.8);
            else if (p.type === 'glitch_slash') engine.addParticle(p.x, p.y, p.color, 2, 'spark', 1.0);
            else if (p.type === 'repair_beam') engine.addParticle(p.x, p.y, '#ffffff', 1, 'spark', 0.5);
            else if (p.type === 'missile') engine.addParticle(p.x, p.y, '#ff4500', 3, 'spark', 1.0);
            else if (p.type === 'data_pulse') engine.addParticle(p.x, p.y, p.color, 1, 'spark', 0.5);
            else if (p.type === 'phantom_orb') engine.addParticle(p.x, p.y, p.color, 2, 'spark', 0.8);
            else if (p.type === 'railgun') engine.addParticle(p.x, p.y, '#ffffff', 1, 'spark', 1.2);
            else if (p.type === 'sonic_wave') engine.addParticle(p.x, p.y, p.color, 1, 'spark', 0.5);
            else if (p.type === 'supernova_beam') {
                engine.addParticle(p.x, p.y, '#ffffff', 2, 'spark', 1.5);
                engine.addParticle(p.x, p.y, p.color, 2, 'spark', 1.0);
            }
            else engine.addParticle(p.x, p.y, p.color, 1, 'spark', 0.5);
        }

        if (!p.isAoe) {
            if (p.pierce > 0) {
                const cellSize = 100;
                const cx = Math.floor(p.x / cellSize);
                const cy = Math.floor(p.y / cellSize);
                // Bosses have huge radii (110-160px) that span multiple spatial-hash cells.
                // The 3×3 cell window below can miss them when the boss center sits 2+ cells
                // away from the projectile but the boss radius still overlaps. Check all bosses
                // explicitly so projectiles never "phase through" them — produced the
                // "DPS stalls 20-30s while boss HP doesn't move" symptom.
                // Use the cached per-frame active-boss list to avoid re-filtering
                // engine.enemies for every single projectile (perf hot path).
                const bosses = engine._activeBosses || engine.enemies.filter(e => e.isBoss && e.hp > 0);
                const candidates = [];
                for (let bi = 0; bi < bosses.length; bi++) candidates.push(bosses[bi]);
                for (let x = cx - 1; x <= cx + 1; x++) {
                    for (let y = cy - 1; y <= cy + 1; y++) {
                        const cellEnemies = engine.spatialHash?.get(cellKey(x, y));
                        if (cellEnemies) {
                            cellEnemies.forEach(e => {
                                if (!e.isBoss) candidates.push(e);
                            });
                        }
                    }
                }
                {
                    {
                        {
                            candidates.forEach(e => {
                                if (p.pierce <= 0) return;
                                const hitR = e.radius + (p.radius || 5);
                                // Cheap AABB reject using the swept bounding box (old → new pos).
                                const minPx = Math.min(px0, p.x), maxPx = Math.max(px0, p.x);
                                const minPy = Math.min(py0, p.y), maxPy = Math.max(py0, p.y);
                                if (e.x < minPx - hitR || e.x > maxPx + hitR) return;
                                if (e.y < minPy - hitR || e.y > maxPy + hitR) return;
                                if (sweptHit(px0, py0, p.x, p.y, e.x, e.y, hitR)) {
                                    if (e.id === 'boss_supernova') {
                                        p.pierce = 0;
                                        p.dead = true;
                                        const angle = Math.atan2(engine.player.y - e.y, engine.player.x - e.x);
                                        engine.enemyProjectiles.push({
                                            x: e.x, y: e.y,
                                            vx: Math.cos(angle) * 300,
                                            vy: Math.sin(angle) * 300,
                                            radius: p.radius * 1.5,
                                            damage: e.damage,
                                            life: 3,
                                            color: '#ff4500'
                                        });
                                        return;
                                    }

                                    if (!p.hitList) p.hitList = new Set();
                                    if (!p.hitList.has(e)) {
                                        p.hitList.add(e);
                                        engine.damageEnemy(e, p.damage, p);

                                        // Impact Effects
                                        if (!e.isWorldBoss || Math.random() < 0.1) {
                                            // C3 2026-08-03 — removed engine.shake(0.1).
                                            // shake() is Math.max, so it doesn't compound,
                                            // but a multi-pierce build re-topped the timer
                                            // every frame: the camera held a permanent
                                            // ~1-unit tremor and nothing ever read as an
                                            // event. Kills now own the screenshake.
                                            // The hitstop and hit effect below are
                                            // deliberately kept.
                                            if (Math.random() < 0.05) {
                                                engine.hitStopTimer = 0.01;
                                            }
                                            engine.particleManager.createHitEffect(e.x, e.y, p.color, Math.atan2(p.vy, p.vx), 1.5);
                                        }

                                        if (p.type === 'dual_laser') engine.addParticle(e.x, e.y, p.color, 10, 'spark', 2);
                                        if (p.type === 'stomp') engine.addParticle(e.x, e.y, '#888888', 10, 'spark', 2);
                                        if (p.type === 'glitch_slash') engine.addParticle(e.x, e.y, p.color, 8, 'spark', 2);
                                        if (p.type === 'missile') engine.particleManager.createExplosion(e.x, e.y, '#ff4500', 1.0, 'drone');
                                        if (p.type === 'data_pulse') engine.addParticle(e.x, e.y, p.color, 10, 'spark', 2);
                                        if (p.type === 'phantom_orb') engine.addParticle(e.x, e.y, p.color, 15, 'spark', 1.5);
                                        if (p.type === 'railgun') engine.addParticle(e.x, e.y, '#ffffff', 20, 'spark', 3);
                                        if (p.type === 'sonic_wave') engine.addParticle(e.x, e.y, p.color, 10, 'spark', 2);

                                        p.pierce--;
                                        if (p.pierce <= 0) p.dead = true;

                                        if (p.chainCount > 0) {
                                            p.chainCount--;
                                            let chainTarget = null;
                                            let minChainDist = p.type === 'buzzsaw' ? 600 : 200;
                                            engine.enemies.forEach(ce => {
                                                if (ce !== e && !p.hitList.has(ce)) {
                                                    const d = Math.hypot(ce.x - e.x, ce.y - e.y);
                                                    if (d < minChainDist) { minChainDist = d; chainTarget = ce; }
                                                }
                                            });
                                            if (chainTarget) {
                                                const chainAngle = Math.atan2(chainTarget.y - e.y, chainTarget.x - e.x);
                                                p.x = e.x; p.y = e.y;
                                                const speed = Math.hypot(p.vx, p.vy) || 300;
                                                p.vx = Math.cos(chainAngle) * speed;
                                                p.vy = Math.sin(chainAngle) * speed;
                                                engine.addParticle(e.x, e.y, p.color, 5, 'spark', 1.5);
                                                if (p.dead) {
                                                    p.dead = false;
                                                    p.pierce = 1;
                                                }
                                            }
                                        }

                                        if (p.weaponId === 'supernovaBeam') {
                                            engine.particleManager.createExplosion(e.x, e.y, '#ffaa00', 1.5);
                                            engine.enemies.forEach(ce => {
                                                if (ce === e || Math.abs(ce.x - e.x) > 60 || Math.abs(ce.y - e.y) > 60) return;
                                                if (Math.hypot(ce.x - e.x, ce.y - e.y) < 60) {
                                                    engine.damageEnemy(ce, p.damage * 0.3, p);
                                                }
                                            });
                                        }

                                        if (p.isMastered && p.weaponId === 'napBeam') {
                                            let nearest = null;
                                            let minDist = 150;
                                            engine.enemies.forEach(ce => {
                                                if (ce !== e && !p.hitList.has(ce)) {
                                                    const d = Math.hypot(ce.x - e.x, ce.y - e.y);
                                                    if (d < minDist) { minDist = d; nearest = ce; }
                                                }
                                            });
                                            if (nearest) {
                                                engine.damageEnemy(nearest, p.damage * 0.5, p);
                                                p.hitList.add(nearest);
                                                engine.addParticle(nearest.x, nearest.y, '#4169E1', 5);
                                                const distToNearest = Math.hypot(nearest.x - e.x, nearest.y - e.y);
                                                const chainAngle = Math.atan2(nearest.y - e.y, nearest.x - e.x);
                                                engine.projectiles.push({
                                                    x: e.x + (nearest.x - e.x) / 2,
                                                    y: e.y + (nearest.y - e.y) / 2,
                                                    vx: Math.cos(chainAngle) * 0.01,
                                                    vy: Math.sin(chainAngle) * 0.01,
                                                    radius: distToNearest / 3,
                                                    damage: 0,
                                                    pierce: 0,
                                                    life: 0.15,
                                                    color: '#4169E1',
                                                    type: 'lightning'
                                                });
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }
        } else {
            const checkAoe = (callback, extraRadius = 0) => {
                const cellSize = 100;
                const r = p.radius + extraRadius;
                const minX = Math.floor((p.x - r - 50) / cellSize);
                const maxX = Math.floor((p.x + r + 50) / cellSize);
                const minY = Math.floor((p.y - r - 50) / cellSize);
                const maxY = Math.floor((p.y + r + 50) / cellSize);
                // PERF 2026-08-07 — reuse one module-level Set instead of
                // allocating a fresh one per AoE projectile per frame. Safe
                // because checkAoe runs synchronously to completion and never
                // nests (the callbacks only read/damage enemies).
                const seen = _aoeSeen;
                seen.clear();
                // Always include active bosses — their large radii can miss the cell window.
                // Use the cached per-frame active-boss list to skip the full enemy scan.
                const bosses = engine._activeBosses || engine.enemies;
                for (let bi = 0; bi < bosses.length; bi++) {
                    const e = bosses[bi];
                    if (e.isBoss && e.hp > 0 && !seen.has(e)) {
                        seen.add(e);
                        callback(e);
                    }
                }
                for (let x = minX; x <= maxX; x++) {
                    for (let y = minY; y <= maxY; y++) {
                        const cellEnemies = engine.spatialHash?.get(cellKey(x, y));
                        if (cellEnemies) cellEnemies.forEach(e => {
                            if (!seen.has(e)) {
                                seen.add(e);
                                callback(e);
                            }
                        });
                    }
                }
            };

            if (p.pulse) {
                p.radius += 500 * dt;
                // Grow visualRadius in lockstep, clamped to visualMaxRadius (S6 cap).
                // Damage hitbox (p.radius) stays uncapped so area upgrades still scale DPS.
                if (p.visualRadius != null && p.visualMaxRadius != null) {
                    p.visualRadius = Math.min(p.visualMaxRadius, p.visualRadius + 500 * dt);
                }
                checkAoe(e => {
                    if (Math.abs(e.x - p.x) > p.radius + e.radius || Math.abs(e.y - p.y) > p.radius + e.radius) return;
                    if (Math.hypot(e.x - p.x, e.y - p.y) < p.radius) {
                        if (!p.hitList) p.hitList = new Set();
                        if (!p.hitList.has(e)) {
                            p.hitList.add(e);
                            engine.damageEnemy(e, p.damage, p);
                            engine.addParticle(e.x, e.y, p.color, 5);
                        }
                    }
                });
            } else if (p.pushback) {
                p.x = engine.player.x;
                p.y = engine.player.y;
                // p.radius = uncapped damage hitbox. visualRadius (if set) is render-only.
                // S8+: real-time 4Hz tick (fair across FPS). S7 and earlier: legacy
                // frameCount % 15 tick — kept to avoid retroactively changing the
                // in-flight S7 leaderboard.
                let _shieldDoTick;
                if (_IS_S8) {
                    p._tickAcc = (p._tickAcc || 0) + dt;
                    _shieldDoTick = p._tickAcc >= 0.25;
                    if (_shieldDoTick) p._tickAcc -= 0.25;
                } else {
                    _shieldDoTick = engine.frameCount % 15 === 0;
                }
                checkAoe(e => {
                    if (Math.abs(e.x - p.x) > p.radius + e.radius || Math.abs(e.y - p.y) > p.radius + e.radius) return;
                    const dist = Math.hypot(e.x - p.x, e.y - p.y);
                    if (dist < p.radius) {
                        if (_shieldDoTick) {
                            engine.damageEnemy(e, p.damage, p);
                            if (p.burn) {
                                engine.addParticle(e.x, e.y, '#ff4500', 3);
                            }
                        }
                        const pushResist = e.isWorldBoss ? 0 : (e.isBoss ? 0.05 : (e.isTank ? 0.2 : 1));
                        const isUnstoppable = e.isBoss && engine.bossModifiers.unstoppable;
                        if (!isUnstoppable && pushResist > 0) {
                            const angle = Math.atan2(e.y - p.y, e.x - p.x);
                            // S7 §4b: pushback decays in the final 25% of the shield's
                            // lifetime. Creates a "press-in" window where enemies can
                            // close the gap instead of being held off forever. p.maxLife
                            // is set at spawn by WeaponSystem; missing → no decay (legacy).
                            let pushbackMult = 1.0;
                            if (_IS_S7 && p.maxLife) {
                                const lifeFrac = 1 - (p.life / p.maxLife);
                                if (lifeFrac > 0.75) {
                                    pushbackMult = Math.max(0, 1 - (lifeFrac - 0.75) / 0.25);
                                }
                            }
                            e.x += Math.cos(angle) * p.pushback * pushResist * pushbackMult * dt;
                            e.y += Math.sin(angle) * p.pushback * pushResist * pushbackMult * dt;
                        }
                    }
                });

                // Mastered Shield Bubble fires a beam on a fixed cadence. S8+:
                // real-time 0.5s accumulator so a 30fps phone fires as often as a
                // 60fps PC (the frameCount tick below halved its rate at 30fps —
                // same FPS-fairness bug already fixed for pool/shield damage).
                let _beamDoTick;
                if (_IS_S8) {
                    p._beamAcc = (p._beamAcc || 0) + dt;
                    _beamDoTick = p._beamAcc >= 0.5;
                    if (_beamDoTick) p._beamAcc -= 0.5;
                } else {
                    _beamDoTick = engine.frameCount % 30 === 0;
                }
                if (p.isMastered && p.weaponId === 'shieldBubble' && _beamDoTick) {
                    const inRange = [];
                    checkAoe(e => {
                        if (Math.hypot(e.x - p.x, e.y - p.y) < p.radius * 2) inRange.push(e);
                    }, p.radius);  // Use uncapped damage radius
                    if (inRange.length > 0) {
                        const target = inRange[Math.floor(Math.random() * inRange.length)];
                        const angle = Math.atan2(target.y - p.y, target.x - p.x);
                        engine.projectiles.push({
                            x: p.x, y: p.y,
                            vx: Math.cos(angle) * 400,
                            vy: Math.sin(angle) * 400,
                            radius: 3,
                            damage: p.damage * 0.5,
                            pierce: 1,
                            life: 1,
                            color: '#FFD700',
                            type: 'beam',
                            // Spawned inside updateProjectiles (NOT fireWeaponLogic) so it
                            // bypasses the weaponId fallback — tag explicitly (Anubis bug
                            // 2026-05-17, 81% untracked AoE).
                            weaponId: 'shieldBubble'
                        });
                    }
                }
            } else {
                // Toxic Emitter mastery: clouds grow over time (Anubis bug 2026-05-11).
                // Growth happens every frame for smooth visual scaling, capped at maxRadius.
                // `radius` = damage hitbox (uncapped). `visualRadius` (when set) is what
                // gets drawn — grows in lockstep but clamped to visualMaxRadius.
                if (p.growthRate && p.maxRadius && p.radius < p.maxRadius) {
                    p.radius = Math.min(p.maxRadius, p.radius + p.growthRate * dt);
                    if (p.visualRadius != null && p.visualMaxRadius != null) {
                        p.visualRadius = Math.min(p.visualMaxRadius, p.visualRadius + p.growthRate * dt);
                    }
                }
                // S8+ (Briantjeuh Squad Meteor bug, 2026-07-08): pools tick at
                // real-time 4Hz — same DPS on 30fps phones, 60fps laptops, and
                // 144Hz PCs. S7 and earlier: legacy frameCount % 15 tick (kept
                // so the in-flight S7 leaderboard isn't retroactively changed).
                let _poolDoTick;
                if (_IS_S8) {
                    p._tickAcc = (p._tickAcc || 0) + dt;
                    _poolDoTick = p._tickAcc >= 0.25;
                    if (_poolDoTick) p._tickAcc -= 0.25;
                } else {
                    _poolDoTick = engine.frameCount % 15 === 0;
                }
                if (_poolDoTick) {
                    checkAoe(e => {
                        if (Math.abs(e.x - p.x) > p.radius + e.radius || Math.abs(e.y - p.y) > p.radius + e.radius) return;
                        if (Math.hypot(e.x - p.x, e.y - p.y) < p.radius) {
                            engine.damageEnemy(e, p.damage, p);
                            engine.addParticle(e.x, e.y, p.weaponId === 'napalm' ? (p.isMastered ? '#00BFFF' : '#ff4500') : p.color, 2);
                            // Mastered Napalm: 50% slow for 1.5s (re-applied each tick
                            // while standing in the pool). Was 0.5s — too short to feel
                            // (Anubis bug 2026-05-11). EnemyAI already applies 50% slow
                            // when slowTimer > 0, so this now matches the description.
                            if (p.isMastered && p.weaponId === 'napalm') {
                                e.slowTimer = 1.5;
                            }
                            // Hellfire (evolved Napalm) inherits the slow — evolutions
                            // should retain their parent's mastery effects. Slightly
                            // longer than Napalm's 1.5s so the upgrade feels meaningful
                            // (Anubis bug 2026-05-27).
                            if (p.weaponId === 'hellfire') {
                                e.slowTimer = 2.0;
                            }
                        }
                    });
                }
            }
        }
        return p.life > 0;
    });

    // Global projectile soft cap. Any unbounded weapon-stacking edge case
    // (current or future) gets caught here — once we cross 200 active
    // projectiles, drop the oldest to keep the per-frame iterate+filter
    // cost bounded. The cap is high enough that no legit build hits it
    // (audit 2026-05-22).
    if (engine.projectiles.length > 200) {
        engine.projectiles.splice(0, engine.projectiles.length - 200);
    }

    if (engine.enemyProjectiles) {
        engine.enemyProjectiles = engine.enemyProjectiles.filter(p => {
            if (p.dead) return false;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            if (Math.hypot(engine.player.x - p.x, engine.player.y - p.y) < engine.player.radius + p.radius) {
                engine.takeDamage(p.damage, p.ownerName || 'Enemy Projectile');
                p.dead = true;
            }
            return p.life > 0;
        });
    }
}