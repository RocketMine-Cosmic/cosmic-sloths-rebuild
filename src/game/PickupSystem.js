// Pickup collection + magnet logic extracted from GameEngine.
import { SFXManager } from './SFXManager';
import { isS6OrLater, isS7OrLater } from '@/lib/seasonGate';

// Cache once per module load — `getCurrentPeriodIds` is cheap but called on
// every gold pickup adds up. Cached value is fine since the rollover only
// happens at the W20→W21 boundary; nobody is mid-run at exactly Sun 23:59 UTC.
const _IS_S6 = isS6OrLater();
const _IS_S7 = isS7OrLater();

// Shared nuke effect — one-shots every non-boss enemy on screen, big screen
// shake, 5s post-nuke spawn boost. Extracted so the NovaByte 'nova_nuke'
// boss-kill augment can fire the effect instantly (without dropping a pickup
// the player can't reach in sectors — Simon/RocketMine ask 2026-05-28).
export function triggerNukeEffect(engine) {
    SFXManager.playWeaponFire('novaPulse');
    // S7 §4c: nuke damage 10× maxHP → 2.5× maxHP. Still one-shots Inner Galaxy
    // mobs; on Outer Galaxy it becomes a "thin the herd" tool instead of a
    // screen-wipe-then-AFK button.
    const nukeMult = _IS_S7 ? 2.5 : 10;
    engine.enemies.forEach(e => {
        if (!e.isBoss) {
            engine.damageEnemy(e, e.maxHp * nukeMult, { weaponId: 'nukePickup' });
        }
    });
    engine.addDamageText(engine.player.x, engine.player.y - 60, `NUCLEAR DETONATION`, '#ff0000');
    engine.shake(1.0);
    engine.postNukeSpawnBoostUntil = (engine.time || 0) + 5.0;
}

export function updatePickups(engine, dt) {
    engine.pickups = engine.pickups.filter(p => {
        if (engine.frameCount % 10 === 0 && p.type === 'xp') {
            engine.addParticle(p.x, p.y, p.color, 1, 'glow', 0.3);
        }
        const dist = Math.hypot(engine.player.x - p.x, engine.player.y - p.y);
        if (dist < engine.player.radius + 10) {
            engine.particleManager.createPickup(p.x, p.y, p.color);
            if (p.type === 'xp') {
                SFXManager.playPickup(p.value);
                engine.xp += p.value * engine.player.xpMult;
                if (engine.xp >= engine.xpRequired && !engine.isPaused) engine.levelUp();
            } else if (p.type === 'gold') {
                const nftGoldMult = engine.save.nftGoldMultiplier || 1.0;
                // S6+ L2: NFT mult is already folded ADDITIVELY into player.goldMult
                // at engine init, so skip the multiplicative bonus here. S5 keeps the
                // legacy multiplicative stack so existing balance is unchanged.
                const nftFactor = _IS_S6 ? 1.0 : nftGoldMult;

                // S6+ L9: Endless time-decay curve. First 10 min = full value,
                // then linear decay to 0.25× floor at 40 min. Replaces the old hard
                // ceiling — gold keeps flowing but tapers naturally so 4-hour AFK
                // runs don't mint piles of gold while skilled long runs still earn.
                let timeFactor = 1.0;
                if (_IS_S6 && engine.arena?.duration === Infinity) {
                    const t = engine.time || 0;
                    if (t > 600) {
                        timeFactor = Math.max(0.25, 1.0 - (t - 600) / 1800);
                    }
                }

                const finalGold = Math.floor(p.value * engine.player.goldMult * nftFactor * timeFactor);
                SFXManager.playGoldPickup(finalGold);
                engine.gold += finalGold;
                // S5 endless gold ceiling — clamps the in-game counter to match
                // saveScore's ENDLESS_GOLD_HARD_CEILING (10k). S6 drops this cap
                // (saveScore also drops it on S6+ per Phase 1). The L9 time-decay
                // above replaces the hard ceiling for S6.
                if (!_IS_S6 && engine.arena?.duration === Infinity) {
                    const cap = Math.min(10000, Math.max(1000, Math.floor((engine.time || 0) * 12)));
                    if (engine.gold > cap) engine.gold = cap;
                }
                engine.callbacks.onGoldChange(engine.gold);
                // S5 only — the floating "+NFT %" notification was tied to the
                // multiplicative bonus. On S6 the bonus is silently folded in.
                if (!_IS_S6 && nftGoldMult > 1.0 && Math.random() < 0.1) {
                    engine.addDamageText(engine.player.x, engine.player.y - 50, `NFT +${Math.round((nftGoldMult - 1) * 100)}% GOLD`, '#f59e0b');
                }
            } else if (p.type === 'fragment') {
                SFXManager.playGoldPickup();
                const nftRelicMult = engine.save.nftRelicMultiplier || 1.0;
                const fragValue = p.value || 1;
                const finalFrags = nftRelicMult > 1.0 && Math.random() < (nftRelicMult - 1.0) ? fragValue + 1 : fragValue;
                // Accumulate per-run; the SERVER credits PlayerSave.relicFragments at run end
                // via saveScore. (Direct localStorage writes here used to be silently
                // discarded by syncSave's anti-cheat — see fix 2026-05-02.)
                engine.runFragments = (engine.runFragments || 0) + finalFrags;
                if (engine.callbacks.onFragmentFound) engine.callbacks.onFragmentFound(finalFrags);
                engine.addDamageText(engine.player.x, engine.player.y - 40, `+${finalFrags} Relic Fragment!`, '#a855f7');
            } else if (p.type === 'nuke') {
                // Shared with the NovaByte 'nova_nuke' boss-kill augment.
                triggerNukeEffect(engine);
            } else if (p.type === 'magnet_power') {
                SFXManager.playMagnetPickup();
                // Flag every XP/gold pickup so the magnet block below pulls them in
                // smoothly over ~0.5s instead of teleporting them in one frame
                // (which used to look like "everything just disappeared in a flash").
                engine.pickups.forEach(otherP => {
                    if (otherP.type === 'xp' || otherP.type === 'gold') {
                        otherP.magnetSweep = true;
                    }
                });
                engine.addDamageText(engine.player.x, engine.player.y - 60, `MAGNETIC SURGE`, '#0000ff');
            } else if (p.type === 'shield_power') {
                SFXManager.playGoldPickup();
                engine.player.invincibleTimer = 10;
                engine.addDamageText(engine.player.x, engine.player.y - 60, `SHIELD OVERCHARGE`, '#ffff00');
            } else if (p.type === 'scrap') {
                SFXManager.playPickup();
                engine.characterMechanics.scrapArmor = Math.min(10, (engine.characterMechanics.scrapArmor || 0) + 0.1);
                engine.addDamageText(engine.player.x, engine.player.y - 40, `+0.1 ARMOR`, '#aaaaaa');
            }
            return false;
        }
        if (p.magnetSweep || dist < engine.player.magnetRange) {
            if (p.type !== 'nuke') {
                const playerMaxSpeed = engine.player.speed * (engine.player.speedMult || 1) * 60;
                // Magnet-sweep pickups travel ~3x faster so a screen-full collects
                // in ~0.4–0.6s — visible vacuum effect, not an instant flash.
                const baseSpeed = Math.max(800, playerMaxSpeed * 2);
                const speed = (p.magnetSweep ? baseSpeed * 3 : baseSpeed) * dt;
                p.x += ((engine.player.x - p.x) / dist) * speed;
                p.y += ((engine.player.y - p.y) / dist) * speed;
            }
        }
        return true;
    });
}