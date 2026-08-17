// Enemy update + AI logic extracted from GameEngine.
// Handles death/drops, custom enemy mechanics, movement, attacks, and boss abilities.
import { SFXManager } from './SFXManager';
import { SaveManager } from './SaveManager';
import { updateBossAbilities } from './BossSystem';
import { CELL_SIZE, cellKey } from './GameEngine';
import { isS6OrLater, isBossVacuumEnabled, isS7OrLater } from '@/lib/seasonGate';

// Cached at module load — see PickupSystem for rationale.
const _IS_S6 = isS6OrLater();
const _IS_S7 = isS7OrLater();
// Boss-drop XP auto-vacuum — gated to flip on at the W21→W22 weekly rollover
// (Mon May 25 2026 00:00 UTC). Tags the boss's XP orb with `magnetSweep` so it
// reuses the existing magnet_power vacuum (smooth ~0.5s sweep, no teleport).
// Only the boss's own XP drop is tagged — scattered mob pickups still require
// magnet stat / walking, preserving the run-long pickup loop. Anubis 2026-05-22.
const _BOSS_VAC_ENABLED = isBossVacuumEnabled();

export function updateEnemies(engine, dt) {
    for (let i = engine.enemies.length - 1; i >= 0; i--) {
        let e = engine.enemies[i];
        if (e.hp <= 0) {
            SFXManager.playEnemyDeath();
            engine.kills++;
            if (e.isBoss) engine.bossesKilled++;
            else if (e.isElite) engine.elitesKilled++;
            engine.enemyKills[e.id] = (engine.enemyKills[e.id] || 0) + 1;
            // Credit the kill to whichever weapon dealt the killing blow.
            if (e._lastWeaponId) {
                engine.weaponKills[e._lastWeaponId] = (engine.weaponKills[e._lastWeaponId] || 0) + 1;
            }
            // 🔴 PERF 2026-08-03 — THE BIG ONE. This block used to call
            // SaveManager.save() on EVERY SINGLE KILL, and that does, synchronously:
            //   1. JSON.stringify of the ~100-key save blob
            //   2. localStorage.setItem — SYNCHRONOUS, and SQLite-backed on iOS
            //      WebKit, so genuine disk I/O on the main thread
            //   3. dispatchEvent('saveUpdated'), which runs listeners synchronously
            //   4. → CurrencyContext (App.jsx wraps the whole app) does setSave(),
            //      i.e. a React re-render of the app tree, PER KILL
            //
            // The 8s debounce inside SaveManager only covers the NETWORK sync. Its
            // own comment says it "coalesces bursts of in-game saves (gold pickups,
            // kills)" — true of the network call, false of everything above it, and
            // that comment is why nobody looked again.
            //
            // Player-visible symptoms this produced: phones overheating, laptops
            // struggling, and Quantum Collapse / Toxic Emitter appearing to "lose
            // DPS". Those two are the game's best mass-killers (both pierce 999 —
            // QC is a triple-pulse expanding ring, toxic pools grow at mastery), so
            // one tick could kill 20-30 enemies = 20-30 full serialise + disk write
            // + app re-render cycles IN A SINGLE FRAME. The frame blows out and the
            // game frame-starves; it reads as damage loss but it's the loop stalling.
            //
            // The per-kill save also achieved nothing: `engine.enemyKills` is
            // accumulated in memory anyway and gameOver() persists it at run end.
            // A 30s throttle is kept purely so a mid-run crash doesn't lose bestiary
            // counts — same protection, ~1/1000th of the cost.
            if (engine.save) {
                // Free after the first assignment — same object reference, so
                // damageEnemy's kill-milestone lookup still sees live counts.
                engine.save.enemyKills = engine.enemyKills;
                const now = engine.time || 0;
                if (now - (engine._lastKillSaveAt || 0) >= 30) {
                    engine._lastKillSaveAt = now;
                    SaveManager.save(engine.save);
                }
            }

            if (engine.player.charAugments?.includes('dat_drain')) {
                engine.player.drainCount = (engine.player.drainCount || 0) + 1;
                if (engine.player.drainCount >= 10) {
                    engine.player.hp = Math.min(engine.player.maxHp, engine.player.hp + engine.player.maxHp * 0.01);
                    engine.callbacks.onHpChange(engine.player.hp, engine.player.maxHp);
                    engine.addParticle(engine.player.x, engine.player.y, '#8A2BE2', 5, 'glow');
                    engine.player.drainCount = 0;
                }
            }
            if (engine.player.charAugments?.includes('code_virus')) {
                engine.enemies.forEach(other => {
                    if (other !== e && Math.hypot(other.x - e.x, other.y - e.y) < 100) {
                        other.hacked = true;
                        other.color = '#39FF14';
                    }
                });
            }

            if (engine.characterId === 'novabyte' && Math.random() < 0.10 * (engine.masteryAbilityBoost?.chainExplosionMult || 1.0) && !e.isBoss) {
                engine.particleManager.createExplosion(e.x, e.y, '#FF007F', 1.5 * engine.player.areaMult, 'default');
                engine.enemies.forEach(other => {
                    if (other !== e && Math.hypot(other.x - e.x, other.y - e.y) < 100 * engine.player.areaMult) {
                        // NovaByte's on-kill chain explosion — tagged so it shows
                        // up in the post-run breakdown.
                        engine.damageEnemy(other, 20 * engine.player.damageMult, { weaponId: 'novabyteChain' });
                    }
                });
            }

            if (engine.characterId === 'pandypaws' && Math.random() < 0.05 * (engine.masteryAbilityBoost?.scrapDropMult || 1.0) && !e.isBoss) {
                engine.pickups.push({ x: e.x + Math.random()*20-10, y: e.y + Math.random()*20-10, type: 'scrap', color: '#aaaaaa', icon: '⚙️' });
            }

            let xpValue = e.xp;
            if (e.isBoss && engine.bossModifiers.hide) {
                xpValue *= 1.5;
            }

            const progress = engine.arena?.duration === Infinity ? engine.time / 300 : Math.min(1, engine.time / (engine.arena?.duration || 300));
            xpValue *= (1.0 + Math.min(1.0, progress * 1.5));

            // Boss XP drop auto-vacuums to the player on death (W22+) so the
            // "crucial final orb" can't be missed when the boss dies off-screen
            // or the player has no magnet stat. Reuses the existing magnetSweep
            // mechanic from magnet_power pickups — see PickupSystem.js. Only
            // tags this single XP pickup; other loot stays as-is.
            engine.pickups.push({
                x: e.x, y: e.y, type: 'xp', value: xpValue, color: '#00ffcc',
                ...((_BOSS_VAC_ENABLED && e.isBoss) ? { magnetSweep: true } : {})
            });

            engine.particleManager.createExplosion(e.x, e.y, e.color, e.isBoss ? 2 : 0.6, e.id);
            // C3 2026-08-03 — there was no elite branch: killing an elite shook
            // the camera 0.05, i.e. LESS than a single projectile landing a hit
            // (0.1, since removed). An elite kill is an event and should feel
            // like one, without approaching the boss-kill 0.5.
            engine.shake(e.isBoss ? 0.5 : (e.isElite ? 0.22 : 0.05));

            if (engine.killEffect !== 'none') {
                engine.particleManager.createKillEffect(e.x, e.y, engine.killEffect);
            }

            if (e.isBoss) {
                const isEndless = engine.arena.duration === Infinity;
                const fragmentReward = 1 + (engine.bossModifiers.frenzy ? 1 : 0) + (engine.bossModifiers.bullet_hell ? 2 : 0);
                // Auto-credit fragments directly to the save instead of dropping a pickup the
                // player might miss (especially in endless mode where the boss can die far away,
                // or when quitting/dying during the post-boss grace window).
                let creditedFrags = 0;
                if (engine.callbacks.onFragmentFound) {
                    const nftRelicMult = engine.save?.nftRelicMultiplier || 1.0;
                    const finalFrags = (nftRelicMult > 1.0 && Math.random() < (nftRelicMult - 1.0))
                        ? fragmentReward + 1
                        : fragmentReward;
                    // Accumulate per-run so saveScore credits these to PlayerSave at run end.
                    // Was missing — boss frags showed in HUD but never reached the server.
                    engine.runFragments = (engine.runFragments || 0) + finalFrags;
                    // Boss half, kept separately for save_score's parameter split (D-78).
                    engine.bossFragments = (engine.bossFragments || 0) + finalFrags;
                    engine.callbacks.onFragmentFound(finalFrags);
                    creditedFrags = finalFrags;
                    engine.addDamageText(e.x, e.y - 40, `+${finalFrags} Relic Fragment!`, '#a855f7');
                    engine.addParticle(e.x, e.y, '#a855f7', 20, 'glow', 2);
                }

                // NovaByte 'nova_nuke' augment is handled at boss SPAWN now (see
                // EnemySpawner.js) — boss-death timing was useless because the
                // boss-spawn code wipes all mobs, leaving nothing to nuke at death.

                let extraGold = 1000;
                if (engine.bossModifiers.fury) extraGold += 500;
                if (engine.bossModifiers.unstoppable) extraGold += 1000;
                if (engine.bossModifiers.regen) extraGold += 800;

                // In endless, gold is purely time-based — boss kills don't credit gold.
                if (isEndless) extraGold = 0;

                let creditedGold = 0;
                if (extraGold > 0) {
                    // Auto-credit boss gold directly to the run total instead of dropping
                    // a pickup the player must walk over. Players were missing the boss
                    // gold pile when the boss died off-screen or when the victory modal
                    // popped before they reached it (player feedback 2026-05-03). Applies
                    // to BOTH endless and normal arenas. Only the boss's own gold pile
                    // is auto-credited — regular enemy drops still spawn as pickups.
                    const nftGoldMult = engine.save?.nftGoldMultiplier || 1.0;
                    // L2 (S6+): NFT mult already folded into player.goldMult — skip.
                    const nftFactor = _IS_S6 ? 1.0 : nftGoldMult;
                    // Cap boss-credit gold at 3000 per kill. Without this, whales with stacked
                    // multipliers (Synthbeats + maxed gold talents + relic + NFT + cosmic difficulty
                    // + pool bias) earned 10–15k per boss × 13 bosses = 140k+ from bosses alone in
                    // a single 3:30 run, breaking the leaderboard economy. Normal players cap out
                    // at ~2750 (base 1000 + fury 500 + unstoppable 1000 + 1.1× nft) so this only
                    // bites runaway whale stacks. (Balance pass 2026-05-06 — Tijckers 249k run.)
                    const finalGold = Math.min(3000, Math.floor(extraGold * engine.player.goldMult * nftFactor));
                    engine.gold += finalGold;
                    // Boss half, kept separately for save_score's parameter split (D-78).
                    engine.bossGold = (engine.bossGold || 0) + finalGold;
                    engine.callbacks.onGoldChange(engine.gold);
                    creditedGold = finalGold;
                    engine.addDamageText(e.x, e.y - 20, `+${finalGold.toLocaleString()} GOLD`, '#ffd700');
                }

                engine.addDamageText(e.x, e.y - 20, `BOSS DEFEATED!`, '#ffff00');
                engine.isBossActive = false;
                // In sectors, killing the boss ends the level (mobs stop spawning,
                // brief grace for VFX/loot recap, then victory triggers via the
                // engine update loop). Endless skips this — bosses keep cycling.
                if (engine.arena.duration !== Infinity && engine.arena.id !== 'world_boss_arena') {
                    engine.sectorBossDefeated = true;
                }

                // Endless / raid: persist a cloud checkpoint so this boss kill's
                // progress survives even a device wipe / app reinstall. Fire-and-forget,
                // never blocks gameplay. saveScore validates + de-dupes on recovery.
                if (isEndless || engine.arena.id === 'world_boss_arena') {
                    try {
                        const stats = engine._runStats();
                        import('@/api/base44Client').then(({ base44 }) => {
                            base44.functions.invoke('checkpointRun', { stats }).catch(() => {});
                        });
                    } catch {}
                }

                // Boss-loot recap pinned to the PLAYER (always on-screen) so the player
                // can never miss what they earned even if the boss died far off-screen.
                // Both gold + frags are auto-credited now, so always show both numbers.
                const recap = [];
                if (creditedFrags > 0) recap.push({ text: `+${creditedFrags} RELIC FRAGMENT${creditedFrags > 1 ? 'S' : ''}`, color: '#c084fc' });
                if (creditedGold > 0) recap.push({ text: `+${creditedGold.toLocaleString()} GOLD`, color: '#ffd700' });
                recap.forEach((line, idx) => {
                    engine.addDamageText(engine.player.x, engine.player.y - 110 - idx * 22, line.text, line.color, true);
                });

                // Clear any in-flight enemy projectiles + the boss's own telegraph
                // warnings so attacks don't continue after death.
                if (engine.enemyProjectiles) engine.enemyProjectiles.length = 0;
                e._bombWarning = null;
                e._novaWarning = null;
                e._meteorWarning = null;
                e.chargeDash = null;
                // Brief 3s grace after the boss dies — boss gold + relic fragments are
                // now auto-credited above, so this is just a visual beat for the
                // explosion/recap text before the victory modal pops. (Was 10s and was
                // crediting the whole sector's wave drops; now reverted to a small
                // post-kill pause only.)
                engine.postBossGraceUntil = engine.time + 3;
            } else {
                const isEndless = engine.arena.duration === Infinity;
                if (!isEndless) {
                    const baseGoldChance = 0.35;
                    if (Math.random() < baseGoldChance + (engine.player.luck * 0.02)) {
                        const maxGoldValue = 35;
                        const goldValue = Math.min(maxGoldValue, 2 + Math.floor(engine.time / 90) * 1);
                        const goldMultiplier = e.isElite ? (e.eliteGoldBonus || 1.5) : 1;
                        const goldCount = e.isElite ? 1 : 1;
                        for (let gi = 0; gi < goldCount; gi++) {
                            engine.pickups.push({ x: e.x + Math.random()*20-10, y: e.y + Math.random()*20-10, type: 'gold', value: goldValue * goldMultiplier, color: '#ffd700' });
                        }
                    }
                    if (engine.player.charAugments?.includes('code_hack') && Math.random() < 0.05) {
                        engine.pickups.push({ x: e.x, y: e.y, type: 'gold', value: 10, color: '#ffd700' });
                    }
                } else if (engine.characterId === 'synthbeats' && Math.random() < 0.10) {
                    // Endless: regular enemies don't drop gold for anyone EXCEPT SynthBeats —
                    // her bribe-death mechanic is gold-gated, so the kit needs a self-funding
                    // trickle to remain viable in endless. ~10% drop rate of 5 gold = enough
                    // to fund roughly one bribe per ~50 kills.
                    engine.pickups.push({ x: e.x + Math.random()*20-10, y: e.y + Math.random()*20-10, type: 'gold', value: 5, color: '#ffd700' });
                }
                // S7 §4d: power pickup drop rate halved. Removes the AFK payoff
                // loop (luck → nukes → screen wipe → repeat). Luck builds still
                // see more drops than non-luck, just at half the previous rate.
                const dropBase  = _IS_S7 ? 0.005  : 0.01;
                const dropLuck  = _IS_S7 ? 0.0005 : 0.001;
                if (Math.random() < dropBase + (engine.player.luck * dropLuck)) {
                    const pickupTypes = [
                        { type: 'nuke', color: '#ff0000', icon: '☢️' },
                        { type: 'magnet_power', color: '#0000ff', icon: '🧲' },
                        { type: 'shield_power', color: '#ffff00', icon: '🛡️' }
                    ];
                    const pt = pickupTypes[Math.floor(Math.random() * pickupTypes.length)];
                    engine.pickups.push({ x: e.x + Math.random()*20-10, y: e.y + Math.random()*20-10, type: pt.type, color: pt.color, icon: pt.icon });
                }
            }

            // 2026-08-07 — never pool bosses. Boss objects carry a large amount of
            // bespoke state (telegraph arrays, phase flags, weakSide, heads, custom
            // sprite refs) and reusing one as a trash mob was how `isBoss` leaked
            // into ordinary enemies. Spawner also resets pooled objects now, but
            // bosses are rare enough that pooling them buys nothing.
            if (!e.isBoss) engine.enemyPool.push(e);
            engine.enemies[i] = engine.enemies[engine.enemies.length - 1];
            engine.enemies.pop();
            continue;
        }

        // Squad Meteor target — stationary, no contact damage, no AI. Just sits
        // there and absorbs incoming damage. The world-boss hp-clamp in
        // GameEngine.damageEnemy() keeps hp ≥ 1 so it never dies in-run; the
        // run-end damage submit is what applies progress to the cloud meteor.
        if (e._isMeteorTarget) {
            continue;
        }

        const dx = engine.player.x - e.x;
        const dy = engine.player.y - e.y;
        const dist = Math.hypot(dx, dy);

        // --- Custom Enemy Mechanics ---
        if (e.hacked) {
            let nearest = null;
            let minDist = 400;
            engine.enemies.forEach(other => {
                if (other !== e && !other.hacked && Math.hypot(other.x - e.x, other.y - e.y) < minDist) {
                    minDist = Math.hypot(other.x - e.x, other.y - e.y);
                    nearest = other;
                }
            });

            if (nearest) {
                const hx = nearest.x - e.x;
                const hy = nearest.y - e.y;
                const hdist = Math.hypot(hx, hy);
                const currentSpeed = e.speed * (e.speedMult || 1) * 60 * dt;
                e.x += (hx / hdist) * currentSpeed;
                e.y += (hy / hdist) * currentSpeed;

                if (hdist < e.radius + nearest.radius) {
                    if (!e.attackTimer || e.attackTimer <= 0) {
                        // Tag hacked-enemy infighting so it shows up in the post-run
                        // weapon breakdown instead of vanishing into "Untracked Damage".
                        // CodeBreaker's hack mechanic was the dominant culprit in
                        // long endless runs (AnubisDominus 2026-05-17, 93% untracked).
                        engine.damageEnemy(nearest, e.damage, { weaponId: 'hackedInfight' });
                        e.hp -= nearest.damage;
                        e.attackTimer = 1.0;
                    }
                }
            } else {
                const pdx = engine.player.x - e.x;
                const pdy = engine.player.y - e.y;
                const pdist = Math.hypot(pdx, pdy);
                const currentSpeed = e.speed * (e.speedMult || 1) * 60 * dt;
                if (pdist > 100) {
                    e.x += (pdx / pdist) * currentSpeed;
                    e.y += (pdy / pdist) * currentSpeed;
                }
            }
            if (e.attackTimer > 0) e.attackTimer -= dt;
            e.hp -= e.maxHp * 0.05 * dt;
            continue;
        }

        if (e.isWorldBoss) {
            e.damage += dt * 15;
            e.speedMult = (e.speedMult || 1) + (dt * 0.05);
        }
        if (e.id === 'void_crawler') {
            if (!e.burrowTimer) e.burrowTimer = 3;
            e.burrowTimer -= dt;
            if (e.burrowTimer <= 0) {
                e.burrowed = !e.burrowed;
                e.burrowTimer = e.burrowed ? 2 : 3;
            }
        }
        if (e.id === 'quantum_swarm') {
            let nearby = 0;
            const cellSize = 100;
            const cx = Math.floor(e.x / cellSize);
            const cy = Math.floor(e.y / cellSize);
            for (let x = cx - 1; x <= cx + 1; x++) {
                for (let y = cy - 1; y <= cy + 1; y++) {
                    const cellEnemies = engine.spatialHash?.get(cellKey(x, y));
                    if (cellEnemies) {
                        cellEnemies.forEach(other => {
                            if (other.id === 'quantum_swarm' && Math.hypot(other.x - e.x, other.y - e.y) < 100) nearby++;
                        });
                    }
                }
            }
            e.speedMult = 1 + (nearby * 0.2);
        }
        if (e.id === 'eclipse_harpy') {
            if (!e.diveTimer) e.diveTimer = 5;
            e.diveTimer -= dt;
            if (e.diveTimer <= 0) {
                e.speedMult = 3;
                e.diveTimer = 5;
            }
            if (e.speedMult > 1) e.speedMult -= dt * 2;
            else e.speedMult = 1;
        }
        if (e.id === 'black_hole_tick') {
            if (dist < engine.player.radius + e.radius && !e.latched) {
                e.latched = true;
            }
            if (e.latched) {
                e.x = engine.player.x;
                e.y = engine.player.y;
                e.radius += dt * 2;
                // S8+: real-time 0.5s tick so the latch does the same damage per
                // second regardless of frame rate (the frameCount tick below ran
                // at half rate on 30fps devices). S7 and earlier keep the legacy
                // tick so the in-flight S7 leaderboard isn't retroactively changed.
                let _latchTick;
                if (engine._isS8) {
                    e._latchAcc = (e._latchAcc || 0) + dt;
                    _latchTick = e._latchAcc >= 0.5;
                    if (_latchTick) e._latchAcc -= 0.5;
                } else {
                    _latchTick = engine.frameCount % 30 === 0;
                }
                if (_latchTick) {
                    engine.takeDamage(2 + engine.player.armor, e.name || 'Black Hole Tick');
                }
            }
        }
        if (e.id === 'cosmic_horror_spawn') {
            e.radius += dt * 0.5;
            e.damage += dt * 0.5;
            e.maxHp += dt * 2;
            e.hp += dt * 2;
        }
        if (e.id === 'boss_gravity_behemoth') {
            if (dist < 400) {
                engine.player.x -= (dx / dist) * 50 * dt;
                engine.player.y -= (dy / dist) * 50 * dt;
            }
        }
        if (e.id === 'boss_cosmic_hydra') {
            if (!e.heads) e.heads = 3;
            if (e.hp < e.maxHp * 0.7 && e.heads === 3) e.heads = 4;
            if (e.hp < e.maxHp * 0.4 && e.heads === 4) e.heads = 5;
            if (e.hp < e.maxHp * 0.1 && e.heads === 5) e.heads = 6;
        }

        let targetX = engine.player.x;
        let targetY = engine.player.y;
        let isTargetingDecoy = false;
        let activeDecoy = null;

        if ((engine.characterId === 'holodrift' || engine.player.charAugments?.includes('glt_copy')) && engine.characterMechanics?.decoys?.length > 0 && !e.isBoss) {
            let nearestDecoy = null;
            let minDecoyDist = 600;
            engine.characterMechanics.decoys.forEach(d => {
                const distToDecoy = Math.hypot(d.x - e.x, d.y - e.y);
                if (distToDecoy < minDecoyDist) { minDecoyDist = distToDecoy; nearestDecoy = d; }
            });
            if (nearestDecoy) {
                targetX = nearestDecoy.x;
                targetY = nearestDecoy.y;
                isTargetingDecoy = true;
                activeDecoy = nearestDecoy;
            }
        }

        const targetDx = targetX - e.x;
        const targetDy = targetY - e.y;
        const targetDist = Math.hypot(targetDx, targetDy);

        // Movement
        if (targetDist > 0 && !e.latched && !e.burrowed) {
            const baseSpeed = e.speedMult ? e.speed * e.speedMult : e.speed;
            let currentSpeed = baseSpeed;
            if (e.slowTimer > 0 && !(e.isBoss && engine.bossModifiers.unstoppable)) {
                currentSpeed *= 0.5;
            }
            currentSpeed *= engine.envModifiers.enemySpeed * (engine.dynamicDifficulty?.speedMult || 1.0);
            e.x += (targetDx / targetDist) * currentSpeed * 60 * dt;
            e.y += (targetDy / targetDist) * currentSpeed * 60 * dt;
        }
        if (e.slowTimer > 0) e.slowTimer -= dt;

        if (engine.characterId === 'dataphantom' && dist < 150 && !e.burrowed && !e.dataLeeched) {
            e.dataLeeched = true;
            e.speedMult = (e.speedMult || 1) * 0.7;
            engine.player.phantomBoostTimer = engine.masteryAbilityBoost?.phantomBoostDuration || 2.0;
            engine.addParticle(e.x, e.y, '#98FF98', 10, 'spark');
            engine.addParticle(e.x, e.y, '#98FF98', 5, 'implode', 1.5, { targetX: engine.player.x, targetY: engine.player.y });
            engine.addDamageText(e.x, e.y - 20, "LEECHED", '#98FF98');
        }

        if (isTargetingDecoy) {
            if (targetDist < 15 + e.radius && !e.burrowed) {
                if (!e.attackTimer || e.attackTimer <= 0) {
                    activeDecoy.hp -= e.damage;
                    e.attackTimer = 1.0;
                }
            }
        } else {
            if (dist < engine.player.radius + e.radius && !e.burrowed) {
                if (!e.attackTimer || e.attackTimer <= 0) {
                    engine.takeDamage(e.damage, e.name || 'Enemy');
                    e.attackTimer = 1.0;
                }
            }
        }
        if (e.attackTimer > 0) e.attackTimer -= dt;

        // Boss regen — S8+ uses a real-time accumulator (1% max HP per real
        // second on every device). S7 and earlier keep the legacy frameCount % 60
        // tick so the in-flight S7 leaderboard isn't retroactively changed.
        if (e.isBoss && engine.bossModifiers.regen) {
            let shouldHeal = false;
            if (engine._isS8) {
                e._regenAcc = (e._regenAcc || 0) + dt;
                if (e._regenAcc >= 1.0) {
                    e._regenAcc -= 1.0;
                    shouldHeal = true;
                }
            } else if (engine.frameCount % 60 === 0) {
                shouldHeal = true;
            }
            if (shouldHeal && e.hp < e.maxHp) {
                const healAmount = e.maxHp * 0.01;
                e.hp = Math.min(e.maxHp, e.hp + healAmount);
                engine.addParticle(e.x, e.y, '#00ff00', 5, 'spark', 1);
                engine.addDamageText(e.x, e.y - 20, `+${Math.floor(healAmount)}`, '#00ff00');
            }
        }

        // Projectile attacks
        if (!e.burrowed) {
            if (e.isRanged) {
                if (!e.shootTimer) e.shootTimer = 2 + Math.random() * 2;
                e.shootTimer -= dt;
                if (e.shootTimer <= 0 && dist < 500) {
                    e.shootTimer = 3;
                    const angle = Math.atan2(dy, dx);
                    engine.enemyProjectiles.push({
                        x: e.x, y: e.y,
                        vx: Math.cos(angle) * 200,
                        vy: Math.sin(angle) * 200,
                        radius: 6,
                        damage: e.damage * 0.5,
                        life: 3,
                        color: e.color,
                        ownerName: e.name
                    });
                }
            }

            if (e.isBoss) {
                const beforeLen = engine.enemyProjectiles.length;
                const bossTakeDamage = (amt) => engine.takeDamage(amt, e.name || 'Boss');
                updateBossAbilities(e, dt, engine.player, engine.enemyProjectiles, engine._boundAddParticle, engine._boundAddDamageText, bossTakeDamage, engine.enemies, engine.frameCount, engine.arena.id, engine.bossModifiers);
                // Tag any newly-spawned boss projectiles with the boss's name for kill credit.
                for (let pi = beforeLen; pi < engine.enemyProjectiles.length; pi++) {
                    const proj = engine.enemyProjectiles[pi];
                    if (proj && !proj.ownerName) proj.ownerName = e.name;
                }
            }
        }
    }
}