# S7 Layer Audit — Power stacking from in-run to meta

Code refs: `game/Constants.js` (`UPGRADES`, `RELICS`, `CHARACTER_TALENTS`, `getWeaponStatsAndMastery`), `game/GameEngine.js` (constructor — stat assembly), `game/UpgradeSystem.js`, `functions/forgeAction`, `game/NFTPerks.js`.

Every multiplicative layer a player can stack, what it touches, what caps it. Read top-to-bottom = lowest commitment (in-run) to highest commitment (account-wide grinds).

---

## Layer 1 — In-run passive upgrades (`UPGRADES`)

11 picks available. Each can stack to MAX_PASSIVE_LEVEL = 5. Rarity multiplier on each pick: Common 1×, Rare 1.5×, Epic 2×, Legendary 3×.

| ID | Stat | Per-pick value | Max contribution (5× Legendary) |
|---|---|---|---|
| `dmg_up` | damageMult | +0.10 | +1.50 (i.e. +150%) |
| `spd_up` | speedMult | +0.10 | +1.50 |
| `hp_up` | maxHp | +20 | +300 |
| `area_up` | areaMult | +0.10 | +1.50 |
| `cd_down` | cooldownMult | -0.05 | -0.75 (i.e. -75%) |
| `magnet_up` | magnetRange | +25 | +375 |
| `regen_up` | regen | +0.5 | +7.5/sec |
| `armor_up` | armor | +2 | +30 |
| `gold_up` | goldMult | +0.20 | +3.00 |
| `proj_spd` | projSpeedMult | +0.15 | +2.25 |
| `xp_up` | xpMult | +0.15 | +2.25 |

**S6+ Overcharge fillers** (only used once normal pool is exhausted, no cap):
- `oc_dmg` +3% dmg, `oc_armor` +1, `oc_hp` +30, `oc_cd` -2%, `oc_gold` +5%, `oc_luck` +1.

**Distinct passives per build:** typically 3-5 unique pick IDs (with 5 stacks each = 15-25 total picks). With slot cap of 6 weapons + ~20 passives = a 40-level run is required to "max" a build.

---

## Layer 2 — Character talents (perm/weekly/seasonal tiers)

Code ref: `GameEngine.js:97-122`. Each character has 5 talent slots; player can equip 3 in a loadout (T1 + 1×T2 + 1×T3).

**Stack rule:** SAME talent ID across perm/weekly/seasonal contributes `1.0 + 0.66 + 0.66 = 2.32×` value (S6+; S5 was 3.0×). Different IDs stack normally.

**Per-talent magnitudes:** T1 = ~+10% / +3 armor / +25 magnet. T2 = ~+15-25% / -12% CD / +40 HP. T3 = ~+25-30% / +60 HP / +60 magnet.

A maxed (5/5/5) talent on a single stat = `(0.10 base × 1.0) + (0.10 × 0.66) + (0.10 × 0.66) = 23.2%` for a 10%-per-tier talent. The aggregate `talentBonus` object can comfortably hit +50-70% on one stat for a focused build.

---

## Layer 3 — Permanent stat upgrades (`saveStats`)

Code ref: `GameEngine.js:71-95`. Bought with gold from the Upgrades page. Same diminishing rule: `STACK_FACTOR = 0.66` on weekly/seasonal.

Per-tier values (perm × 1.0 / weekly × 0.66 / seasonal × 0.66):
| Stat | Perm tier | Weekly tier | Seasonal tier |
|---|---|---|---|
| health | +5 HP | +10 HP | +20 HP |
| speed | +2% | +5% | +10% |
| damage | +2% | +5% | +10% |
| magnet | +5 | +15 | +30 |
| regen | +0.1 | +0.2 | +0.5 |
| cooldown | -2% | -5% | -10% |
| luck | +1 | +2 | +3 |

At 5/5/5 maxed: `(5×0.02) + (5×0.05×0.66) + (5×0.10×0.66) = +59.5%` damage.

---

## Layer 4 — Equipped relics (5 slots)

Code ref: `Constants.js` `RELICS`, `GameEngine.js:184-197`. Each relic levels 1-5 (values scale). Up to 3 equipped at once. Prestige adds +5% per tier (PL1-PL5).

| Relic | Stat | L1 → L5 | Prestige max |
|---|---|---|---|
| Cosmic Dice | luck | +1 → +5 | +6.25 |
| Midas Core | goldMult | +10% → +50% | +62.5% |
| Knowledge Drive | xpMult | +10% → +50% | +62.5% |
| Blood Chalice | regen | +0.2 → +1.0/sec | +1.25/sec |
| Annihilation Core | damageMult | +5% → +25% | +31.25% |

**Cosmic Dice luck directly affects nuke drop rate** (`EnemyAI.js:217`):
```
nuke drop chance = 0.01 + (player.luck × 0.001)
```
A Cosmic Dice L5 + CodeBreaker (3 base luck) + Lucky Glitch talent (3 luck) + Crypto Mining talent (3 luck) + permanent luck stats = ~20 luck → 3% per kill drop rate. Up from 1% baseline.

---

## Layer 5 — Forge augments (weapon + character)

