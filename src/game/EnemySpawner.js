// Enemy spawning + boss spawning logic extracted from GameEngine.
import { ENEMIES, ARENAS, QUANTUM_METEOR_SPRITE } from './Constants';
import { SFXManager } from './SFXManager';
import { selectBossForArena } from './BossSystem';
import { isS7OrLater } from '@/lib/seasonGate';

// Cached at module load (same pattern as other game/ modules).
const _IS_S7 = isS7OrLater();

// ============================================================================
// OUTER GALAXY (S11-S20) — difficulty + tier configuration, added 2026-06-04.
// See docs/SECTORS_11_20_PLAN.md for the design rationale + locked numbers.
// ============================================================================

// Absolute HP/dmg multiplier per sector. Replaces the stock Math.pow(1.2, arenaIndex)
// curve on S11+. Anchored so every sector's Normal mobs are tougher than the
// previous sector's Cosmic mobs (the no-overlap rule).
//
// S6: aggressive curve, S20 ≈ 9M HP mobs — only shield+nuke could clear.
// S7 §4e: flattened so non-shield builds can clear S20 at ~12s TTK on median
// DPS (~12k). End-of-sector S20 Cosmic mob ≈ 2800 (T14 base) × 3.1 × 1.5 × 11
// = ~143k HP. Bosses scale separately via the × 0.3 boss factor.
const OUTER_GALAXY_HP_MULT_S6 = {
    11: 13.55,  12: 21.03,  13: 32.51,  14: 50.44,  15: 78.17,
    16: 121.13, 17: 187.70, 18: 290.90, 19: 450.85, 20: 698.79,
};
const OUTER_GALAXY_HP_MULT_S7 = {
    11: 2,  12: 3,  13: 4,  14: 5,  15: 6,
    16: 7,  17: 8,  18: 9,  19: 10, 20: 11,
};
const OUTER_GALAXY_HP_MULT = _IS_S7 ? OUTER_GALAXY_HP_MULT_S7 : OUTER_GALAXY_HP_MULT_S6;

// Per-sector mob tier bands. Tightens as sectors progress — S11-S12 still see
// some T8 mobs (entry-level Outer Galaxy), S18-S20 spawn ONLY T11-T14 mythic-tier.
// Replaces the stock arenaIndex-based tier formula on S11+.
const OUTER_GALAXY_TIER_BANDS = {
    11: { min: 7,  max: 11 }, 12: { min: 8,  max: 11 },
    13: { min: 9,  max: 12 }, 14: { min: 9,  max: 12 },
    15: { min: 10, max: 13 }, 16: { min: 10, max: 13 },
    17: { min: 11, max: 13 }, 18: { min: 11, max: 14 },
    19: { min: 12, max: 14 }, 20: { min: 12, max: 14 },
};

// 🔴 2026-08-07 — pooled enemy objects were reused with `Object.assign(obj, template)`,
// which ONLY overwrites keys present on the template. Every field the AI wrote at
// runtime survived into the next enemy that reused that object, and EnemyAI pooled
// EVERY dead enemy including bosses and elites. Consequences seen live:
//   • `isElite` persisted → ordinary mobs rendered the full elite aura (gradient +
//     4 stroked arcs per frame). The share of mobs paying that cost grew as a run
//     went on — this is the "the more mobs spawn the lower my fps" report.
//   • `isBoss` persisted → a trash mob could set `sectorBossDefeated` on death and
//     END THE SECTOR RUN early.
//   • `hacked` → spawns green and infights. `latched` → glued to the player.
//     `burrowed` → invisible and un-hittable forever (only void_crawler un-burrows).
// Wiping every own key before the assign is the only future-proof fix: any new
// runtime field added to an enemy later is cleared automatically.
function resetPooledEnemy(obj) {
    for (const k in obj) delete obj[k];
    return obj;
}

// Helper: returns sector index 1-20 for the current arena, or 0 if not a sector.
function getSectorNumber(arenaId) {
    const idx = ARENAS.findIndex(a => a.id === arenaId);
    return idx >= 0 ? idx + 1 : 0;
}

