import { CHARACTERS, WEAPONS, ARENAS, CHARACTER_TALENTS, DIFFICULTIES, SKIN_COSMETICS, RELICS, ENEMIES, UPGRADES, getCharacterMastery, getWeaponStatsAndMastery, bustWeaponStatsCache } from './Constants';
import { SFXManager } from './SFXManager';
import { ParticleManager } from './ParticleManager';
import { SaveManager } from './SaveManager';
import { fireWeaponLogic } from './WeaponSystem';
import { renderGame } from './GameEngineDraw';
import { triggerSquadUltimate, updateSquadClones } from './SquadUltimate';
import { spawnEnemies as spawnEnemiesLogic } from './EnemySpawner';
import { updateProjectiles as updateProjectilesLogic } from './ProjectileSystem';
import { updateEnemies as updateEnemiesLogic } from './EnemyAI';
import { updatePickups as updatePickupsLogic } from './PickupSystem';
import { levelUp as levelUpLogic, generateChoices as generateChoicesLogic, applyUpgrade as applyUpgradeLogic, checkSynergies as checkSynergiesLogic, checkEvolutions as checkEvolutionsLogic } from './UpgradeSystem';
import { updateCharacterMechanics } from './CharacterMechanics';
import { isS6OrLater, isS7OrLater, isS8OrLater } from '@/lib/seasonGate';
import { getCurrentPeriodIds } from '@/lib/periodIds';

// S7 §4a: pushback weapons share a lifted CD floor (0.85× vs default 0.5×) so
// stacked-CDR builds can't infinitely overlap shields. See docs/S7_PATCH_NOTES.md.
const S7_PUSHBACK_WEAPONS = new Set(['shieldBubble', 'aegisMatrix', 'burningBarrier']);

// PERF 2026-08-07 — the spatial hash was keyed by the template string `${cx},${cy}`.
// That built one throwaway string per living enemy per frame when filling the hash,
// plus up to 9 more per pierce-projectile per frame on lookup (and 9 per quantum_swarm
// mob in EnemyAI). At 200 enemies + 100 projectiles that's well over a thousand string
// allocations every frame — steady GC pressure of exactly the kind already removed
// from the kill-milestone tables.
// An integer key is exact (no collisions) for any |cy| < 2^21 cells, which at the
// 100-unit cell size is ±200 million world units — far beyond anything reachable.
export const CELL_SIZE = 100;
export function cellKey(cx, cy) {
    return cx * 4194304 + cy;
}

// PERF 2026-08-03 — kill-milestone damage tables, hoisted out of damageEnemy().
// They were four array literals of five object literals built INSIDE the function,
// so every damage event allocated the default table and then, on most paths, a
// second one to replace it — up to ~25 short-lived objects per hit. AoE weapons
// land hundreds of hits a second, which is real GC pressure on a phone. The values
// are unchanged; they are just constants now, as they always should have been.
const KILL_MILESTONES_DEFAULT = [
    { kills: 200, bonus: 2 }, { kills: 500, bonus: 4 }, { kills: 1000, bonus: 6 },
    { kills: 1500, bonus: 8 }, { kills: 2000, bonus: 10 }
];
const KILL_MILESTONES_BOSS = [
    { kills: 5, bonus: 2 }, { kills: 15, bonus: 4 }, { kills: 25, bonus: 6 },
    { kills: 35, bonus: 8 }, { kills: 50, bonus: 10 }
];
const KILL_MILESTONES_TIER9 = [
    { kills: 50, bonus: 2 }, { kills: 125, bonus: 4 }, { kills: 250, bonus: 6 },
    { kills: 375, bonus: 8 }, { kills: 500, bonus: 10 }
];
const KILL_MILESTONES_TIER5 = [
    { kills: 100, bonus: 2 }, { kills: 250, bonus: 4 }, { kills: 500, bonus: 6 },
    { kills: 750, bonus: 8 }, { kills: 1000, bonus: 10 }
];

// S7 §4i: armor → % damage reduction with sector-scaled cap (Inner Galaxy 20-25%,
// Outer Galaxy 30-35%). Replaces S6's flat subtraction + 25% hybrid model.
// 1 armor = 1% reduction, clamped to the cap for the player's current sector.
const S7_ARMOR_REDUCTION_CAP = {
    1: 0.20,  2: 0.20,  3: 0.20,  4: 0.20,  5: 0.20,
    6: 0.20,  7: 0.25,  8: 0.25,  9: 0.25,  10: 0.25,
    11: 0.30, 12: 0.30, 13: 0.30, 14: 0.35, 15: 0.35,
    16: 0.35, 17: 0.35, 18: 0.35, 19: 0.35, 20: 0.35,
};

// S7 §4j: max-HP cap scales per sector through Outer Galaxy. Inner Galaxy stays
// at the legacy 2000 ceiling; OG sectors progressively lift so dedicated tank
// builds can hit ~4600 HP at S20. Used by UpgradeSystem.levelUp.
const S7_HP_CAP_BY_SECTOR = {
    11: 2400, 12: 2600, 13: 2800, 14: 3000, 15: 3200,
    16: 3500, 17: 3800, 18: 4200, 19: 4600, 20: 5000,
};
export function getS7HpCapForSector(sectorIdx) {
    return S7_HP_CAP_BY_SECTOR[sectorIdx] || 2000;
}

// Outer Galaxy (S11-S20) per-sector cap lifts (added 2026-06-04). Inner Galaxy
// keeps the existing S6 ceilings (6.0 dmg / 4.0 area / 5.0 xp). Outer Galaxy
// progressively lifts dmg/area/xp so fully-built whales actually have a chance
// against the exponential enemy HP/dmg curve (S20 Cosmic ≈ 81× S10 Cosmic).
// goldMult cap (8.0) intentionally NOT lifted — Outer Galaxy keeps S10 gold
// drops flat per the rewards rule. cooldownMult floor (0.35) untouched — the
// per-weapon Math.max(0.35, ...) in updateWeapons makes any constructor lift
// dead code. Keys = sector index (1-20). See docs/SECTORS_11_20_PLAN.md.
const OUTER_GALAXY_CAPS = {
    11: { dmg: 10,  area: 5,  xp: 9  },
    12: { dmg: 14,  area: 5,  xp: 11 },
    13: { dmg: 18,  area: 6,  xp: 14 },
    14: { dmg: 23,  area: 7,  xp: 17 },
    15: { dmg: 30,  area: 8,  xp: 20 },
    16: { dmg: 38,  area: 9,  xp: 24 },
    17: { dmg: 50,  area: 10, xp: 28 },
    18: { dmg: 62,  area: 11, xp: 33 },
    19: { dmg: 70,  area: 11, xp: 36 },
    20: { dmg: 80,  area: 12, xp: 40 },
};