Code ref: `functions/forgeAction`, `Constants.js` `getWeaponStatsAndMastery`. Crafted with relic fragments. Per-weapon augments stack per weapon (and inherit through evolutions/synergies via `EVOLUTION_PARENT` map).

**Weapon augments (max 1 per weapon per stat):**
| Augment | Effect | Outer Galaxy (S11+) |
|---|---|---|
| damage_1 | +15% wDmg | unchanged |
| damage_2 | +35% wDmg | unchanged |
| damage_3 | +60% wDmg | **+120%** (2× stack) |
| area_1 | +15% wArea | unchanged |
| area_2 | +35% wArea | unchanged |
| area_3 | +60% wArea | **+120%** |
| cd_1 | -10% wCD | unchanged |
| cd_2 | -20% wCD | unchanged |
| cd_3 | -35% wCD | **-70%** |

Full augment stack on one weapon: `+(15+35+60) = +110%` damage / `+(15+35+60) = +110%` area / `-(10+20+35) = -65%` CD. Outer Galaxy uncaps T3 to 2×, taking damage to +170%, area to +170%, CD to -100% (but the `Math.max(0.5, ...)` floor still applies).

**Character augments** (`save.forgeCharAugments`): per-character build-defining picks. Examples:
- `neo_crit` +8% crit, `neo_surge` +25% dmg first 30s, `neo_rail` every 5th shot ×3 dmg
- `pan_armor` +3 armor, `pan_fortress` -15% dmg at full HP, `pan_stomp` whip slows
- `nova_aoe` +20% area, `nova_chain` 2 missiles per pulse, `nova_nuke` 7% boss-spawn nova
- `holo_regen` +0.3 regen, `holo_revive` 1× emergency revive, `holo_speed` +10% speed
- `code_xp` +15% xp, `code_hack` 5% extra gold drop on kill, `code_virus` hack spread on kill
- `syn_gold` +20% gold, `syn_beat` every 4th shot +pushback, `syn_amp` 5s ×2 area on level-up
- `sky_speed` +15% speed, `sky_ace` 3s i-frames on level-up, `sky_twin` twin laser per shot
- `glt_phase` 10% on-hit phase, `glt_copy` HoloDrift-style decoys, `glt_corrupt` 15% hack on hit
- `dat_drain` +1% HP every 10 kills, `dat_shade` 2s i-frames + smoke on damage, `dat_ghost` 5s start i-frames

These are deep build-defining picks — the game already has VS-genre-leading customization here.

---

## Layer 6 — Character mastery (kills-grind)

Tier 1-5 shared (`CHARACTER_MASTERY_LEVELS`): cumulative +5% spd, +10% dmg, +15% area, -10% CD at 25k kills.