// NovaByte 'nova_nuke' augment effect — fires when a boss spawns. Deals 7% of
// the boss's max HP as a nova explosion centered on the boss. Frontloaded
// damage that scales fairly with boss tier and doesn't touch mob spawns/gold
// (previous designs nuked the field, which became a runaway XP/gold faucet in
// endless — Texxy 2026-05-28).
function triggerBossBurst(engine, boss) {
    const burstDmg = boss.maxHp * 0.07;
    engine.damageEnemy(boss, burstDmg, { weaponId: 'novaBurst' });
    engine.particleManager.createExplosion(boss.x, boss.y, '#ff6b00', 3.5, 'default');
    engine.addParticle(boss.x, boss.y, '#ff6b00', 1, 'shockwave', 4.0, { growthRate: 1200, lineWidth: 12 });
    engine.shake(1.0);
    engine.addDamageText(boss.x, boss.y - 60, 'NOVA BURST!', '#ff6b00', true);
    SFXManager.playWeaponFire('novaPulse');
}

// Lazy-load the meteor sprite sheet exactly once per session (shared across runs).
let _meteorSpriteImage = null;
function getMeteorSpriteImage() {
    if (typeof window === 'undefined') return null;
    if (_meteorSpriteImage) return _meteorSpriteImage;
    _meteorSpriteImage = new Image();
    _meteorSpriteImage.src = QUANTUM_METEOR_SPRITE.url;
    return _meteorSpriteImage;
}