export class GameEngine {
    constructor(canvas, characterId, arenaId, difficultyId, save, callbacks, isEndless = false, worldBossId = null, worldBossName = null, startingWeaponId = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.callbacks = callbacks;
        this.characterId = characterId;
        this.save = save;

        // Meteor pool bias override — when entering the Squad Meteor arena, swap
        // poolBiasAllocations for the dedicated meteorPoolBiasAllocations map (if
        // set via the selector on /squad-meteor). Clones the save so we don't
        // mutate the live PlayerSave reference — original allocations are restored
        // automatically when the run ends and the next run is constructed from the
        // freshly-loaded save. Saves players the chore of manual respec for meteor.
        if (arenaId === 'quantum_meteor'
            && save?.meteorPoolBiasAllocations
            && Object.keys(save.meteorPoolBiasAllocations).length > 0) {
            this.save = { ...save, poolBiasAllocations: save.meteorPoolBiasAllocations };
        }
        this.worldBossId = worldBossId || 'world_boss_0';
        this.worldBossName = worldBossName || 'The World Eater';
        this.difficulty = { ...(DIFFICULTIES.find(d => d.id === difficultyId) || DIFFICULTIES[0]) };

        // S6+ balance levers (per docs/S6_MASTER_PLAN.md). Auto-flips at the
        // W20→W21 rollover (Mon May 25 2026 00:00 UTC). S5 keeps legacy values.
        this._isS6 = isS6OrLater();
        this._isS7 = isS7OrLater();
        this._isS8 = isS8OrLater();

        // Season stamp captured at RUN-START — sent up to saveScore so a run
        // that begins pre-rollover (e.g. 23:58 UTC Sunday) and finishes after
        // (e.g. 00:02 UTC Monday) lands on the correct season's leaderboard.
        // Without this, the S8 W29 leaderboard's first week would be polluted
        // by high-FPS S7 runs — the client mechanics stay S7 (isS8OrLater is
        // module-cached, doesn't flip mid-session) so those runs had legacy
        // frame-tied DPS but were getting stamped S8 by save-time detection.
        // Server validates: only accepts client stamps STRICTLY OLDER than
        // its own current season (never newer — anti-cheat).
        try {
            this._runSeasonId = getCurrentPeriodIds().season_id;
        } catch {
            this._runSeasonId = null;
        }

        // L3 — Cosmic difficulty 3.0× → 2.0× gold/XP. Cuts the dominant
        // difficulty stacker without touching enemy HP/dmg (still 2.5×).
        if (this._isS6 && this.difficulty.id === 'cosmic') {
            this.difficulty.goldMult = 2.0;
            this.difficulty.xpMult = 2.0;
        }
        
        const saveStats = save.permanentUpgrades || {};
        const weeklyStats = save.weeklyUpgrades || {};
        const seasonalStats = save.seasonalUpgrades || {};
        
        // Diminishing returns when all 3 period tiers (perm + weekly + seasonal) are stacked.
        // Whales with everything maxed at 5/5/5 used to get a full 15 levels of stacked
        // bonuses on every stat — that produced 1.4M-gold runs and broke the leaderboard.
        // Now: weekly+seasonal contributions are scaled by 0.66× when stacked on top of
        // permanent. Solo period upgrades still feel full-value; only the triple-max stack
        // is curbed (~30% nerf to the ceiling).
        const STACK_FACTOR = 0.66;
        const getStatBonus = (stat) => {
            const perm = (saveStats[stat] || 0);
            const week = (weeklyStats[stat] || 0) * STACK_FACTOR;
            const season = (seasonalStats[stat] || 0) * STACK_FACTOR;
            
            if (stat === 'health') return (perm * 5) + (week * 10) + (season * 20);
            if (stat === 'speed') return (perm * 0.02) + (week * 0.05) + (season * 0.1);
            if (stat === 'damage') return (perm * 0.02) + (week * 0.05) + (season * 0.1);
            if (stat === 'magnet') return (perm * 5) + (week * 15) + (season * 30);
            if (stat === 'regen') return (perm * 0.1) + (week * 0.2) + (season * 0.5);
            if (stat === 'cooldown') return (perm * 0.02) + (week * 0.05) + (season * 0.1);
            if (stat === 'luck') return (perm * 1) + (week * 2) + (season * 3);
            return 0;
        };

        const permTalents = save.permanentTalents?.[characterId] || [];
        const weekTalents = save.weeklyTalents?.[characterId] || [];
        const seasonTalents = save.seasonalTalents?.[characterId] || [];
        const talentsData = CHARACTER_TALENTS[characterId] || [];

        let talentBonus = {
            maxHp: 0, speedMult: 0, damageMult: 0, magnetRange: 0, regen: 0, armor: 0, areaMult: 0, cooldownMult: 0, projSpeedMult: 0, goldMult: 0, xpMult: 0, luck: 0
        };

        // S6+ L1: weekly/seasonal talent contributions scaled by 0.66× when NOT
        // already covered by the permanent tier. Permanent stays full value.
        // S5 legacy: same talent ID across all three tiers still only applies once
        // (Set-style dedup) — preserved exactly via the seenIds short-circuit below.
        const TALENT_STACK_FACTOR = this._isS6 ? 0.66 : 1.0;
        const applyTalent = (tId, factor, seenIds) => {
            if (seenIds.has(tId)) return;
            seenIds.add(tId);
            const t = talentsData.find(td => td.id === tId);
            if (t) talentBonus[t.stat] = (talentBonus[t.stat] || 0) + (t.value * factor);
        };
        const seenIds = new Set();
        // Permanent first → always 1.0×, takes precedence (Set dedup parity).
        permTalents.forEach(id => applyTalent(id, 1.0, seenIds));
        // Weekly + seasonal — full value on S5 (parity), 0.66× on S6+.
        weekTalents.forEach(id => applyTalent(id, TALENT_STACK_FACTOR, seenIds));
        seasonTalents.forEach(id => applyTalent(id, TALENT_STACK_FACTOR, seenIds));

        const charKills = save.characterKills?.[characterId] || 0;
        const mastery = getCharacterMastery(charKills, characterId);
        // Apply ALL unlocked tiers (not just the highest) so they stack as a long-term grind reward.
        // - `stat` + `value`: single-stat bump (legacy tiers 1–5)
        // - `multiStat`: object of {stat: value} pairs (tier 6 character-flavoured stat package)
        // - `allStats`: applies the value to a curated set of core stat multipliers (NeoByte tier 6)
        // - `abilityBoost`: read elsewhere by CharacterMechanics / GameEngine to tweak active skills
        // Note: tier 7 ability boosts are stored on `this.masteryAbilityBoost` for runtime use.
        this.masteryAbilityBoost = {};
        const allStatsKeys = ['speedMult', 'damageMult', 'areaMult', 'cooldownMult', 'magnetRange', 'xpMult', 'goldMult'];
        (mastery.unlockedTiers || [mastery.current]).forEach(tier => {
            if (!tier) return;
            if (tier.stat && tier.value) {
                talentBonus[tier.stat] = (talentBonus[tier.stat] || 0) + tier.value;
            }
            if (tier.multiStat) {
                for (const [k, v] of Object.entries(tier.multiStat)) {
                    talentBonus[k] = (talentBonus[k] || 0) + v;
                }
            }
            if (tier.stat === 'allStats' && tier.value) {
                allStatsKeys.forEach(k => {
                    // magnetRange is a flat-add stat (default 60-72) so apply value as %.
                    if (k === 'magnetRange') talentBonus[k] = (talentBonus[k] || 0) + Math.round(60 * tier.value);
                    // cooldownMult is a "lower is better" stat — invert.
                    else if (k === 'cooldownMult') talentBonus[k] = (talentBonus[k] || 0) - tier.value;
                    else talentBonus[k] = (talentBonus[k] || 0) + tier.value;
                });
            }
            if (tier.abilityBoost) Object.assign(this.masteryAbilityBoost, tier.abilityBoost);
        });

        const equippedRelics = save.equippedRelics || [];
        const relicBonus = {
            maxHp: 0, speedMult: 0, damageMult: 0, magnetRange: 0, regen: 0, armor: 0, areaMult: 0, cooldownMult: 0, projSpeedMult: 0, goldMult: 0, xpMult: 0, luck: 0
        };

        // S6 Astral Lab — permanent stat buffs purchased via gold-only RNG pulls
        // (see functions/forgeAction.js + components/game/MysteryForgeCard.jsx).
        // Folded into talentBonus so the existing player.* caps still clamp them
        // (e.g. damageMult cap of 4.0 means whales who hit the cap via talents+
        // mastery+relics see no benefit from astral damage pulls — by design).
        // S5 ignores astralBuffs entirely (gated server-side, but defensive here too).
        if (this._isS6 && save.astralBuffs && typeof save.astralBuffs === 'object') {
            for (const [k, v] of Object.entries(save.astralBuffs)) {
                if (typeof v !== 'number' || !isFinite(v)) continue;
                talentBonus[k] = (talentBonus[k] || 0) + v;
            }
        }

        const charAugments = save.forgeCharAugments?.[characterId] || [];
        const hasAug = (id) => charAugments.includes(id);
        const augBonus = {
            maxHp: 0, speedMult: (hasAug('holo_speed') ? 0.1 : 0) + (hasAug('sky_speed') ? 0.15 : 0),
            damageMult: 0, magnetRange: 0, regen: hasAug('holo_regen') ? 0.3 : 0,
            armor: hasAug('pan_armor') ? 3 : 0, areaMult: hasAug('nova_aoe') ? 0.2 : 0,
            cooldownMult: 0, projSpeedMult: 0, goldMult: hasAug('syn_gold') ? 0.2 : 0,
            xpMult: hasAug('code_xp') ? 0.15 : 0, luck: 0, critBonus: hasAug('neo_crit') ? 0.08 : 0
        };

        const relicLevels = save.relicLevels || {};
        const relicPrestigeMap = save.relicPrestige || {};
        equippedRelics.forEach(rId => {
            const r = RELICS.find(rd => rd.id === rId);
            if (r) {
                const level = relicLevels[rId] || 1;
                const baseVal = r.values ? r.values[Math.min(level, 5) - 1] : r.value;
                // Prestige: +5% per tier (PL1–PL5 → +5% to +25%) applied multiplicatively
                // to the relic's effect value. e.g. Midas Core L5 at PL2 = +50% × 1.10 = +55%.
                const prestigeTier = Math.min(5, Math.max(0, Number(relicPrestigeMap[rId] || 0)));
                const val = baseVal * (1 + prestigeTier * 0.05);
                relicBonus[r.stat] = (relicBonus[r.stat] || 0) + val;
            }
        });

        const baseCharRaw = CHARACTERS.find(c => c.id === characterId) || CHARACTERS[0];
        const skinId = save.cosmetics?.skins?.[characterId] || `${characterId}_default`;
        const skinColor = SKIN_COSMETICS.find(s => s.id === skinId)?.color;
        const baseChar = skinColor ? { ...baseCharRaw, color: skinColor } : (save.skinColorOverride ? { ...baseCharRaw, color: save.skinColorOverride } : baseCharRaw);

        if (arenaId === 'world_boss_arena') {
            this.arena = { id: 'world_boss_arena', name: 'Global Raid', bg: '#1a0000', image: '/assets/69c5d61e39690bf20f763b4c/887e8de50_image-48.jpg', duration: Infinity, effect: 'none' };
        } else {
            this.arena = ARENAS.find(a => a.id === arenaId) || ARENAS[0];
            if (isEndless) {
                this.arena = { ...this.arena, duration: Infinity };
            }
        }
        
        this.envEffect = this.arena.effect || 'none';
        this.envParticles = [];
        this.envModifiers = {
            playerSpeed: 1,
            enemySpawnRate: 1,
            enemySpeed: 1
        };

        if (this.envEffect === 'neon_rain') {
            this.envModifiers.playerSpeed = 1.1;
            this.envModifiers.enemySpeed = 1.1;
        } else if (this.envEffect === 'fog') {
            this.envModifiers.playerSpeed = 0.9;
            this.envModifiers.enemySpawnRate = 0.9;
        } else if (this.envEffect === 'solar_flare') {
            this.envModifiers.enemySpawnRate = 1.2;
        }

        this.arenaImage = null;
        if (this.arena.image) {
            this.arenaImage = new Image();
            this.arenaImage.crossOrigin = "Anonymous";
            this.arenaImage.src = this.arena.image;
        }

        let playerImage = null;
        if (baseChar.image) {
            playerImage = new Image();
            playerImage.src = baseChar.image;
        }
        
        let idleImage = null;
        if (baseChar.idleSprite) {
            idleImage = new Image();
            idleImage.src = baseChar.idleSprite;
        }
        
        let walkImage = null;
        if (baseChar.walkSprite) {
            walkImage = new Image();
            walkImage.src = baseChar.walkSprite;
        }
        
        this.killEffect = save.cosmetics?.killEffect || 'none';

        const initialWeaponId = startingWeaponId || 'neoBlaster';

        // Sector gold penalty removed — dynamic difficulty already adjusts spawn rate
        // based on player performance, and sectors unlock linearly (you can't skip
        // ahead) so punishing earlier sectors was player-hostile with no anti-farm value.
        // Leaderboard score still uses an arena multiplier in saveScore — that's untouched.
        const sectorPenalty = 1.0;

        // VIP bonus: 1% damage + 1% HP per VIP level (stored in save.vipLevel)
        const vipLevel = save.vipLevel || 0;
        const vipDmgBonus = vipLevel * 0.01;
        const vipHpBonus = Math.floor((baseChar.hp + getStatBonus('health') + (talentBonus.maxHp || 0) + (relicBonus.maxHp || 0)) * vipLevel * 0.01);

        // Title buff: small permanent bonuses while a title is equipped (save.titleBuff
        // is set by Game.jsx from the OmenX user record before constructing the engine).
        const titleBuff = save.titleBuff || {};
        const titleHpBase = baseChar.hp + getStatBonus('health') + (talentBonus.maxHp || 0) + (relicBonus.maxHp || 0);
        const titleHpBonus = Math.floor(titleHpBase * (titleBuff.hpMult || 0));

        // Admin perk: tiny flat +N% to base stats (client-side, set in Game.jsx).
        // Layered as additive multipliers — kept very small (default 2%).
        const adminMult = (save.adminBuff?.mult) || 0;
        const adminHpBonus = Math.floor(titleHpBase * adminMult);

        // Squad Meteor buffs — apply to EVERY squad member's runs across every arena
        // ("Buffs apply to every squad member's runs" per getSquadMeteorState).
        // Server returns percentages as whole numbers (5 = +5%), convert to additive
        // multiplier deltas. cdrPct is "lower cooldown is better" — subtracted from
        // cooldownMult (mirrors how talents handle cooldown reductions).
        const meteorBuffs = save.squadMeteorBuffs || null;
        const meteorDmgMult  = meteorBuffs ? (meteorBuffs.damage_pct || 0) / 100 : 0;
        const meteorAoeMult  = meteorBuffs ? (meteorBuffs.aoe_pct    || 0) / 100 : 0;
        const meteorGoldMult = meteorBuffs ? (meteorBuffs.gold_pct   || 0) / 100 : 0;
        const meteorCdrMult  = meteorBuffs ? (meteorBuffs.cdr_pct    || 0) / 100 : 0;

        this.player = {
            name: baseChar.name,
            image: playerImage,
            idleImage: idleImage,
            walkImage: walkImage,
            frameTimer: 0,
            currentFrame: 0,
            x: 0, y: 0, radius: 16,
            maxHp: baseChar.hp + getStatBonus('health') + (talentBonus.maxHp || 0) + (relicBonus.maxHp || 0) + vipHpBonus + titleHpBonus + adminHpBonus,
            hp: baseChar.hp + getStatBonus('health') + (talentBonus.maxHp || 0) + (relicBonus.maxHp || 0) + vipHpBonus + titleHpBonus + adminHpBonus,
            speed: baseChar.speed,
            speedMult: (1 + getStatBonus('speed') + (talentBonus.speedMult || 0) + (relicBonus.speedMult || 0) + augBonus.speedMult + (titleBuff.speedMult || 0) + adminMult) * this.envModifiers.playerSpeed,
            damageMult: (baseChar.damageMult || 1) + getStatBonus('damage') + (talentBonus.damageMult || 0) + (relicBonus.damageMult || 0) + vipDmgBonus + (titleBuff.damageMult || 0) + adminMult + meteorDmgMult,
            magnetRange: (baseChar.magnetRange || 60) + 30 + getStatBonus('magnet') + (talentBonus.magnetRange || 0) + (relicBonus.magnetRange || 0) + (titleBuff.magnetRange || 0) + Math.floor(((baseChar.magnetRange || 60) + 30) * adminMult),
            regen: baseChar.regen + getStatBonus('regen') + (talentBonus.regen || 0) + (relicBonus.regen || 0) + augBonus.regen + (titleBuff.regen || 0),
            armor: baseChar.armor + (talentBonus.armor || 0) + (relicBonus.armor || 0) + augBonus.armor + (titleBuff.armor || 0),
            areaMult: (baseChar.areaMult || 1) + (talentBonus.areaMult || 0) + (relicBonus.areaMult || 0) + augBonus.areaMult + (titleBuff.areaMult || 0) + adminMult + meteorAoeMult,
            cooldownMult: (baseChar.cooldownMult || 1) - getStatBonus('cooldown') + (talentBonus.cooldownMult || 0) + (relicBonus.cooldownMult || 0) + (titleBuff.cooldownMult || 0) - meteorCdrMult,
            projSpeedMult: (baseChar.projSpeedMult || 1) + (talentBonus.projSpeedMult || 0) + (relicBonus.projSpeedMult || 0),
            // S6+ L2: NFT gold multiplier folded into player.goldMult ADDITIVELY
            // instead of multiplied at pickup time. (`save.nftGoldMultiplier` is e.g.
            // 1.1 for +10% — convert to additive 0.1 when present.) PickupSystem
            // skips the multiplicative pickup-time bonus on S6+ to match.
            goldMult: ((baseChar.goldMult || 1) + (talentBonus.goldMult || 0) + (relicBonus.goldMult || 0) + augBonus.goldMult + (titleBuff.goldMult || 0) + adminMult + meteorGoldMult + (this._isS6 ? Math.max(0, (save.nftGoldMultiplier || 1) - 1) : 0)) * this.difficulty.goldMult * sectorPenalty,
            xpMult: ((baseChar.xpMult || 1) + (talentBonus.xpMult || 0) + (relicBonus.xpMult || 0) + augBonus.xpMult + (titleBuff.xpMult || 0) + adminMult) * this.difficulty.xpMult,
            luck: (baseChar.luck || 0) + getStatBonus('luck') + (talentBonus.luck || 0) + (relicBonus.luck || 0) + (titleBuff.luck || 0) + adminMult,
            critBonus: augBonus.critBonus + (titleBuff.critBonus || 0),
            charAugments: charAugments,
            color: baseChar.color,
            trail: save.cosmetics?.trail || 'default',
            weapons: [{ ...WEAPONS[initialWeaponId], level: 1, timer: 0 }],
            passives: [],
            passiveLevels: {},
            // Stored for the buff-aura renderer (purely visual; stat math above
            // already mixed these values into the relevant player fields).
            titleBuff: titleBuff && Object.keys(titleBuff).length ? titleBuff : null
        };
        
        // S6+ Fix A — final safety clamps on the most-stacked multipliers. Catches
        // late-run Overcharge stacking, uncapped Astral Lab pulls, and any future
        // multiplier source we haven't yet predicted. The engine's per-level growth
        // caps in levelUp() (5.0 dmg / 2000 HP) DON'T apply to upgrade picks, so
        // without these clamps a 90-min endless player can blow past them via
        // Overcharge fillers. S5 unchanged (legacy whales keep their stacking).
        //
        // Outer Galaxy (S11-S20): per-sector caps lifted via OUTER_GALAXY_CAPS lookup
        // — without this, whales hit the standard S6 walls (6.0 dmg etc) and have ZERO
        // chance of clearing even S12 (enemy HP scales exponentially). See
        // docs/SECTORS_11_20_PLAN.md "Player power cap lifts" section.
        // `this._outerGalaxyActive` is exposed for other systems (e.g. WeaponSystem
        // lifts Vampiric Lash heal cap 5% → 10% on Outer Galaxy).
        const sectorIdx = ARENAS.findIndex(a => a.id === this.arena.id) + 1;
        const outerCaps = OUTER_GALAXY_CAPS[sectorIdx];
        this._outerGalaxyActive = !!outerCaps;
        // Cached for armor cap lookup (S7 §4i) + HP cap lookup (S7 §4j).
        this._sectorIdx = sectorIdx;
        if (this._isS6) {
            if (outerCaps) {
                this.player.damageMult = Math.min(outerCaps.dmg,  this.player.damageMult);
                this.player.areaMult   = Math.min(outerCaps.area, this.player.areaMult);
                this.player.xpMult     = Math.min(outerCaps.xp,   this.player.xpMult);
            } else {
                // Inner Galaxy (S1-S10) — standard S6 caps unchanged.
                this.player.damageMult = Math.min(6.0, this.player.damageMult);
                this.player.areaMult   = Math.min(4.0, this.player.areaMult);
                this.player.xpMult     = Math.min(5.0, this.player.xpMult);
            }
            // goldMult cap + cooldownMult floor are sector-agnostic — Outer Galaxy
            // keeps S10 gold drops flat (rewards rule) and the per-weapon Math.max
            // safeguard in updateWeapons enforces the cooldown floor anyway.
            this.player.goldMult     = Math.min(8.0,  this.player.goldMult);
            this.player.cooldownMult = Math.max(0.35, this.player.cooldownMult);
        }

        // Session XP buff (purchased via "+50% XP" SKU). xpExpiry is a server-clock
        // ms timestamp set by purchaseSku. We snapshot the expiry here AND re-check
        // every frame so the buff naturally drops off mid-run if it expires (rather
        // than staying applied for the whole run because we only checked at startup).
        this.xpBuffExpiry = Number(save.sessionBuffs?.xpExpiry || 0);
        const hasXpBuff = this.xpBuffExpiry > Date.now();
        const xpBuffMultiplier = hasXpBuff ? 1.5 : 1.0;

        // Global XP buff — admin-set server-wide multiplier (e.g. 2× XP for 24h
        // as a make-good when something disrupts play). Folded into the baseline
        // so it naturally stacks with the personal +50% buff multiplicatively.
        // Locked in at run-start: changing the global value mid-run does not
        // affect runs already in progress (matches how difficulty is locked).
        const globalBuff = save.globalXpBuff;
        const globalXpMult = (globalBuff && globalBuff.multiplier > 1 && globalBuff.expiresAt > Date.now())
            ? Number(globalBuff.multiplier)
            : 1.0;
        this.globalXpMult = globalXpMult;

        // Cache the no-personal-buff baseline (incl. global mult) so we can toggle
        // the personal +50% on/off cleanly when it expires mid-run (see update() below).
        this._xpMultBase = ((baseChar.xpMult || 1) + (talentBonus.xpMult || 0) + (relicBonus.xpMult || 0) + augBonus.xpMult + (titleBuff.xpMult || 0) + adminMult) * this.difficulty.xpMult * globalXpMult;
        this.player.xpMult = this._xpMultBase * xpBuffMultiplier;
        this.player.xpBuffActive = hasXpBuff;
        if (hasXpBuff) {
            console.log('[GameEngine] +50% XP buff ACTIVE — expires in', Math.floor((this.xpBuffExpiry - Date.now()) / 1000), 'seconds');
        }
        if (globalXpMult > 1) {
            console.log(`[GameEngine] Global XP buff ACTIVE — ${globalXpMult}× for entire server`);
        }

        if (hasAug('dat_ghost')) {
            this.player.iFrames = 5.0;
            this.player.invincibleTimer = 5.0;
        }
        
        this.camera = { x: 0, y: 0 };
        this.joystick = { x: 0, y: 0 };
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        this.particleManager = new ParticleManager();
        this.damageTexts = [];
        
        this.stars = Array.from({length: 150}, () => ({ x: Math.random() * 2000, y: Math.random() * 2000, size: Math.random() * 2 + 0.5, parallax: Math.random() * 0.4 + 0.1 }));
        
        this.keys = {};
        this.time = 0;
        this.frameCount = 0;
        this.level = 1;
        this.xp = 25;
        this.banishedUpgrades = new Set();
        this.xpRequired = 25;
        this.gold = 0;
        this.kills = 0;

        if (arenaId === 'world_boss_arena') {
            let totalXpNeeded = 0;
            let currentReq = 10;
            for (let i = 1; i < 20; i++) {
                totalXpNeeded += currentReq;
                currentReq = Math.floor(currentReq * 1.1 + 20);
            }
            this.xp = totalXpNeeded;
        }

        // Squad Meteor — 3-minute DPS-check arena with no mob spawns. Hand out
        // EXACTLY 10 starter level-ups at run start (no XP priming — XP-based
        // priming is what makes raid players overshoot with stacked XP buffs,
        // which Texxy explicitly doesn't want here). Each pick fires the normal
        // LevelUpModal (reroll/banish/evolutions all behave as usual); when the
        // player commits an upgrade, applyUpgrade decrements
        // `pendingStarterLevelUps` and calls `engine.levelUp()` directly for
        // the next pick. Run timer stays paused while the modal is open
        // (engine.isPaused), so the 3-min clock only starts after all 10 picks.
        if (arenaId === 'quantum_meteor') {
            this.pendingStarterLevelUps = 10;
        }
        
        this.isPaused = false;
        this.isGameOver = false;
        this.isVictory = false;
        this.encounteredEnemies = new Set();
        this.enemyKills = {};
        
        this.lockedCharacters = ['glitch', 'holodrift', 'codebreaker', 'dataphantom', 'neonvortex', 'synthbeats', 'skybyte']
            .filter(id => !(save.foundCharacters || []).includes(id));
        this.characterPickupSpawned = false;
        this.characterPickup = null;
        this.bossSpawned = false;
        this.enemyProjectiles = [];
        this.hazards = [];
        
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeTimer = 0;
        this.hitStopTimer = 0;
        this.zoom = window.innerWidth < 768 ? 0.5 : 0.8;
        this.bossModifiers = save.bossModifiers || {};
        this.worldBossDamage = 0;
        this.totalDamageDealt = 0;
        this.bossesKilled = 0;
        this.elitesKilled = 0;
        // Per-weapon stat tracking — credit damage on every hit, credit kill on the killing blow.
        this.weaponDamage = {};
        this.weaponKills = {};
        // Per-run relic fragment accumulator. Picked up via PickupSystem,
        // sent to saveScore at run end where the SERVER credits PlayerSave.relicFragments
        // (client cannot bump that field — syncSave blocks it as anti-cheat).
        this.runFragments = 0;

        // Rolling 10-second damage window. Each entry is { t, dmg }; we sum entries
        // whose timestamp is within the last DPS_WINDOW seconds. Lets the HUD's DPS
        // value reflect *recent* output so post-boss buffs / new evolutions show up
        // in real time instead of being averaged-out across the whole run.
        // PERF 2026-08-07 — was an array of {t, dmg} objects pushed on EVERY hit.
        // An AoE build lands hundreds of hits a second, so this allocated hundreds
        // of short-lived objects per second purely to feed one HUD number, and it
        // was only trimmed inside getRollingDps() — which the HUD calls only while
        // UNPAUSED, so it grew without bound while a level-up modal was open, then
        // trimmed with Array.shift() (O(n) per element).
        // Now: fixed 0.5s buckets in a 20-slot ring (10s window). Zero allocation
        // per hit, O(1) trim, same rolling-window semantics.
        this.DPS_WINDOW = 10;
        this._dpsBuckets = new Float64Array(20);
        this._dpsBucketIdx = 0;
        this._dpsBucketTime = 0;
        
        this.characterMechanics = {
            bannerTimer: 0,
            banners: [],
            scrapArmor: 0,
            decoyTimer: 0,
            decoys: [],
            hackTimer: 0,
            hackedEnemies: [],
            sonicCharge: 0,
            lastMoveDir: { x: 0, y: 0 }
        };
        
        this.bindEvents();
        this.lastTime = performance.now();
        // PERF 2026-08-03 — bind ONCE. `this.loop.bind(this)` inside loop() allocated
        // a fresh bound function on every single frame, for the entire run.
        this._boundLoop = this.loop.bind(this);
        // PERF 2026-08-07 — EnemyAI passed `engine.addParticle.bind(engine)` and
        // `engine.addDamageText.bind(engine)` to updateBossAbilities for EVERY boss
        // on EVERY frame, allocating two functions per boss per frame. Same defect
        // as the loop bind above; bind once here.
        this._boundAddParticle = this.addParticle.bind(this);
        this._boundAddDamageText = this.addDamageText.bind(this);
        this.animationId = requestAnimationFrame(this._boundLoop);
    }