T6 (50k) and T7 (100k) per-character (`CHARACTER_MASTERY_SIGNATURE`). Already documented in [`S7_CHARACTER_AUDIT.md`](./S7_CHARACTER_AUDIT.md#mastery-tiers-1-7-per-character).

**Important caveat:** evolved/synergy weapons inherit mastery from their parent base weapon. `EVOLUTION_PARENT` map in Constants.js — synergies take MAX of each stat across both parents.

---

## Layer 7 — Enemy kill mastery (per-enemy)

Code ref: `GameEngine.js:1247-1284`. Hidden bonus damage based on how many of a specific enemy type the player has killed.

Per-mob mastery milestones (varies by tier):
- Tier 1-4 mobs: 200 / 500 / 1000 / 1500 / 2000 kills → +2/+4/+6/+8/+10% damage vs that mob
- Tier 5-8 mobs: 100 / 250 / 500 / 750 / 1000 kills → +2-10%
- Tier 9+ mobs: 50 / 125 / 250 / 375 / 500 kills → +2-10%
- Bosses: 5 / 15 / 25 / 35 / 50 kills → +2-10%

Maxed across the bestiary, this layer adds +10% damage against everything. Capped at +10% per enemy ID.

---

## Layer 8 — NFT perks

Code ref: `game/NFTPerks.js`. Only the highest-rarity NFT for the character in use applies (no stacking).

| Rarity | goldMult | relicFragmentMult |
|---|---|---|
| Common | 1.05 | 1.05 |
| Uncommon | 1.07 | 1.08 |
| Rare | 1.10 | 1.10 |
| Epic | 1.12 | 1.13 |
| Legendary | 1.15 | 1.15 |

S6+: gold mult is now folded ADDITIVELY into `player.goldMult` (instead of multiplied at pickup time). Modest layer overall.

---

## Layer 9 — VIP + title buffs

Code ref: `GameEngine.js:266-275`. Server-set per-account.

- **VIP**: +1% damage + +1% HP per level. Stored in `save.vipLevel`. Stacks via tokens.
- **Title buff**: per-equipped-title small permanent buffs (hpMult, dmgMult, speedMult, magnetRange, regen, etc). Set by OmenX user record.
- **Admin buff**: small flat % to base stats (defaults 2%). Set by admin.

---

## Layer 10 — Squad Meteor buffs

Code ref: `GameEngine.js:286-291`. Applied to EVERY squad member's runs across every arena.

| Buff | Effect |
|---|---|
| damage_pct | additive damageMult |
| aoe_pct | additive areaMult |
| gold_pct | additive goldMult |
| cdr_pct | subtractive cooldownMult |

Squad meteor buff tier varies based on treasury contribution. Powerful when active — can be +10-25% across multiple stats.

---

## The full multiplicative stack — what does a "maxed" player actually look like?

Combining all layers for a 100k-kill NeoByte main with maxed everything on Cosmic difficulty:

| Source | damageMult contribution |
|---|---|
| Character base | 1.10 |
| Difficulty (Cosmic) | (xpMult/goldMult only, not dmg) |
| Permanent stats 5/5/5 | +59.5% |
| Talents (T2A+T3A path, perm only) | +25% (NeoByte Path A) |
| Astral Lab buffs | +5-15% (variable) |
| Mastery T3 | +10% |
| Mastery T6 (NeoByte all-stats) | +10% |
| NFT (legendary) | (gold/relic only) |
| VIP 10 | +10% |
| Title (max title) | +5% |
| Admin perk | +2% |
| Annihilation Core L5 PL5 | +31% |
| Squad Meteor buff (max tier) | +15% |
| Banner (when active) | +30% (×, not additive) |
| Synergy Amp (sky_twin / syn_amp) | +0-100% situational |
| **Subtotal additive** | `1.10 + 0.595 + 0.25 + 0.10 + 0.10 + 0.10 + 0.05 + 0.02 + 0.31 + 0.15 = ~2.77` |
| **× Banner multiplicative** | `2.77 × 1.45 = ~4.02` |
| **player.damageMult cap (S6)** | clamped at `4.0` |

**This is exactly the design.** Maxed NeoByte on Inner Galaxy hits the 4.0× damage cap during banner uptime. Without banner: 2.77× — well below cap. Cap is a soft brake that mostly matters during ultimate-ability windows.

For weapons, multiply by the parallel weapon-side stack:
```
Weapon damage = baseDmg × playerCap (4.0) × weaponCap (1.8) × levelScale (4.6) × bannerMult (1.45)
            = baseDmg × ~48
```

Then weapon-specific tick rate amplifies — pushback AoEs at ~4 ticks/sec × ~4 overlapping bubbles = ~16× DPS multiplier on top.

For shieldBubble that lands at:
```
15 × 48 × 16 = ~11,520 DPS against any in-radius enemy
```

For supernovaBeam:
```
60 × 48 × 1.3 = ~3,744 DPS against a single targeted enemy
```

**The per-second damage gap between the meta build and a single-target build is ~3×.** That's the AFK meta in one number.

---

## Caps that already exist (the brakes that work)

| Cap | Value | Where |
|---|---|---|
| `playerDmgCap` (Inner Galaxy) | 4.0× | GameEngine.js:354 |
| `playerAreaCap` (Inner Galaxy) | 3.0× | GameEngine.js:355 |
| `playerXpCap` (Inner Galaxy) | 5.0× | GameEngine.js:356 |
| `playerGoldCap` | 8.0× | GameEngine.js:361 |
| `cooldownMult` floor | 0.35 | GameEngine.js:362 |
| `wDmgCap` (per weapon) | 1.8× | WeaponSystem.js:80 |
| `wAreaCap` (per weapon) | 1.6× | WeaponSystem.js:81 |
| Per-weapon CD floor | 0.50 | WeaponSystem.js (Math.max in updateWeapons) |
| Weapon level cap | 25 | UpgradeSystem.js MAX_WEAPON_LEVEL |
| Weapon slot cap | 6 | UpgradeSystem.js WEAPON_SLOT_CAP |
| Drone count cap | 7 per drone weapon | WeaponSystem.js |
| AoE pool life cap | 15s | WeaponSystem.js |
| Projectile count soft cap | 200 | ProjectileSystem.js |
| Endless trickle XP cap | level 50 | GameEngine.js:992 |
| Endless gold soft-cap (S5) | 10,000 | PickupSystem.js (removed S6+) |
| vampiricLash heal cap | 5% maxHp/swing (10% Outer) | WeaponSystem.js |
| Boss-credited gold cap | 3000/boss | EnemyAI.js |
| Bribe (SynthBeats) cooldown | 3s | GameEngine.js:584 |

**Caps that don't exist (or are too generous):**
- Pushback AoE overlap (no diminishing — 8 stacked shields = 8× DPS)
- Per-pickup nuke damage (`maxHp × 10` is unconditional)
- Luck → nuke drop rate (linear, no diminishing)
- Damage radius vs visual radius (1.5× gap, invisible to player)
- Dynamic Difficulty score reward (none — DD only adds pressure, not score)

---

## Cross-references

- Weapon-by-weapon catalog: [`S7_WEAPON_AUDIT.md`](./S7_WEAPON_AUDIT.md)
- Character kits and AFK affinity: [`S7_CHARACTER_AUDIT.md`](./S7_CHARACTER_AUDIT.md)
- System-level recommendations: [`S7_DESIGN_BRAINSTORM.md`](./S7_DESIGN_BRAINSTORM.md)