export function spawnEnemies(engine, dt) {
    // ─── SQUAD METEOR ARENA ─────────────────────────────────────────────────
    // Single stationary target — no mob spawns, no boss spawns. Spawned once
    // on first tick, sits dead-centre near the player, animates via the
    // existing EnemyRenderer (16-frame sprite sheet). Has a huge HP pool that
    // can't actually be killed in-run (clamped at 1 HP); the run-end submit
    // is what applies damage to the cloud-side meteor.
    if (engine.arena.id === 'quantum_meteor') {
        if (!engine.meteorSpawned) {
            engine.meteorSpawned = true;
            const sprite = getMeteorSpriteImage();
            const meteor = {
                id: 'squad_meteor_target',
                name: 'Squad Meteor',
                x: engine.player.x,
                y: engine.player.y - 220,
                radius: 220,
                hp: 1e15,                 // effectively immortal — server-side meteor is what matters
                maxHp: 1e15,
                damage: 0,                // doesn't deal contact damage
                speed: 0,                 // stationary
                color: '#f59e0b',
                xp: 0,                    // no XP from hits — leveling is from time/sub-spawns... but we skip those
                tier: 0,
                isSquadMeteor: true,
                isStationary: true,
                isWorldBoss: true,        // reuse the world-boss damage-text/buffer rendering pipeline + immortality clamp
                spriteImage: sprite,
                frameCount: QUANTUM_METEOR_SPRITE.frameCount,
                animationSpeed: QUANTUM_METEOR_SPRITE.animationSpeed,
                // Custom flag — EnemyAI checks this to skip movement and contact damage.
                _isMeteorTarget: true,
            };
            engine.enemies.push(meteor);
            engine.encounteredEnemies.add(meteor.id);
            engine.addDamageText(engine.player.x, engine.player.y - 80, 'SQUAD METEOR — DEAL DAMAGE!', '#f59e0b');
        }
        return;
    }

    if (engine.arena.id === 'world_boss_arena') {
        if (!engine.worldBossSpawned) {
            engine.worldBossSpawned = true;
            const baseMap = {'world_boss_0': 'boss_nebula_devourer', 'world_boss_1': 'boss_plasma_kraken', 'world_boss_2': 'boss_stellar_colossus', 'world_boss_3': 'boss_cosmic_wyrm'};
            const baseBossTemplate = ENEMIES.find(e => e.id === (baseMap[engine.worldBossId] || 'boss_nebula_devourer'));
            // Use cloud HP so the in-game bar reflects the real global boss state.
            // Phase transitions for the world boss are TIME-based (see BossSystem.js)
            // instead of HP-based — otherwise late joiners would spawn straight into
            // Phase 3 frenzy because cloud current_hp is already low.
            const cloudMax = engine.save?.worldBossCloudMaxHp;
            const cloudCur = engine.save?.worldBossCloudCurrentHp;
            const maxHp = (typeof cloudMax === 'number' && cloudMax > 0) ? cloudMax : 50000000;
            const curHp = (typeof cloudCur === 'number' && cloudCur > 0) ? cloudCur : maxHp;
            const boss = {
                ...baseBossTemplate, id: 'world_boss', name: engine.worldBossName, hp: curHp, maxHp: maxHp, damage: 50 * engine.difficulty.enemyDmgMult, isBoss: true, isWorldBoss: true, originalBossId: baseBossTemplate.id
            };
            const angle = Math.random() * Math.PI * 2;
            const dist = 600;
            boss.x = engine.player.x + Math.cos(angle) * dist;
            boss.y = engine.player.y + Math.sin(angle) * dist;
            engine.enemies.push(boss);
            engine.isBossActive = true;
            engine.addDamageText(engine.player.x, engine.player.y - 60, `WARNING: WORLD BOSS DETECTED!`, '#ff0000');
            SFXManager.playBossSpawn();
        }
        return;
    }

    if (engine.arena.duration === Infinity) {
        if (!engine.lastBossSpawnTime) engine.lastBossSpawnTime = 0;
        // Don't spawn a new boss while one is still alive — wait until the current
        // fight ends, then start the 180s timer fresh from that point.
        if (engine.isBossActive) {
            engine.lastBossSpawnTime = engine.time;
        } else if (engine.time > 0 && engine.time - engine.lastBossSpawnTime >= 180) {
            engine.lastBossSpawnTime = engine.time;
            const boss = selectBossForArena(engine.arena.id);
            if (boss) {
                engine.isBossActive = true;
                engine.enemies = [];
                const angle = Math.random() * Math.PI * 2;
                // Clamp at 900 game units so fullscreen monitors don't get punished
                // with long travel times. Matches ~1440px viewport at default zoom.
                const dist = Math.min(900, Math.max(engine.canvas.width / engine.zoom, engine.canvas.height / engine.zoom) / 2 + 50);
                const ex = engine.player.x + Math.cos(angle) * dist;
                const ey = engine.player.y + Math.sin(angle) * dist;
                const progress = engine.time / 300;
                const bossHpMult = 1.0 * engine.difficulty.enemyHpMult * (1.0 + progress * 0.5) * (engine.bossModifiers.hide ? 1.5 : 1.0);
                const bossDmgMult = 1.0 * engine.difficulty.enemyDmgMult * (1.0 + progress * 0.5) * (engine.bossModifiers.fury ? 1.3 : 1.0);
                const speedMult = engine.bossModifiers.frenzy ? 1.3 : 1.0;
                const spawnedBoss = { ...boss, x: ex, y: ey, maxHp: boss.hp * bossHpMult, hp: boss.hp * bossHpMult, damage: boss.damage * bossDmgMult, speedMult };
                engine.enemies.push(spawnedBoss);
                engine.encounteredEnemies.add(boss.id);
                engine.addDamageText(engine.player.x, engine.player.y - 60, `WARNING: ${boss.name} APPROACHING!`, '#ff0000');
                SFXManager.playBossSpawn();
                // NovaByte 'nova_nuke' augment — 7% max HP nova burst on boss spawn.
                if (engine.player.charAugments?.includes('nova_nuke')) {
                    triggerBossBurst(engine, spawnedBoss);
                }
            }
        }
    } else if (engine.time >= engine.arena.duration - 30 && !engine.bossSpawned) {
        engine.bossSpawned = true;

        const arenaIndex = ARENAS.findIndex(a => a.id === engine.arena.id);
        // Boss sectors — Inner Galaxy: S2/S4/S6/S8/S10 (indices 1,3,5,7,9).
        // Outer Galaxy: S12/S14/S16/S18/S20 (indices 11,13,15,17,19) per the
        // locked option-(a) cadence. S20 = guaranteed Pulsar Guardian, others
        // = random rotation handled by selectBossForArena.
        const isBossArena = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].includes(arenaIndex);

        if (isBossArena) {
            engine.isBossActive = true;
            engine.enemies = [];
            const boss = selectBossForArena(engine.arena.id);
            if (boss) {
                const angle = Math.random() * Math.PI * 2;
                // Clamp — see endless boss spawn above for rationale.
                const dist = Math.min(900, Math.max(engine.canvas.width / engine.zoom, engine.canvas.height / engine.zoom) / 2 + 50);
                const ex = engine.player.x + Math.cos(angle) * dist;
                const ey = engine.player.y + Math.sin(angle) * dist;

                // Outer Galaxy bosses use the per-sector lookup × 0.3 — bosses
                // have 30-40× the base HP of a mob already, so applying the full
                // mob multiplier would create a 23M-HP S20 boss that runs out
                // the clock. The 0.3 factor keeps S20 boss kill time around
                // 5 min (mythic but not infinite). Inner Galaxy unchanged.
                const sectorNum = arenaIndex + 1;
                const sectorDifficultyScale = OUTER_GALAXY_HP_MULT[sectorNum]
                    ? OUTER_GALAXY_HP_MULT[sectorNum] * 0.3
                    : Math.pow(1.15, arenaIndex);

                // Cosmic tier spread tightens to 1.5× (vs stock 2.5×) inside
                // Outer Galaxy — the no-overlap rule needs the tier spread compressed.
                const outerCosmic = sectorNum >= 11 && engine.difficulty.id === 'cosmic';
                const enemyHpMult = outerCosmic ? 1.5 : engine.difficulty.enemyHpMult;
                const enemyDmgMult = outerCosmic ? 1.5 : engine.difficulty.enemyDmgMult;

                const bossHpMult = 1.0 * enemyHpMult * (engine.bossModifiers.hide ? 1.5 : 1.0) * sectorDifficultyScale;
                const bossDmgMult = 1.0 * enemyDmgMult * (engine.bossModifiers.fury ? 1.3 : 1.0) * sectorDifficultyScale;
                const speedMult = engine.bossModifiers.frenzy ? 1.3 : 1.0;
                const spawnedBoss = { ...boss, x: ex, y: ey, maxHp: boss.hp * bossHpMult, hp: boss.hp * bossHpMult, damage: boss.damage * bossDmgMult, speedMult };
                engine.enemies.push(spawnedBoss);
                engine.encounteredEnemies.add(boss.id);
                engine.addDamageText(engine.player.x, engine.player.y - 60, `WARNING: ${boss.name} APPROACHING!`, '#ff0000');
                SFXManager.playBossSpawn();
                // NovaByte 'nova_nuke' augment — 7% max HP nova burst on boss spawn.
                if (engine.player.charAugments?.includes('nova_nuke')) {
                    triggerBossBurst(engine, spawnedBoss);
                }
            }
        }
    }

    if (engine.isBossActive) return;
    // Sector boss has been defeated — stop spawning mobs entirely (the run is
    // about to end via the victory check). Was previously letting mobs keep
    // spawning during the 3s post-boss grace, which players could exploit for
    // extra kills/gold/score after the boss was already down.
    if (engine.sectorBossDefeated) return;

    const progress = engine.arena.duration === Infinity ? engine.time / 300 : Math.min(1, engine.time / engine.arena.duration);
    const effectiveProgress = Math.min(1, progress);
    const dynamicRate = engine.envModifiers.enemySpawnRate * (engine.dynamicDifficulty?.spawnRateMult || 1.0);
    // Spawn-interval floor lowered 0.05s → 0.025s (2026-05-28 whale-headroom patch).
    // Combined with the raised DD ceiling (3.5×), this gives strong players actual
    // headroom — was 20 spawns/sec cap, now 40 spawns/sec. Engine handles 200+
    // enemies fine via spatial hash.
    let spawnRate = Math.max(0.025, (1.2 - (1.1 * Math.pow(effectiveProgress, 1.5))) / dynamicRate);

    // Opening-60s base interval cut (sectors only) — base was 1.2s at t=0, which
    // with the 900u spawn-radius clamp left AoE clearers staring at an empty field
    // for the first minute (Anubis + Simon feedback 2026-05-30). Knocks ~33% off
    // the interval for the first 60s of sector runs only; endless and world-boss
    // pacing untouched. Ramps back to normal linearly by t=60.
    if (engine.arena.duration !== Infinity && engine.time < 60) {
        const openingBlend = engine.time / 60; // 0 → 1 across the first 60s
        const openingMult = 0.67 + (0.33 * openingBlend); // 0.67 → 1.0
        spawnRate *= openingMult;
    }

    // Early-game empty-field boost (Anubis feedback 2026-05-29, revised after
    // Texxy follow-up 2026-05-29): the original version gated on rolling DPS,
    // but tier-1 mobs only have 8-14 HP — a player who one-shots them generates
    // tiny DPS totals even while dominating, so the boost never triggered.
    //
    // The real signal is "the field is empty" — if there's nothing on screen
    // in the first 90s and the player has SOME kills (i.e. they're alive and
    // playing), ramp spawns hard so they always have targets. A brand-new
    // struggling player won't have an empty field (mobs pile up faster than
    // they can kill them), so they naturally see no boost. Self-balancing.
    if (engine.arena.duration !== Infinity && engine.time > 5 && engine.time < 90) {
        // Density: how full the field is on a 0–1 scale. 8+ alive enemies = full,
        // 0 = totally empty. Strong clearers will sit near 0 most of the time.
        const density = Math.min(1, engine.enemies.length / 8);
        const emptiness = 1 - density;
        if (emptiness > 0) {
            // Taper out toward 90s so the transition to normal pacing is smooth.
            const timeTaper = 1 - (engine.time / 90);
            // Up to 0.4× spawn interval at fully empty + earliest time (≈ 2.5× rate).
            const boost = 1 - (0.6 * emptiness * timeTaper);
            spawnRate *= boost;
        }
    }

    // Post-nuke spawn boost — halve the spawn interval (≈ 2× rate) for ~5s after a nuke
    // so the wiped field repopulates fast. Set in PickupSystem when a nuke is collected.
    if (engine.postNukeSpawnBoostUntil && engine.time < engine.postNukeSpawnBoostUntil) {
        spawnRate *= 0.5;
    }

    // Outer Galaxy spawn density — +10% on S15-S20 (mythic tier). Locked at
    // sectors 15-20 per the plan. spawnRate is the INTERVAL (lower = faster
    // spawns), so divide by 1.1 to get +10% density. Inner Galaxy untouched.
    const _sectorForDensity = getSectorNumber(engine.arena.id);
    if (_sectorForDensity >= 15 && _sectorForDensity <= 20) {
        spawnRate /= 1.1;
    }

    // End-of-run grace: in the final 30 seconds of a sector run, ramp spawn rate down
    // so players can't farm kills/gold by hugging the timer. Endless skips this (no end).
    // For non-boss sectors there's nothing else to slow the wave; for boss sectors the
    // boss spawn at duration-30 already returns early via isBossActive — this is a no-op there.
    // Whale exemption (2026-05-28): players dominating the run (DD spawn mult ≥ 1.5×)
    // skip the taper entirely. They've earned the wave by performing — choking spawns
    // right before the boss was the worst possible 30s for fast clearers and a major
    // source of the "my score is stuck" complaint from top players.
    const ddSpawnMult = engine.dynamicDifficulty?.spawnRateMult || 1.0;
    if (engine.arena.duration !== Infinity && ddSpawnMult < 1.5) {
        const timeLeft = engine.arena.duration - engine.time;
        if (timeLeft < 30) {
            // Ramp from 1× at 30s left → 6× spawn interval (≈ 1/6 spawn rate) at 0s left.
            const taper = Math.max(0, timeLeft / 30); // 1 → 0
            const slowdown = 1 + (1 - taper) * 5;     // 1 → 6
            spawnRate = spawnRate * slowdown;
        }
    }

    if (Math.random() < dt / spawnRate) {
        const angle = Math.random() * Math.PI * 2;
        // Clamp mob spawn distance at 900 game units — fullscreen monitors
        // were previously getting up to 1600u spawn radius, which doubled
        // travel time vs. windowed play and hurt finish scores.
        const dist = Math.min(900, Math.max(engine.canvas.width / engine.zoom, engine.canvas.height / engine.zoom) / 2 + 50);
        const ex = engine.player.x + Math.cos(angle) * dist;
        const ey = engine.player.y + Math.sin(angle) * dist;

        const isEndless = engine.arena.duration === Infinity;
        // Endless: smoother continuous tier growth instead of stair-step jumps every 60s.
        const arenaIndex = isEndless ? Math.min(9, progress * 4) : ARENAS.findIndex(a => a.id === engine.arena.id);
        const sectorNum = !isEndless && arenaIndex >= 0 ? arenaIndex + 1 : 0;
        const outerBand = OUTER_GALAXY_TIER_BANDS[sectorNum];

        let minTier, maxTier;
        if (outerBand) {
            // Outer Galaxy (S11-S20) — explicit per-sector tier band, no progress-based
            // scaling (bands are already tight by design). T11-T14 mobs land here.
            minTier = outerBand.min;
            maxTier = outerBand.max;
        } else {
            // Inner Galaxy + endless — stock tier formula.
            minTier = Math.max(1, Math.floor(arenaIndex));
            maxTier = Math.floor(arenaIndex) + 1;
            if (effectiveProgress > 0.33) maxTier += 1;
            if (effectiveProgress > 0.66) maxTier += 1;
            if (isEndless) maxTier += Math.floor(progress * 2);
            maxTier = Math.min(10, maxTier);
        }

        let availableEnemies = ENEMIES.filter(e =>
            !e.isBoss &&
            e.tier >= minTier && e.tier <= maxTier
        );

        if (availableEnemies.length === 0) {
            availableEnemies = ENEMIES.filter(e => !e.isBoss && e.tier === 1);
        }

        const type = availableEnemies[Math.floor(Math.random() * availableEnemies.length)];

        // Sector difficulty scale — Outer Galaxy uses the locked exponential lookup
        // (S11≈13.55 → S20≈698.79); Inner Galaxy / endless keep the stock curve.
        let sectorDifficultyScale;
        if (OUTER_GALAXY_HP_MULT[sectorNum]) {
            sectorDifficultyScale = OUTER_GALAXY_HP_MULT[sectorNum];
        } else {
            const sectorBase = isEndless ? 1.12 : 1.2;
            sectorDifficultyScale = Math.pow(sectorBase, arenaIndex);
        }

        // Cosmic tier spread tightens to 1.5× inside Outer Galaxy (vs stock 2.5×).
        // Compresses the Normal→Cosmic gap so the no-overlap rule mathematically holds
        // — every sector's Normal mobs > previous sector's Cosmic mobs.
        const outerCosmic = sectorNum >= 11 && engine.difficulty.id === 'cosmic';
        const _hpMult = outerCosmic ? 1.5 : engine.difficulty.enemyHpMult;
        const _dmgMult = outerCosmic ? 1.5 : engine.difficulty.enemyDmgMult;

        const hpMult = (1.0 + (2.1 * Math.pow(progress, 1.6))) * _hpMult * sectorDifficultyScale;
        const dmgMult = (1.0 + (1.6 * Math.pow(progress, 1.4))) * _dmgMult * sectorDifficultyScale;
        const spdMult = engine.difficulty.speedMult || 1.0;

        // S6+ Option 3: when DD has ramped UP (player is stomping), boost elite
        // spawn chance proportionally. Caps cleanly with DD's own 2.0× ceiling.
        // Gives strong players a visible "in the zone" reward — more elites =
        // more XP (elite ×4) = more levels = more level² score. S5 unchanged.
        const ddMult = engine.dynamicDifficulty?.spawnRateMult || 1.0;
        const eliteDDBoost = (engine._isS6 && ddMult > 1.0) ? ddMult : 1.0;
        if (engine.time > 60 && Math.random() < (0.01 + (progress * 0.04)) * eliteDDBoost) {
            // Elite tier cap lifts to 14 inside Outer Galaxy so mythic-tier mobs
            // can spawn as elites; Inner Galaxy keeps the existing cap at 9.
            const eliteTierCap = outerBand ? 14 : 9;
            const eliteMin = Math.min(eliteTierCap, Math.max(2, maxTier + 1));
            // Cap the elite pool's MAX tier too (fix 2026-06-05): without this,
            // S9–S10 elite rolls could pull T11–T14 Outer Galaxy mobs into Inner
            // Galaxy sectors because the filter was `e.tier >= eliteMin` with no
            // upper bound. Now elites can only come from the sector's tier band.
            const elites = ENEMIES.filter(e => !e.isBoss && e.tier >= eliteMin && e.tier <= eliteTierCap);
            if (elites.length > 0) {
                const elite = elites[Math.floor(Math.random() * elites.length)];
                let newElite = engine.enemyPool.length > 0 ? resetPooledEnemy(engine.enemyPool.pop()) : {};
                Object.assign(newElite, elite);
                newElite.x = ex; newElite.y = ey;
                newElite.maxHp = elite.hp * hpMult * 2.5;
                newElite.hp = newElite.maxHp;
                newElite.damage = elite.damage * dmgMult * 1.5;
                // Elite radius bump cut 1.4× → 1.15× (2026-06-05, Anubis screenshot).
                // High-tier Outer Galaxy mobs already render at sprite size 1.8×
                // radius, so a 1.4× elite multiplier on top made T11+ elites fill
                // half the screen on mobile. 1.15× still reads as "noticeably
                // bigger" thanks to the elite aura ring, without being oppressive.
                newElite.radius = elite.radius * 1.15;
                newElite.speed = elite.speed * 1.2 * spdMult;
                newElite.xp = elite.xp * 4;
                newElite.isElite = true;
                newElite.eliteGoldBonus = 2;

                engine.enemies.push(newElite);
                engine.encounteredEnemies.add(elite.id);
                SFXManager.playEnemySpawn();
                return;
            }
        }

        let newEnemy = engine.enemyPool.length > 0 ? resetPooledEnemy(engine.enemyPool.pop()) : {};
        Object.assign(newEnemy, type);
        newEnemy.x = ex; newEnemy.y = ey;
        newEnemy.speed = type.speed * spdMult;
        newEnemy.maxHp = type.hp * hpMult;
        newEnemy.hp = newEnemy.maxHp;
        newEnemy.damage = type.damage * dmgMult;

        engine.enemies.push(newEnemy);
        engine.encounteredEnemies.add(type.id);

        // Burst-spawn at max DD (2026-05-28 whale-headroom patch): when the player
        // is fully dominating (DD spawn mult ≥ 3.0×), spawn a SECOND mob from the
        // same tier band at a nearby offset angle. Gives a visible "the screen is
        // filling up" feel that matches the power fantasy at peak DD. Average
        // players never reach this threshold so they see no change.
        if (ddSpawnMult >= 3.0) {
            const offsetAngle = angle + (Math.random() - 0.5) * 0.8;
            const ex2 = engine.player.x + Math.cos(offsetAngle) * dist;
            const ey2 = engine.player.y + Math.sin(offsetAngle) * dist;
            let extra = engine.enemyPool.length > 0 ? resetPooledEnemy(engine.enemyPool.pop()) : {};
            Object.assign(extra, type);
            extra.x = ex2; extra.y = ey2;
            extra.speed = type.speed * spdMult;
            extra.maxHp = type.hp * hpMult;
            extra.hp = extra.maxHp;
            extra.damage = type.damage * dmgMult;
            engine.enemies.push(extra);
        }
    }
}