    triggerSquadUltimate(tier) {
        triggerSquadUltimate(this, tier);
    }

    triggerSonicBoom() {
        // Tier-7 mastery: charge can build past 100 → 200 ("supercharge"). Released
        // at supercharge it does 2.5× damage in a 1.6× radius and shakes the screen harder.
        const isSuper = (this.characterMechanics.sonicCharge || 0) >= 200;
        this.characterMechanics.sonicCharge = 0;
        const label = isSuper ? "HYPER BOOM!" : "SONIC BOOM!";
        const color = isSuper ? '#FFFFFF' : '#00D4FF';
        const radius = isSuper ? 480 : 300;
        const dmg = isSuper ? 125 : 50;
        const visualScale = isSuper ? 3.5 : 2.0;
        const shockGrowth = isSuper ? 1300 : 800;
        const shockWidth = isSuper ? 14 : 8;
        this.addDamageText(this.player.x, this.player.y - 40, label, color);
        this.particleManager.createExplosion(this.player.x, this.player.y, color, visualScale, 'default');
        this.addParticle(this.player.x, this.player.y, color, 1, 'shockwave', isSuper ? 4.5 : 3.0, { growthRate: shockGrowth, lineWidth: shockWidth });
        this.shake(isSuper ? 1.0 : 0.5);
        this.enemies.forEach(e => {
            if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < radius) {
                // Skybyte's Sonic Boom — tagged so it appears in the post-run
                // weapon breakdown instead of "Untracked Damage".
                this.damageEnemy(e, dmg * this.player.damageMult, { weaponId: 'sonicBoom' });
                const angle = Math.atan2(e.y - this.player.y, e.x - this.player.x);
                e.x += Math.cos(angle) * (isSuper ? 180 : 100);
                e.y += Math.sin(angle) * (isSuper ? 180 : 100);
            }
        });
    }

    takeDamage(amount, sourceName = null) {
        // Hard gate: never apply damage while a level-up modal is open. This is
        // checked BEFORE isPaused because iPhone Chrome can race-flip isPaused
        // back to false via phantom focus events (Simon + Anubis bug 2026-05-23).
        // Belt-and-braces — the auto-resume paths below also guard on this flag.
        if (this._levelUpPending) return;
        // Defense-in-depth: never apply damage while the engine is paused.
        // The update() loop is already gated by isPaused, but takeDamage can be
        // reached via async paths (deferred contact ticks, confirmation modals
        // briefly flipping pause state, hazard timers firing across pause edges)
        // — Simon reported dying mid-pick on the LevelUpModal (2026-05-23 Discord).
        // rerollChoices() already calls out this same race in its own comment.
        // One line here closes the entire bug class without auditing every path.
        if (this.isPaused) return;
        if (this.player.invincibleTimer > 0 || this.player.iFrames > 0) return;
        // Remember whatever last hurt the player so we can show "killed by X" on game over.
        if (sourceName) this._lastDamageSource = sourceName;

        if (this.player.charAugments?.includes('glt_phase') && Math.random() < 0.1) {
            this.player.iFrames = 2.0;
            this.addDamageText(this.player.x, this.player.y - 20, "PHASE SHIFT", '#FF00FF');
            return;
        }
        
        if (this.player.charAugments?.includes('dat_shade')) {
            this.player.phantomBoostTimer = 2.0;
            this.player.iFrames = Math.max(this.player.iFrames || 0, 2.0);
            this.addParticle(this.player.x, this.player.y, '#C0C0C0', 20, 'smoke', 2);
        }

        // Armor —
        //   S5: pure flat reduction (legacy).
        //   S6: hybrid flat + 0.5%/point capped at 25% (better than S5 late-game).
        //   S7 §4i: pure % reduction with sector-scaled cap (20-35%). Flat armor
        //     was rounding noise once OG mobs hit 700+ damage — Pandypaws died in
        //     2 hits at S20 regardless of investment. Now 1 armor = 1% reduction
        //     clamped to the sector cap, so tank builds survive 6-9 hits at S20.
        const totalArmor = this.player.armor + (this.characterMechanics.scrapArmor || 0);
        let actualDmg;
        if (this._isS7) {
            const cap = S7_ARMOR_REDUCTION_CAP[this._sectorIdx] || 0.20;
            const reduction = Math.min(cap, totalArmor * 0.01);
            actualDmg = Math.max(1, amount * (1 - reduction));
        } else {
            actualDmg = Math.max(1, amount - totalArmor);
            if (this._isS6) {
                const pctReduction = Math.min(0.25, totalArmor * 0.005);
                actualDmg = Math.max(1, actualDmg * (1 - pctReduction));
            }
        }
        if (this.player.charAugments?.includes('pan_fortress') && this.player.hp >= this.player.maxHp) {
            actualDmg = Math.max(1, Math.floor(actualDmg * 0.85));
        }
        actualDmg = Math.max(1, Math.floor(actualDmg));

        // Bribe (SynthBeats): dodge a hit by paying gold. Now scales with the damage
        // being negated (so big hits cost a lot of gold) and is rate-limited so
        // players can't infinitely tank damage by farming gold faster than they spend it.
        const bribeBaseCost = this.masteryAbilityBoost?.bribeCost ?? 5;
        const bribeCost = bribeBaseCost + Math.floor(amount * 2); // 5 + 2× incoming damage
        const bribeCooldown = 3.0;
        if (this.characterId === 'synthbeats' && this.gold >= bribeCost && (this.player.bribeCooldown || 0) <= 0) {
            this.gold -= bribeCost;
            this.player.bribeCooldown = bribeCooldown;
            if (this.callbacks.onGoldChange) this.callbacks.onGoldChange(this.gold);
            this.addDamageText(this.player.x, this.player.y - 20, `BRIBED! -${bribeCost}g`, '#FFD700');
            this.particleManager.createExplosion(this.player.x, this.player.y, '#FFD700', 1.0, 'default');
            this.player.iFrames = 0.5;
            return;
        }

        const phaseShiftChance = this.masteryAbilityBoost?.phaseShiftChance ?? 0.15;
        if (this.characterId === 'glitch' && Math.random() < phaseShiftChance) {
            this.player.iFrames = 2.0;
            this.player.invincibleTimer = 2.0;
            this.addDamageText(this.player.x, this.player.y - 20, "PHASE SHIFT!", '#FF00FF');
            this.addParticle(this.player.x, this.player.y, '#FF00FF', 15, 'slash', 1.5);
            this.player.weapons.forEach(w => w.timer = 0);
            return;
        }

        this.player.hp -= actualDmg;
        this.player.iFrames = 0.2;
        this.callbacks.onHpChange(this.player.hp, this.player.maxHp);
        this.addDamageText(this.player.x, this.player.y - 20, actualDmg, '#ff0000');
        SFXManager.playPlayerHit();
        
        const aegis = this.player.weapons.find(w => w.id === 'aegisMatrix');
        if (aegis && Math.random() < 0.5) {
            for(let i=0; i<5; i++) {
                const angle = Math.random() * Math.PI * 2;
                this.projectiles.push({
                    x: this.player.x, y: this.player.y,
                    vx: Math.cos(angle) * 500,
                    vy: Math.sin(angle) * 500,
                    radius: 10,
                    // S7 §4a-bis: aegis base damage is nerfed 40→28 (×0.7).
                    // Retaliation missiles inherit the same cut so all aegis damage
                    // sources scale together.
                    damage: aegis.baseDamage * this.player.damageMult * 2 * (this._isS7 ? 0.7 : 1),
                    pierce: 1,
                    life: 2,
                    color: '#00ff66',
                    type: 'missile',
                    // Tag retaliation missiles so damage shows up in the post-run
                    // breakdown — these are spawned from takeDamage(), not the
                    // weapon-fire path, so they bypass the fallback weaponId
                    // assignment in WeaponSystem.js (Texxy bug 2026-05-17).
                    weaponId: 'aegisMatrix'
                });
            }
        }

        if (this.player.hp <= 0) {
            const currentOmenxBalance = this.save.omenxBalance ?? 0;
            if (!this.player.hasRevivedWithTokens && this.callbacks.onDeathPrompt && currentOmenxBalance >= 4) {
                 this.isPaused = true;
                 this.callbacks.onDeathPrompt();
                 return;
            }

            if (this.player.charAugments?.includes('holo_revive') && !this.player.holoRevived) {
                this.player.holoRevived = true;
                this.player.hp = this.player.maxHp * 0.1;
                this.player.iFrames = 3.0;
                this.callbacks.onHpChange(this.player.hp, this.player.maxHp);
                this.addDamageText(this.player.x, this.player.y - 40, "EMERGENCY REVIVE", '#00FA9A');
                this.particleManager.createExplosion(this.player.x, this.player.y, '#00FA9A', 2);
                return;
            }
            this.particleManager.createExplosion(this.player.x, this.player.y, this.player.color, 3, this.characterId);
            this.gameOver();
        }
    }

    bindEvents() {
        this.handleKeyDown = (e) => { this.keys[e.key.toLowerCase()] = true; };
        this.handleKeyUp = (e) => { this.keys[e.key.toLowerCase()] = false; };
        // Auto-pause when the browser throttles the tab. Without this, requestAnimationFrame
        // fires at ~1Hz in the background — clamped dt makes the game limp along while
        // real time races ahead, which players perceive as "boss HP stuck" or weapons
        // not firing. We just freeze the loop entirely while the tab is hidden.
        //
        // CRITICAL: don't fire auto-pause during the engine's first ~1 second AND before
        // the loop has actually ticked once. Mobile browsers (Samsung Internet, Chrome
        // Android, Discord webview) routinely fire spurious `visibilitychange(hidden=true)`
        // events during the page transition into /game — when the address bar collapses,
        // when the loading overlay first paints, when system UI inserts itself. Without
        // this guard, those phantom events latch _wasAutoPaused=true on a freshly-loaded
        // run and the engine never ticks — player sees a frozen "SURVIVE 0:00 / SCORE 0"
        // HUD with the boss already on screen and nothing happens (Lucifer bug 2026-05-15,
        // following Thom's 2026-05-14 report). The 1s + frameCount guard means we only
        // pause runs that have ACTUALLY started, which is the only state worth pausing.
        this._engineCreatedAt = performance.now();
        // Verify-then-pause pattern. iOS Safari fires spurious `visibilitychange(hidden)`
        // events during URL-bar collapse, Control Center peek, scroll-bounce, and other
        // system gestures — they clear within ~200ms. Pausing on every one of those was
        // causing the "random raid pauses" Thom kept reporting (Safari iPhone, 2026-05-15).
        // Now: when `hidden=true` arrives, schedule a verification check 350ms later. If
        // the document is STILL hidden by then, it's a real backgrounding and we pause.
        // If it flipped back to visible (Safari flicker), we ignore the event entirely.
        this._pendingHidePause = null;
        this.handleVisibilityChange = () => {
            if (document.hidden) {
                const aliveMs = performance.now() - (this._engineCreatedAt || 0);
                if (aliveMs < 1000 || (this.frameCount || 0) < 5) {
                    // Engine just spun up — ignore spurious hidden events fired
                    // by mobile browsers during the GameLoadingScreen → canvas
                    // transition (address-bar collapse, layout shift, etc.).
                    return;
                }
                // Defer the pause — wait to confirm the tab is actually backgrounded.
                if (this._pendingHidePause) clearTimeout(this._pendingHidePause);
                this._pendingHidePause = setTimeout(() => {
                    this._pendingHidePause = null;
                    if (!document.hidden) return; // Safari flicker — abort.
                    // Don't latch _wasAutoPaused if a level-up modal is already
                    // open — otherwise the resume path below would clear isPaused
                    // while the modal is still showing (player dies mid-pick).
                    if (this._levelUpPending) return;
                    this._wasAutoPaused = !this.isPaused;
                    this.isPaused = true;
                }, 350);
            } else {
                // Visible — cancel any pending pause from a flicker that already cleared.
                if (this._pendingHidePause) {
                    clearTimeout(this._pendingHidePause);
                    this._pendingHidePause = null;
                }
                if (this._wasAutoPaused && !this._levelUpPending) {
                    this._wasAutoPaused = false;
                    this.lastTime = performance.now(); // prevent dt spike on resume
                    this.isPaused = false;
                }
            }
        };
        // Belt-and-braces safety net for in-app browsers (Discord, Twitter, Telegram,
        // FB Messenger) that don't reliably fire `visibilitychange` when their webview
        // is re-focused. Without this, backgrounding the game to switch apps could
        // leave it paused forever with no UI indication.
        // NOTE: we used to also listen for `pointerdown` here, but that turned out to
        // mask the real bug above (engine started in auto-paused state and only
        // un-paused if the player happened to tap). We removed pointerdown so
        // auto-pause stays purely tied to actual document visibility — the right
        // semantic for a "browser put the tab to sleep" recovery net.
        this.handleAutoResume = () => {
            // Skip auto-resume while a level-up modal is open — the player is
            // mid-pick and the engine must stay frozen until they commit.
            if (this._wasAutoPaused && !document.hidden && !this._levelUpPending) {
                this._wasAutoPaused = false;
                this.lastTime = performance.now();
                this.isPaused = false;
            }
        };
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('focus', this.handleAutoResume);
    }

    cleanup() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('focus', this.handleAutoResume);
        if (this._pendingHidePause) {
            clearTimeout(this._pendingHidePause);
            this._pendingHidePause = null;
        }
        cancelAnimationFrame(this.animationId);
    }

    loop(timestamp) {
        try {
            // Self-healing auto-pause recovery. If the engine is paused, the
            // document is visible, and the player hasn't intentionally paused
            // (no UI modal open), force-resume. This is intentionally aggressive
            // because mobile browsers (Samsung Internet, Chrome Android, Discord
            // webview) fire phantom/orphaned visibility events during page-load
            // transitions that can latch the engine into a permanent pause —
            // sometimes WITHOUT a matching `visible` event ever following, and
            // sometimes with `_wasAutoPaused` cleared by an earlier resume that
            // raced with a stale `hidden` event. Checking the actual state of the
            // world (document.hidden + no game-over/victory/modal) is more
            // reliable than trusting our own flags weren't trampled.
            //
            // Intentional pauses we MUST respect (don't auto-resume through):
            //   - Pause menu (PauseModal — Game.jsx tracks this in React state,
            //     not on the engine; checking `!document.hidden` is enough because
            //     when the player taps Resume, Game.jsx flips engine.isPaused
            //     back itself).
            //   - Level-up / death / victory modals (engine sets isPaused=true
            //     and we check isGameOver/isVictory below; for level-up, the
            //     callbacks.onLevelUp setter populates levelUpChoices in React,
            //     and we leave that one alone via the _wasAutoPaused gate).
            //
            // To distinguish, only force-resume runs that auto-paused themselves
            // — that's exactly what _wasAutoPaused tracks. If it got cleared by
            // a stale event race, the visibility handler's "visible" branch will
            // also have run and unpaused us, so the engine should already be
            // moving. Belt-and-braces (Lucifer 2026-05-14, Thom 2026-05-15).
            if (this._wasAutoPaused && this.isPaused && !document.hidden
                && !this.isGameOver && !this.isVictory && !this._levelUpPending) {
                this._wasAutoPaused = false;
                this.lastTime = timestamp;
                this.isPaused = false;
            }
            if (!this.isPaused && !this.isGameOver && !this.isVictory) {
                let dt = (timestamp - this.lastTime) / 1000;
                // Sandbox time scale — 2×/4× fast-forward via the dev panel. Only
                // applies when save.isSandbox is on (sandboxSetTimeScale gates it).
                if (this._sandboxTimeScale && this._sandboxTimeScale > 1) {
                    dt *= this._sandboxTimeScale;
                }
                this.update(dt);
                this.draw();
            }
        } catch (e) {
            console.error("Game loop error:", e);
        }
        this.lastTime = timestamp;
        this.animationId = requestAnimationFrame(this._boundLoop || (this._boundLoop = this.loop.bind(this)));
    }

    update(dt) {
        if (dt > 0.1) dt = 0.1;
        this.lastDt = dt;

        // PERF 2026-08-03 — drop the weapon-stats memo at the top of every tick.
        // getWeaponStatsAndMastery is allocation-heavy and was recomputed twice per
        // weapon fire and twice per frame from the draw path. Its inputs are meta
        // progression, which cannot change within a single frame, so a one-tick
        // cache is safe by construction. Clearing HERE (not in draw) means an
        // upgrade picked on a level-up is always live on the very next tick.
        bustWeaponStatsCache();
        
        // Dynamic Difficulty
        if (!this.dynamicDifficulty) this.dynamicDifficulty = {
            timer: 0, lastKills: 0, damageTaken: 0, lastHp: this.player.hp, speedMult: 1.0, spawnRateMult: 1.0
        };
        this.dynamicDifficulty.timer += dt;
        if (this.player.hp < this.dynamicDifficulty.lastHp) {
            this.dynamicDifficulty.damageTaken += (this.dynamicDifficulty.lastHp - this.player.hp);
        }
        this.dynamicDifficulty.lastHp = this.player.hp;

        // Early-game DD reactivity (Anubis feedback 2026-05-29): first 60s of a run
        // evaluates DD every 5s instead of 15s, so strong players see spawns ramp
        // within seconds of clearing the field instead of standing around for half
        // a minute. After 60s, normal 15s cadence resumes. Kill/damage thresholds
        // are scaled down proportionally so the shorter window still requires
        // sustained performance, not just one lucky burst.
        const ddInterval = (this.time < 60) ? 5 : 15;
        // Kill thresholds halved (2026-05-30 Anubis bug): the old 30-per-15s
        // threshold required 120 kills/min to qualify, but base spawn rate at
        // mid-run only produces ~60-90 kills/min for top players — they could
        // NEVER hit the bar, so DD stayed pinned at 1.0× even on flawless runs.
        // New threshold of 15/15s = 60/min, which strong players clear easily.
        // Mid-tier ramp-up assist (2026-05-30): when DD hasn't ramped past 1.0×
        // yet (player is still in the basement), drop the threshold further so
        // mid-tier players can climb out faster. Once they hit 1.0× the normal
        // thresholds resume — so top players are unaffected.
        const ddRamped = (this.dynamicDifficulty.spawnRateMult || 1.0) >= 1.0;
        const lowDDThreshold = (this.time < 60) ? 4 : 8;
        const normalThreshold = (this.time < 60) ? 7 : 15;
        const killThreshold = (this._isS6 && !ddRamped) ? lowDDThreshold : normalThreshold;
        // DD ramp gating:
        //   S5: mild ±0.1 ramp on all difficulties (legacy).
        //   S6: aggressive ramp gated to Cosmic only (others pinned at 1.0×).
        //   S7 §4g: per-difficulty params — Normal/Hard now also ramp so the new
        //     §4f HEAT score bonus has something to reward. Easy stays at 1.0×
        //     (no DD).
        // Speed caps lowered again (2026-06-18 follow-up — no dash mechanic
        // exists, so even 1.4× player speed is unkiteable since the player has
        // no burst movement to create space. Math at new caps on Cosmic:
        // fastest enemy (2.6) × Cosmic (1.25) × peak DD (1.15) = ~3.74, vs
        // fastest character Glitch (3.6) and Skybyte (3.5) — enemies stay at
        // or just below the top characters' base speed so positioning/kiting
        // with raw movement works again. DD spawn density (spawnCap) unchanged
        // — that's the real whale-headroom lever and was never the complaint.
        const S7_DD_PARAMS = this._isS7 ? ({
            normal: { spawnCap: 1.75, speedCap: 1.0,  upStep: 0.20 },
            hard:   { spawnCap: 2.5,  speedCap: 1.08, upStep: 0.25 },
            cosmic: { spawnCap: 3.5,  speedCap: 1.15, upStep: 0.30 },
        })[this.difficulty.id] : null;
        const ddEnabled = this._isS7
            ? !!S7_DD_PARAMS
            : (!this._isS6 || this.difficulty.id === 'cosmic');
        if (ddEnabled && this.dynamicDifficulty.timer >= ddInterval) {
            const killsDelta = this.kills - this.dynamicDifficulty.lastKills;
            // S6+ Option 2: asymmetric ramp — strong play climbs FAST (+0.15/cycle),
            // struggling decays SLOW (-0.05/cycle). One good 15s window matters more
            // than one bad one. Rewards consistency for top players. S5 keeps the
            // legacy symmetric ±0.1 ramp.
            // Whale-headroom patch (2026-05-28 — Simon/Anubis/ReZuM Discord feedback):
            // top players were hitting the previous 2.0× ceiling and seeing no score
            // gain from further investment. Spawn ceiling raised 2.0× → 3.5×, enemy
            // speed ceiling 2.0× → 2.5×. Floor (0.7×) unchanged — strugglers protected.
            // upStep doubled on S6 (2026-05-30 Anubis bug): old 0.15/window
            // needed 17 windows (4+ min) to reach the 3.5× spawn cap. New 0.30
            // reaches cap in ~8 windows (2 min) — strong players actually feel
            // the field fill up within a single sector run.
            // S7: per-difficulty params (see S7_DD_PARAMS above). Fallback chain
            // covers S6 (Cosmic-only ramp) and S5 (mild ±0.1).
            const upStep   = S7_DD_PARAMS ? S7_DD_PARAMS.upStep   : (this._isS6 ? 0.30 : 0.1);
            const downStep = (this._isS6 || this._isS7) ? 0.05 : 0.1;
            const spawnCap = S7_DD_PARAMS ? S7_DD_PARAMS.spawnCap : (this._isS6 ? 3.5 : 2.0);
            const speedCap = S7_DD_PARAMS ? S7_DD_PARAMS.speedCap : (this._isS6 ? 2.5 : 2.0);
            // Early game (<60s) uses a more forgiving ramp-down threshold (0.5×
            // maxHp instead of 0.3×) — a couple of unlucky hits in the opening
            // shouldn't immediately throttle spawns and make the field feel dead
            // (Anubis feedback 2026-05-30).
            const downThreshold = (this.time < 60) ? 0.5 : 0.3;
            // DD floor raised to 0.85× on S6 (2026-05-30): even players taking heavy
            // damage keep a fuller field. Top players unaffected — they're above 1.0×.
            const ddFloor = this._isS6 ? 0.85 : 0.7;
            if (this.dynamicDifficulty.damageTaken > this.player.maxHp * downThreshold) {
                this.dynamicDifficulty.speedMult = Math.max(ddFloor, this.dynamicDifficulty.speedMult - downStep);
                this.dynamicDifficulty.spawnRateMult = Math.max(ddFloor, this.dynamicDifficulty.spawnRateMult - downStep);
            } else if (killsDelta > killThreshold) {
                // DD ramp-UP gate (2026-05-30 Simon bug): removed the
                // <5% maxHp damage constraint. Top players in AoE swarms take
                // unavoidable chip damage and were never qualifying for ramp-up,
                // even at 266+ kills/min. Kills alone now drive DD up — the
                // ramp-DOWN branch above still throttles anyone actually getting
                // hammered (>downThreshold maxHp in the window), so strugglers
                // are still protected. Strong play finally gets rewarded.
                this.dynamicDifficulty.speedMult = Math.min(speedCap, this.dynamicDifficulty.speedMult + upStep);
                this.dynamicDifficulty.spawnRateMult = Math.min(spawnCap, this.dynamicDifficulty.spawnRateMult + upStep);
            }
            this.dynamicDifficulty.lastKills = this.kills;
            this.dynamicDifficulty.damageTaken = 0;
            this.dynamicDifficulty.timer = 0;
            // S7 §4f: track peak spawn multiplier reached this run. Sent to
            // saveScore at run end as the basis for the HEAT score bonus
            // (1.0× DD = 1.0× HEAT, difficulty cap = 2.0× HEAT).
            this.ddPeakSpawnMult = Math.max(this.ddPeakSpawnMult || 1.0, this.dynamicDifficulty.spawnRateMult);
        }

        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= dt;
            return;
        }
        
        if (this.shakeTimer > 0) {
            this.shakeX = (Math.random() - 0.5) * this.shakeTimer * 20;
            this.shakeY = (Math.random() - 0.5) * this.shakeTimer * 20;
            this.shakeTimer -= dt;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        this.frameCount++;
        this.time += dt;
        
        if (this.frameCount % 30 === 0) {
            this.callbacks.onTimeChange(Math.floor(this.time));
        }

        // XP buff expiry check — drops the +50% multiplier mid-run if it ran out.
        // Ticks once per second (frame % 60) so we don't recompute every frame.
        if (this.xpBuffExpiry && this.frameCount % 60 === 0) {
            const stillActive = this.xpBuffExpiry > Date.now();
            if (this.player.xpBuffActive !== stillActive) {
                this.player.xpBuffActive = stillActive;
                this.player.xpMult = this._xpMultBase * (stillActive ? 1.5 : 1.0);
            }
        }

        // Endless gold: time-based accrual only. Enemy/boss drops are suppressed
        // (see EnemySpawner / EnemyAI). 10 gold/sec base × player.goldMult so
        // character/talent/VIP multipliers still feel meaningful. Accumulator
        // tracks fractional gold across frames so low rates accrue smoothly.
        if (this.arena.duration === Infinity) {
            this._endlessGoldAccum = (this._endlessGoldAccum || 0) + (10 * this.player.goldMult * dt);
            if (this._endlessGoldAccum >= 1) {
                const inc = Math.floor(this._endlessGoldAccum);
                this._endlessGoldAccum -= inc;
                this.gold += inc;
                this.callbacks.onGoldChange(this.gold);
            }
        }

        // Periodic safety snapshot — protects against Android tab kills mid-run.
        // Every ~10s for endless/world-boss arenas, dump current stats to localStorage.
        // If the tab dies before gameOver(), next launch picks this up and queues it
        // as a normal saveScore. ~6 writes/min — negligible storage churn.
        if (this.frameCount % 600 === 0 && (this.arena.duration === Infinity || this.arena.id === 'world_boss_arena')) {
            try {
                import('@/lib/runSnapshot').then(m => m.writeRunSnapshot(this._runStats()));
            } catch {}
        }

        // Cloud checkpoint — every ~2 min during endless/raid runs, push current
        // stats to PlayerSave.pendingRunSnapshot so a tab kill / device wipe / cache
        // clear / 25-min endless that loses session can still recover the run on
        // next launch (flushPendingScores promotes the cloud snapshot into the
        // saveScore queue). Safe because: syncSave treats pendingRunSnapshot as
        // server-owned (client cannot re-upload a stale snapshot), and saveScore
        // clears the field as soon as it credits a recovered run. Only fires
        // after the run has meaningful progress (≥30s, ≥5 kills) so a tester
        // alt-tabbing in the first few seconds doesn't spam writes.
        if (this.frameCount % 7200 === 0
            && (this.arena.duration === Infinity || this.arena.id === 'world_boss_arena')
            && (this.kills || 0) >= 5
            && (this.time || 0) >= 30
            && !this.save?.isSandbox) {
            // Sandbox runs never checkpoint — the server would reject the write and
            // we don't want practice progress recoverable via flushPendingScores.
            try {
                import('@/api/base44Client').then(({ base44 }) => {
                    base44.functions.invoke('checkpointRun', { stats: this._runStats() })
                        .catch(err => console.warn('[checkpointRun]', err?.message));
                });
            } catch {}
        }

        // Victory triggers:
        //  • Sectors: as soon as the boss is defeated (after a brief 3s grace for VFX
        //    and the loot recap text). Killing the boss ENDS the level — mobs no
        //    longer spawn during the grace (see EnemySpawner). The arena timer is
        //    only a fallback in case the player somehow runs out the clock without
        //    the boss spawning (shouldn't happen but defensive).
        //  • Endless / world boss arena: never trigger from this branch (duration is
        //    Infinity for endless, and world boss is its own thing).
        const inPostBossGrace = this.postBossGraceUntil && this.time < this.postBossGraceUntil;
        const sectorBossDone = this.sectorBossDefeated && !inPostBossGrace;
        const timerExpired = this.time >= this.arena.duration && !this.isBossActive && !inPostBossGrace;
        if ((sectorBossDone || timerExpired) && !this.isGameOver && !this.isVictory) {
            this.victory();
            return;
        }

        // Regen — S8+ uses a real-time accumulator (1× regen per real second on
        // every device). S7 and earlier keep the legacy frameCount % 60 tick so
        // the in-flight S7 leaderboard isn't retroactively changed.
        if (this.player.regen > 0) {
            if (this._isS8) {
                this._regenAcc = (this._regenAcc || 0) + dt;
                if (this._regenAcc >= 1.0) {
                    this._regenAcc -= 1.0;
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.regen);
                    this.callbacks.onHpChange(this.player.hp, this.player.maxHp);
                }
            } else if (this.frameCount % 60 === 0) {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.regen);
                this.callbacks.onHpChange(this.player.hp, this.player.maxHp);
            }
        }

        // Endless XP trickle — after 5 minutes, gain a small passive XP stream so
        // levelling isn't entirely boss-gated. Scales with the current XP requirement
        // (~one level every ~3 minutes of pure idling, faster with kills).
        // S6+ Fix B: trickle uses the no-buff baseline (skips the 1.5× session buff)
        // AND halts past level 50 so 90-min endless AFK can't spam Overcharge picks
        // forever. The buff still applies normally to kill XP — only the passive
        // trickle is excluded. S5 keeps the legacy behaviour.
        if (this.arena.duration === Infinity && this.time > 300) {
            if (this._isS6 && this.level >= 50) {
                // skip — endless AFK ceiling
            } else {
                const trickleMult = this._isS6 ? (this._xpMultBase || this.player.xpMult) : this.player.xpMult;
                const trickle = (this.xpRequired / 180) * dt * trickleMult;
                this.xp += trickle;
            }
        }

        // Movement input
        let dx = 0, dy = 0;
        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;
        
        let usingGamepad = false;
        // Skip the (relatively expensive) getGamepads() call entirely when no
        // gamepad has ever been connected this session. GamepadManager flips
        // window.__gamepadConnected on the gamepadconnected event.
        if (typeof navigator !== 'undefined' && navigator.getGamepads && window.__gamepadConnected) {
            const gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp && gp.connected) {
                    const axeX = gp.axes[0] || 0;
                    const axeY = gp.axes[1] || 0;
                    const deadzone = 0.15;
                    
                    if (Math.abs(axeX) > deadzone || Math.abs(axeY) > deadzone) {
                        dx = axeX;
                        dy = axeY;
                        usingGamepad = true;
                    }
                    
                    if (gp.buttons[12] && gp.buttons[12].pressed) { dy = -1; usingGamepad = true; }
                    if (gp.buttons[13] && gp.buttons[13].pressed) { dy = 1; usingGamepad = true; }
                    if (gp.buttons[14] && gp.buttons[14].pressed) { dx = -1; usingGamepad = true; }
                    if (gp.buttons[15] && gp.buttons[15].pressed) { dx = 1; usingGamepad = true; }
                    
                    if (usingGamepad) break;
                }
            }
        }
        
        if (this.joystick.x !== 0 || this.joystick.y !== 0) {
            dx = this.joystick.x;
            dy = this.joystick.y;
        } else if (usingGamepad) {
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 1) {
                dx /= len; dy /= len;
            }
        } else if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx*dx + dy*dy);
            dx /= len; dy /= len;
        }
        
        let moveMultiplier = 1.0;
        if (this.characterId === 'dataphantom' && this.player.phantomBoostTimer > 0) moveMultiplier = 1.5;

        const actualSpeed = this.player.speed * this.player.speedMult * 60 * dt * moveMultiplier;
        this.player.x += dx * actualSpeed;
        this.player.y += dy * actualSpeed;

        this.player.isMoving = (dx !== 0 || dy !== 0);
        if (dx < 0) this.player.facingLeft = true;
        else if (dx > 0) this.player.facingLeft = false;
        
        if (this.player.isMoving) {
            this.player.moveTimer = (this.player.moveTimer || 0) + dt * 15;
        } else {
            this.player.moveTimer = 0;
        }

        if (this.player.invincibleTimer > 0) this.player.invincibleTimer -= dt;
        if (this.player.iFrames > 0) this.player.iFrames -= dt;
        if (this.player.synAmpTimer > 0) this.player.synAmpTimer -= dt;
        if (this.player.bribeCooldown > 0) this.player.bribeCooldown -= dt;
        
        this.zoom = window.innerWidth < 768 ? 0.5 : 0.8;
        this.camera.x = this.player.x - (this.canvas.width / this.zoom) / 2;
        this.camera.y = this.player.y - (this.canvas.height / this.zoom) / 2;

        this.spawnEnemies(dt);
        this.updateWeapons(dt);
        
        if (!this.enemyPool) this.enemyPool = [];

        // Build Spatial Hash for Collision Optimization.
        // Reuse the Map + cell arrays across frames to avoid GC churn — at 200+
        // enemies × 60fps the previous "new Map() + fresh arrays" approach was
        // ~12k allocations/sec and a real source of stutter in long endless runs.
        if (!this.spatialHash) this.spatialHash = new Map();
        // Clear cell arrays in place; keep the Map keys for reuse next frame.
        for (const arr of this.spatialHash.values()) arr.length = 0;
        // Cache active bosses once per frame so projectile code doesn't re-filter
        // engine.enemies for every single bullet (was O(projectiles × enemies)).
        this._activeBosses = [];
        const cellSize = CELL_SIZE;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.hp <= 0) continue;
            if (e.isBoss) this._activeBosses.push(e);
            const cx = Math.floor(e.x / cellSize);
            const cy = Math.floor(e.y / cellSize);
            const key = cellKey(cx, cy);
            let cell = this.spatialHash.get(key);
            if (!cell) { cell = []; this.spatialHash.set(key, cell); }
            cell.push(e);
        }

        this.updateProjectiles(dt);
        this.updateEnemies(dt);
        this.updatePickups(dt);
        this.updateHazards(dt);
        updateSquadClones(this, dt);

        updateCharacterMechanics(this, dt, dx, dy);

        if (this.xp >= this.xpRequired && !this.isPaused && !this.isGameOver && !this.isVictory) {
            this.levelUp();
        }

        // Squad Meteor — kick off the 10-stack starter level-ups on the first
        // unpaused tick. XP is intentionally NOT used here (raid uses XP and
        // gets overshoot with stacked XP buffs — Texxy explicitly wants Lv.10
        // exactly). Subsequent picks chain via applyUpgrade → levelUp().
        if (this.pendingStarterLevelUps > 0 && !this._starterStackBegan && !this.isPaused) {
            this._starterStackBegan = true;
            this.levelUp();
        }
        
        // In-run character pickup spawning was the OLD unlock method — disabled
        // since unlocks are now exclusively server-granted at kill milestones via saveScore.
        // Keeping `this.characterPickup` null guarantees the pickup never spawns or grants.

        // Particles & Text
        this.particleManager.update(dt);
        
        // PERF 2026-08-07 — in-place compaction instead of allocating a new array
        // every frame (same for envParticles below).
        {
            let w = 0;
            for (let i = 0; i < this.damageTexts.length; i++) {
                const t = this.damageTexts[i];
                t.life -= dt;
                t.y -= 20 * dt;
                if (t.life > 0) this.damageTexts[w++] = t;
            }
            this.damageTexts.length = w;
        }

        // Environmental Effects Update
        const vWidth = this.canvas.width / this.zoom;
        const vHeight = this.canvas.height / this.zoom;
        
        if (this.envEffect === 'neon_rain' && Math.random() < 0.5) {
            this.envParticles.push({ x: this.player.x + (Math.random() * vWidth * 1.5 - vWidth * 0.75), y: this.player.y - vHeight/2 - 50, vx: 100, vy: 600 + Math.random() * 300, life: 2, color: Math.random() > 0.5 ? '#00ffff' : '#ff00ff', length: 20 + Math.random() * 20 });
        } else if (this.envEffect === 'fog' && Math.random() < 0.05) {
            this.envParticles.push({ x: this.player.x + (Math.random() * vWidth * 2 - vWidth), y: this.player.y + (Math.random() * vHeight * 2 - vHeight), vx: 20 + Math.random() * 30, vy: 10 + Math.random() * 20, life: 10, size: 200 + Math.random() * 300 });
        } else if (this.envEffect === 'solar_flare') {
            if (Math.random() < 0.05) {
                this.envParticles.push({ type: 'flare', x: this.player.x + (Math.random() * vWidth * 1.5 - vWidth * 0.75), y: this.player.y + (Math.random() * vHeight * 1.5 - vHeight * 0.75), life: 2.0, maxLife: 2.0, size: 100 + Math.random() * 200, angle: Math.random() * Math.PI * 2 });
            }
            if (Math.random() < 0.3) {
                this.envParticles.push({ type: 'ember', x: this.player.x + (Math.random() * vWidth * 1.5 - vWidth * 0.75), y: this.player.y + vHeight / 2 + 50, vx: (Math.random() - 0.5) * 200, vy: -200 - Math.random() * 200, life: 3.0, maxLife: 3.0, size: 2 + Math.random() * 3 });
            }
        }

        {
            let w = 0;
            for (let i = 0; i < this.envParticles.length; i++) {
                const p = this.envParticles[i];
                p.life -= dt;
                if (p.vx) p.x += p.vx * dt;
                if (p.vy) p.y += p.vy * dt;
                if (p.life > 0) this.envParticles[w++] = p;
            }
            this.envParticles.length = w;
        }
    }

    spawnEnemies(dt) { spawnEnemiesLogic(this, dt); }
    updateProjectiles(dt) { updateProjectilesLogic(this, dt); }
    updateEnemies(dt) { updateEnemiesLogic(this, dt); }
    updatePickups(dt) { updatePickupsLogic(this, dt); }
    levelUp() { levelUpLogic(this); }
    rerollChoices() {
        // Defensive — guarantee the engine stays paused while the new choices
        // are rendered. Without this, any path that briefly flipped isPaused
        // (e.g. a confirmation modal closing) would let mobs deal a killing
        // blow to a player who's mid-reroll, triggering the revive modal
        // ON TOP of the still-open LevelUpModal (Tijckers bug 2026-05-14).
        this.isPaused = true;
        this._levelUpPending = true;
        this.callbacks.onLevelUp(generateChoicesLogic(this));
    }
    generateChoices() { return generateChoicesLogic(this); }
    applyUpgrade(upgrade) { applyUpgradeLogic(this, upgrade); }
    checkSynergies() { checkSynergiesLogic(this); }
    checkEvolutions() { checkEvolutionsLogic(this); }

    updateHazards(dt) {
        if (this.difficulty.hazardChance > 0 && Math.random() < this.difficulty.hazardChance * dt) {
            const hx = this.player.x + (Math.random() * 600 - 300);
            const hy = this.player.y + (Math.random() * 600 - 300);
            this.hazards.push({
                x: hx, y: hy,
                radius: 60,
                damage: 30 * this.difficulty.enemyDmgMult,
                timer: 2.0,
                active: false
            });
        }

        let hw = 0;
        for (let hi = 0; hi < this.hazards.length; hi++) {
            const h = this.hazards[hi];
            h.timer -= dt;
            if (h.timer <= 0 && !h.active) {
                h.active = true;
                h.timer = 0.5;
                if (Math.hypot(this.player.x - h.x, this.player.y - h.y) < this.player.radius + h.radius) {
                    this.takeDamage(h.damage, 'Cosmic Hazard');
                }
                this.addParticle(h.x, h.y, '#ff4500', 20);
            }
            if (h.timer > 0) this.hazards[hw++] = h;
        }
        this.hazards.length = hw;
    }

    updateWeapons(dt) {
        // Tier-7 NeoByte mastery: banner buff +50% stronger (1.3x → 1.45x cooldown speed)
        const bannerBuffMult = this.masteryAbilityBoost?.banner?.buffMult || 1.0;
        const bannerCdBoost = 1.0 + (0.3 * bannerBuffMult);
        const timeMultiplier = (this.characterId === 'neobyte' && this.player.bannerBuff) ? bannerCdBoost : 1.0;
        // Sandbox: infinite cooldowns → fire every tick by force-clearing timers.
        if (this._sandboxInfiniteCd) {
            this.player.weapons.forEach(w => { w.timer = 0; });
        }
        this.player.weapons.forEach(w => {
            w.timer -= dt * timeMultiplier;
            if (w.timer <= 0) {
                this.fireWeapon(w);
                
                // 3rd arg = isOuterGalaxy — Outer Galaxy applies "Overforge" tier-3
                // augment stacking (e.g. cd_3 × 2 = -70% CD instead of -35%).
                const stats = getWeaponStatsAndMastery(this.save, w.id, this._outerGalaxyActive);
                const cdMultiplier = stats.cdMult;
                
                // S7 §4a: pushback weapons (shield/aegis/burning barrier) get a
                // lifted CD floor of 0.85× (vs 0.5× default) to break the
                // stacked-overlap exploit. Inner-Galaxy/old behaviour unchanged.
                const cdFloor = (this._isS7 && S7_PUSHBACK_WEAPONS.has(w.id)) ? 0.85 : 0.5;
                w.timer = (w.baseCooldown / 60) * Math.max(0.35, this.player.cooldownMult) * Math.max(cdFloor, cdMultiplier);
            }
        });
    }

    fireWeapon(w) {
        fireWeaponLogic(this, w);
    }

    damageEnemy(enemy, amount, projectile = null) {
        let damageMult = 1.0;
        let isFullyMastered = false;

        if (this.characterId === 'neobyte' && this.player.bannerBuff) {
            // Tier-7 NeoByte mastery: banner damage buff +50% stronger (1.3x → 1.45x)
            const bannerBuffMult = this.masteryAbilityBoost?.banner?.buffMult || 1.0;
            damageMult *= 1.0 + (0.3 * bannerBuffMult);
        }
        if (this.player.charAugments?.includes('neo_surge') && this.time <= 30) {
            damageMult *= 1.25;
        }
        
        if (enemy && enemy.id) {
            const pastKills = this.save?.enemyKills?.[enemy.id] || 0;
            
            // PERF 2026-08-03 — tables hoisted to module constants (see top of file).
            // Same values, same precedence, zero allocation per hit.
            let milestones = KILL_MILESTONES_DEFAULT;
            if (enemy.isBoss) milestones = KILL_MILESTONES_BOSS;
            else if (enemy.tier >= 9) milestones = KILL_MILESTONES_TIER9;
            else if (enemy.tier >= 5) milestones = KILL_MILESTONES_TIER5;

            let achievedBonus = 0;
            for (let i = milestones.length - 1; i >= 0; i--) {
                if (pastKills >= milestones[i].kills) {
                    achievedBonus = milestones[i].bonus;
                    break;
                }
            }
            damageMult += (achievedBonus / 100);
            isFullyMastered = pastKills >= milestones[milestones.length - 1].kills;
        }

        let finalDamage = amount * damageMult;
        let isCrit = false;
        let isWeakHit = false;

        // Check boss weak side
        if (enemy.isBoss && enemy.weakSide && projectile) {
            const bossForwardAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
            const hitAngle = Math.atan2(-projectile.vy, -projectile.vx);
            let diff = Math.abs(hitAngle - bossForwardAngle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;

            if (enemy.weakSide === 'back' && diff < Math.PI * 0.35) {
                isWeakHit = true;
            } else if (enemy.weakSide === 'side' && diff > Math.PI * 0.3 && diff < Math.PI * 0.7) {
                isWeakHit = true;
            }

            if (isWeakHit) {
                finalDamage *= 2.0;
            }
        }

        const critChance = 0.05 + (this.player.luck * 0.02) + (this.player.critBonus || 0);
        if (Math.random() < critChance) {
            isCrit = true;
            finalDamage *= 1.5;
        }
        
        enemy.hp -= finalDamage;
        this.totalDamageDealt += finalDamage;

        // Accumulate into the current 0.5s DPS bucket (used by the HUD).
        this._addDps(finalDamage);

        // Credit damage to source weapon (if any) and remember last hitter for kill credit.
        // If the caller didn't tag this hit, bucket it under 'untaggedAoE' so it
        // shows up as a clear named row in RunStatsBox instead of silently bloating
        // "Other" (Anubis bug 2026-05-17 — 81% in Other on an AoE-stack run).
        // Dev-only one-shot console.warn helps hunt down the source on next run.
        const sourceId = projectile?.weaponId || 'untaggedAoE';
        this.weaponDamage[sourceId] = (this.weaponDamage[sourceId] || 0) + finalDamage;
        if (projectile?.weaponId) {
            enemy._lastWeaponId = sourceId;
        } else if (!this._warnedUntaggedTypes) {
            this._warnedUntaggedTypes = new Set();
        }
        if (!projectile?.weaponId && this._warnedUntaggedTypes) {
            const tag = projectile?.type || 'no-projectile';
            if (!this._warnedUntaggedTypes.has(tag)) {
                this._warnedUntaggedTypes.add(tag);
                console.warn('[Untagged damage source]', tag, projectile);
            }
        }

        // Don't let local damage "kill" the world boss — the server handles
        // boss level-ups when this run's total damage is submitted. Clamp at 1 HP
        // so the visual bar can drain to nearly empty without ending the run early.
        if (enemy.isWorldBoss && enemy.hp < 1) enemy.hp = 1;
        
        if (this.player.charAugments?.includes('glt_corrupt') && Math.random() < 0.15 && !enemy.isBoss) {
            enemy.hacked = true;
            enemy.color = '#39FF14';
        }

        const executeThreshold = this.masteryAbilityBoost?.executeThreshold ?? 0.2;
        // Execute exempts bosses, elites, and tier-12+ enemies (Outer Galaxy mythics).
        // Previous cutoff was tier 7 which killed the skill entirely in Outer Galaxy
        // sectors 11-20 where almost every enemy is tier 11+. Raised to tier 12 so the
        // skill stays useful on standard Outer Galaxy grunts while still preventing
        // NeonVortex from vaporising the apex mythic-tier enemies that were causing
        // the original snowball (balance pass 2026-05-02 → revised 2026-06-16).
        if (this.characterId === 'neonvortex' && !enemy.isBoss && !enemy.isElite && (enemy.tier || 0) < 12 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * executeThreshold) {
            enemy.hp = 0;
            this.addDamageText(enemy.x, enemy.y - 20, "EXECUTED", '#7A00FF');
            for(let i=0; i<3; i++) {
                const angle = (Math.PI * 2 / 3) * i + Math.random();
                this.projectiles.push({
                    x: enemy.x, y: enemy.y,
                    vx: Math.cos(angle) * 800,
                    vy: Math.sin(angle) * 800,
                    radius: 8,
                    damage: this.player.damageMult * 30,
                    pierce: 3,
                    life: 2,
                    color: '#7A00FF',
                    type: 'railgun',
                    // Credit NeonVortex execute splash to neonExecute so it appears in
                    // the post-run weapon breakdown (Texxy bug 2026-05-15).
                    weaponId: 'neonExecute'
                });
            }
        }

        if (enemy.isWorldBoss) {
            // Route damage to the right bucket: meteor target → runMeteorDamage,
            // actual world boss → worldBossDamage. Both reuse the world-boss render
            // pipeline (clamped HP, floating damage-buffer text) but count separately.
            if (enemy._isMeteorTarget) {
                this.runMeteorDamage = (this.runMeteorDamage || 0) + finalDamage;
            } else {
                this.worldBossDamage += finalDamage;
            }

            enemy.damageBuffer = (enemy.damageBuffer || 0) + finalDamage;
            if (isCrit) enemy.hadCritInBuffer = true;
            if (isWeakHit) enemy.hadWeakInBuffer = true;
            
            if (!enemy.lastDamageTextTime) enemy.lastDamageTextTime = this.time;
            
            if (this.time - enemy.lastDamageTextTime >= 0.25) {
                let color = enemy.hadCritInBuffer ? '#ff4444' : '#ffffff';
                if (enemy.hadWeakInBuffer) {
                    color = '#ffdd00';
                    this.addDamageText(enemy.x, enemy.y - 30, 'WEAK SPOT!', '#ffdd00', false);
                }
                this.addDamageText(enemy.x, enemy.y - 10, Math.floor(enemy.damageBuffer), color, enemy.hadCritInBuffer);
                enemy.damageBuffer = 0;
                enemy.hadCritInBuffer = false;
                enemy.hadWeakInBuffer = false;
                enemy.lastDamageTextTime = this.time;
            }
            if (Math.random() < 0.1) SFXManager.playEnemyHit();
            return;
        }

        let color = isCrit ? '#ff4444' : (isFullyMastered ? '#ff00ff' : '#ffffff');
        if (enemy.isBoss) {
            if (isWeakHit) {
                color = '#ffdd00';
                this.addDamageText(enemy.x, enemy.y - 30, 'WEAK SPOT!', '#ffdd00', false);
            }
            this.addDamageText(enemy.x, enemy.y - 10, Math.floor(finalDamage), color, isCrit);
        }
        SFXManager.playEnemyHit();
    }

    shake(amount) {
        // C3 2026-08-03 — floor. Anything under 0.08 is sub-perceptual as an
        // event but still holds the camera off-centre, which is what turned a
        // stream of small shakes into a permanent tremor. Ignore them outright
        // so screenshake only ever means "something happened".
        if (!(amount >= 0.08)) return;
        this.shakeTimer = Math.max(this.shakeTimer, amount);
    }

    // Rolling 10s DPS — averages only the most recent damage so the HUD reflects
    // upgrades immediately (vs. dividing total run damage by total run time, which
    // makes late-run buffs invisible).
    // Advance the ring to the bucket for `this.time`, zeroing any buckets skipped
    // along the way (a gap means no damage was dealt during them). Rolling past 10s
    // of buckets just clears the whole ring.
    _addDps(amount) {
        const BUCKET = 0.5;
        const slots = this._dpsBuckets.length;
        const steps = Math.floor((this.time - this._dpsBucketTime) / BUCKET);
        if (steps > 0) {
            if (steps >= slots) {
                this._dpsBuckets.fill(0);
                this._dpsBucketIdx = 0;
            } else {
                for (let i = 0; i < steps; i++) {
                    this._dpsBucketIdx = (this._dpsBucketIdx + 1) % slots;
                    this._dpsBuckets[this._dpsBucketIdx] = 0;
                }
            }
            this._dpsBucketTime += steps * BUCKET;
        }
        this._dpsBuckets[this._dpsBucketIdx] += amount;
    }

    getRollingDps() {
        // Roll the ring forward first so stale buckets expire even when no damage
        // has been dealt recently (otherwise the HUD would freeze on an old value).
        this._addDps(0);
        let sum = 0;
        for (let i = 0; i < this._dpsBuckets.length; i++) sum += this._dpsBuckets[i];
        if (sum === 0) return 0;
        // Use elapsed window length (clamped to actual observed span) to keep early-run DPS sane.
        const span = Math.max(1, Math.min(this.DPS_WINDOW, this.time));
        return sum / span;
    }

    addParticle(x, y, color, count, type = 'spark', sizeMult = 1) {
        this.particleManager.addParticle(x, y, color, count, type, sizeMult);
    }

    addDamageText(x, y, text, color, isCrit = false) {
        if (this.damageTexts.length > 40 && !isCrit && text !== 'WEAK SPOT!') return;
        const offsetX = (Math.random() - 0.5) * 20;
        this.damageTexts.push({ x: x + offsetX, y, text, color, life: 0.8, isCrit });
        if (this.damageTexts.length > 60) this.damageTexts.shift();
    }

    banishUpgrade(upgradeId) {
        if (!this.banishedUpgrades) this.banishedUpgrades = new Set();
        this.banishedUpgrades.add(upgradeId);
    }

    // ─── SANDBOX DEV-TOOLS API ──────────────────────────────────────────────
    // Only wired to the in-run SandboxDevPanel (Game.jsx renders that panel
    // only when save.isSandbox is true). Every method here is a no-op unless
    // save.isSandbox, so a tampered client can't smuggle these into a real
    // run — even if it did, the server-side is_sandbox rejection would
    // still block any rewards. See docs/s8/PLAN_SANDBOX_TEST_PLAY.md.
    _sandboxGuard() { return !!this.save?.isSandbox; }

    sandboxSpawnEnemy(enemyId, count = 1) {
        if (!this._sandboxGuard()) return;
        const template = ENEMIES.find(e => e.id === enemyId);
        if (!template) return;
        for (let i = 0; i < count; i++) {
            // Spawn at a random offset around the player, same distance the
            // real spawner uses (canvas-scaled + a bit outside the view).
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.min(900, Math.max(this.canvas.width / this.zoom, this.canvas.height / this.zoom) / 2 + 50);
            const enemy = { ...template };
            enemy.x = this.player.x + Math.cos(angle) * dist;
            enemy.y = this.player.y + Math.sin(angle) * dist;
            enemy.hp = template.hp;
            enemy.maxHp = template.hp;
            enemy.damage = template.damage;
            enemy.speed = template.speed;
            this.enemies.push(enemy);
            this.encounteredEnemies.add(template.id);
        }
        if (template.isBoss) this.isBossActive = true;
    }

    sandboxClearEnemies() {
        if (!this._sandboxGuard()) return;
        this.enemies = [];
        this.isBossActive = false;
    }

    sandboxGrantWeapon(weaponId) {
        if (!this._sandboxGuard()) return;
        const template = WEAPONS[weaponId];
        if (!template) return;
        const existing = this.player.weapons.find(w => w.id === weaponId);
        if (existing) {
            // Cap at level 5 — same cap as the real level-up upgrade pool.
            existing.level = Math.min(5, (existing.level || 1) + 1);
        } else {
            this.player.weapons.push({ ...template, level: 1, timer: 0 });
        }
        this.addDamageText(this.player.x, this.player.y - 40, `+ ${template.name}`, '#facc15');
    }

    sandboxGrantPassive(upgradeId) {
        if (!this._sandboxGuard()) return;
        const upgrade = UPGRADES.find(u => u.id === upgradeId && u.type === 'passive');
        if (!upgrade) return;
        // Bump passive-level tracking so the HUD shows the stack.
        this.player.passiveLevels[upgradeId] = (this.player.passiveLevels[upgradeId] || 0) + 1;
        if (!this.player.passives.find(p => p.id === upgradeId)) {
            this.player.passives.push(upgrade);
        }
        // Apply the stat directly. Mirrors UpgradeSystem.applyUpgrade's passive branch.
        if (upgrade.stat === 'maxHp') {
            this.player.maxHp += upgrade.value;
            this.player.hp += upgrade.value;
            this.callbacks?.onHpChange?.(this.player.hp, this.player.maxHp);
        } else if (typeof this.player[upgrade.stat] === 'number') {
            this.player[upgrade.stat] += upgrade.value;
        }
        this.addDamageText(this.player.x, this.player.y - 40, `+ ${upgrade.name}`, '#facc15');
    }

    sandboxForceLevelUp() {
        if (!this._sandboxGuard()) return;
        // Fill XP + trigger a level-up modal without waiting for the meter.
        this.xp = this.xpRequired;
        this.levelUp();
    }

    sandboxSetInvincible(on) {
        if (!this._sandboxGuard()) return;
        this._sandboxInvincible = !!on;
        // Iterate iFrames — the takeDamage guard already respects iFrames > 0.
        // Setting a huge iFrame value keeps the player untouchable until toggled off.
        if (on) {
            this.player.iFrames = Number.MAX_SAFE_INTEGER;
            this.player.invincibleTimer = Number.MAX_SAFE_INTEGER;
        } else {
            this.player.iFrames = 0;
            this.player.invincibleTimer = 0;
        }
    }

    sandboxSetInfiniteCooldowns(on) {
        if (!this._sandboxGuard()) return;
        this._sandboxInfiniteCd = !!on;
        // When on, weapon timers are forced to 0 each tick (see loop patch).
    }

    sandboxSetTimeScale(mult) {
        if (!this._sandboxGuard()) return;
        this._sandboxTimeScale = Math.max(1, Math.min(4, Number(mult) || 1));
    }

    _runStats(extra = {}) {
        return {
            time: Math.floor(this.time), level: this.level, kills: this.kills, gold: this.gold,
            characterId: this.characterId, arenaId: this.arena?.id,
            encountered: Array.from(this.encounteredEnemies), enemyKills: this.enemyKills,
            worldBossDamage: this.worldBossDamage || 0,
            meteorDamage: Math.floor(this.runMeteorDamage || 0),
            totalDamageDealt: Math.floor(this.totalDamageDealt || 0),
            bossesKilled: this.bossesKilled || 0, elitesKilled: this.elitesKilled || 0,
            weaponDamage: this.weaponDamage || {},
            weaponKills: this.weaponKills || {},
            killedBy: this._lastDamageSource || null,
            fragments: this.runFragments || 0,
            // S7 §4f: difficulty + DD peak feed the server-side HEAT score bonus.
            difficulty: this.difficulty?.id || 'normal',
            ddPeakSpawnMult: this.ddPeakSpawnMult || 1.0,
            // Season the run STARTED in — server honors if strictly older than
            // current server season, so pre-rollover runs bank into the right
            // leaderboard and their score uses the correct-era formula.
            runSeasonId: this._runSeasonId || null,
            // S8 Sandbox — mirror the flag so every downstream server call (saveScore,
            // checkpointRun, submitBossDamage, submitSquadMeteorDamage) sees it and
            // rejects the run-mutating write. Read from save at construction time.
            is_sandbox: !!this.save?.isSandbox,
            ...extra
        };
    }
    gameOver() {
        this.isGameOver = true;
        if (this.save) { this.save.enemyKills = this.enemyKills; SaveManager.save(this.save); }
        SFXManager.playGameOver();
        // DO NOT clear the safety snapshot here — if the player navigates away
        // before saveScore returns (back button, force-close, lock screen), the
        // request is cancelled and the run would be lost. The snapshot is the
        // recovery net, so we keep it until saveScore CONFIRMS success in Game.jsx
        // (which clears it via clearRunSnapshot()). saveScore's dup-check (last
        // 2 minutes) prevents double-crediting if a hot-reload re-queues it.
        this.callbacks.onGameOver(this._runStats());
    }
    victory() {
        this.isVictory = true;
        SFXManager.playVictory();
        // Same as gameOver — keep snapshot until saveScore confirms success.
        // Strip killedBy on victory — the player WON, so showing "killed by X" in
        // the victory modal is misleading. Belt-and-braces: VictoryModal already
        // passes hideKilledBy, but this guarantees no UI path can leak it.
        this.callbacks.onVictory(this._runStats({ arenaId: this.arena.id, killedBy: null }));
    }

    draw() {
        renderGame.call(this);
    }
}