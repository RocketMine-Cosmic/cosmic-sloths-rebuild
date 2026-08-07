# Doc 3 — Meta Progression Sinks (Gold + OMENX prices)

Everywhere the player can spend gold, OMENX, or star fragments. Files:
`base44/functions/spendGold/entry.ts`, `purchaseSku/entry.ts`, `forgeAction/entry.ts`,
`prestigeRelic/entry.ts`, `src/lib/skuMap.js`, `src/game/Constants.js` (cosmetics).

## 1. Stat / weapon / talent upgrades (`spendGold` + `purchaseSku`)

Every upgrade has a **dual pricing** — buy with gold OR buy with OMENX.
Purchasing with OMENX skips the gold check and vice-versa.

### Gold costs (`spendGold` line 138-155)

| Upgrade type | Permanent lvl 1-5 | Weekly lvl 1-5 | Seasonal lvl 1-5 |
|---|---|---|---|
| Stat | 1000/2000/4000/8000/16000 | 500/1000/2000/4000/8000 | 750/1500/3000/6000/12000 |
| Weapon | same as stat | same as stat | same as stat |
| Talent | index = (talentTier-1)*2 | same table | same table |

Talent gold cost example: T1 uses index 0 (=1000g perm), T2 uses index 2 (=4000g), T3 uses index 4 (=16000g).

### OMENX costs (`skuMap.js`)

| Upgrade | Lvl 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Stat (`getStatUpgradeCost`) | 5 | 10 | 20 | 40 | 80 |
| Weapon (`getWeaponUpgradeCost`) | 5 | 10 | 20 | 40 | 80 |
| Talent (`getTalentCost`, T1/T2/T3) | 10 | 20 | 40 | — | — |

**All three tiers (permanent/weekly/seasonal) share the same SKU per level** —
distinguished only by which tier is being bought. Gold-side has 3 separate
price tables so weekly and seasonal are cheaper than permanent, but OMENX
does NOT — same 5/10/20/40/80 for permanent AND weekly AND seasonal.

**Weekly-cheaper-than-seasonal check (`spendGold` gold table)**: weekly = 2/3 of
seasonal cost. Deliberate — weekly resets, so it should cost less. Historical
bug (2026-05-02) had this inverted; now fixed.

### Talent respec fees

Gold (`spendGold` line 180-184):
- Permanent: 5,000
- Weekly: 2,000
- Seasonal: 8,000

OMENX (`skuMap.js` line 65-69):
- Permanent: `talent-respec-permanent` (~10 OMENX)
- Weekly: `talent-respec-weekly` (~4 OMENX)
- Seasonal: `talent-respec-seasonal` (~20 OMENX)

### Pool-bias respec (Loadouts page)

Gold cost escalates (`spendGold` line 173): `[2000, 4000, 8000, 16000]`.
OMENX cost: SKU `bias-respec`, ~10 OMENX per `checkBiasRespecPrice`.

## 2. Cosmetics (`Constants.js` — `TRAIL_COSMETICS`, `KILL_COSMETICS`, `SKIN_COSMETICS`)

Dual pricing again. Gold cost + Cosmic-Token cost (both shown in UI).
Below is the OMENX conversion (`skuMap.js` line 183-192).

### Trails (`TRAIL_COSMETICS` line 121-134)

| Tier | Gold | Cosmic Token | OMENX |
|---|---|---|---|
| Basic (Fire/Ice/Toxic) | 3,000 | 30 | 3 |
| Advanced (Plasma/Void/Shadow) | 10,000 | 100 | 10 |
| Epic (Gold/Blood/Pixel) | 20,000 | 200 | 20 |
| Legendary (Nebula/Rainbow) | 30,000 | 300 | 30 |

### Kill effects (line 136-146)

| Tier | Gold | Cosmic Token | OMENX |
|---|---|---|---|
| Basic (Explosion/Freeze/Vaporize) | 3,000 | 30 | 3 |
| Advanced (Pixel/Implode/Blood) | 12,000 | 120 | 12 |
| Epic (Black Hole/Golden) | 25,000 | 250 | 25 |

### Skins (line 148-183)

Each character has: default (free), tier-1 (5k gold / 50 tokens / 5 OMENX),
and some have tier-2 (20k gold / 200 tokens / 20 OMENX). 10 seasonal-reward
skins (one per character) that cost -1 (unpurchaseable — earned).

## 3. In-game consumables (SKUs, OMENX-only)

`IN_GAME_SKUS` + `getConsumableCost` (`skuMap.js`):

| SKU | OMENX cost | Purpose |
|---|---|---|
| `ingame-banish` | 2 | Banish 1 upgrade from level-up pool |
| `ingame-banish-2` | 4 | Banish tier 2 |
| `ingame-banish-3` | 6 | Banish tier 3 |
| `ingame-reroll` | 2 | Reroll level-up choices |
| `ingame-revive` | 4 | Revive on death |
| `ingame-squad-ult-lite` | 5 | Squad Ultimate — capped clone |
| `ingame-squad-ult-full` | 10 | Squad Ultimate — full-power clone |
| `ingame-xp-buff` | 10 | 1-run 2× XP |
| `bias-respec` | ~10 | Clear all pool-bias points |

## 4. Forge (`forgeAction/entry.ts`)

### Gold → Star Fragment conversion (line 265-286)

- **Rate**: `10,000 gold = 1 star fragment` (`GOLD_PER_FRAGMENT`)
- **Daily cap**: 30 fragments/day (`DAILY_CONVERT_CAP`)

### Weapon augments (`WEAPON_AUGMENT_COSTS` line 121-125)

Per weapon, per branch (damage / area / cd). All 3 branches × 3 tiers = 9 augments per weapon:

| Tier | Fragment cost | Bonus per Doc 2 |
|---|---|---|
| T1 | 3 | +15% dmg / +15% area / -10% cd |
| T2 | 8 | +35% dmg / +35% area / -20% cd |
| T3 | 20 | +60% dmg / +60% area / -35% cd |

Per weapon full augment cost = 3×(3+8+20) = 93 fragments = 930,000 gold.
Full for all 16 forge-valid weapons = 14,880 fragments = 148.8M gold.

**Overforge (Outer Galaxy only, line 300-315)**: 2nd copy of a T3 augment
costs `2 × baseCost = 40 fragments`, grants +1.5× the stat bonus on Outer
Galaxy runs (S6 was 2×, nerfed 2026-06-23).

### Character augments (`CHAR_AUGMENT_COSTS` line 142-153)

10 characters × 3 augment tiers each = 30 augments. Costs: T1=5, T2=15, T3=30
frags. Per character full = 50 frags. Full roster = 500 frags = 5M gold.

### Mystery Forge (`mysteryForge`, line 370-467)

Rolls ONE random augment on chosen weapon. Costs (S6+ only):
- 5,000 gold per pull, OR
- 50 fragments per pull

Tier weights: **T1 60% / T2 30% / T3 10%** (line 72-76). If rolled tier's
prereq isn't met, downgrades to next-needed tier in branch.

### Astral Lab (`astralPull`, line 468-544, S6+)

Endless post-cap gold sink. Rolls a random stat buff at each pull.
Cost curve: `20,000 × 1.4^pullCount`.

| Pull # | Cost | Cumulative |
|---|---|---|
| 1 | 20,000 | 20,000 |
| 5 | ~76,832 | ~207k |
| 10 | ~413,378 | ~1.13M |
| 15 | ~2.22M | ~6.1M |
| 20 | ~11.95M | ~32.8M |
| 25 | ~64.28M | ~176M |
| 30 | ~345.68M | ~944M |

Stats + caps (`ASTRAL_STATS` line 53-62):
- damageMult +2%/pull, cap +20%
- areaMult +2%/pull, cap +20%
- cooldownMult -1%/pull, cap -10%
- speedMult +1%/pull, cap +10%
- projSpeedMult +2%/pull, cap +20%
- regen +0.1/pull, cap 1.0
- magnetRange +5/pull, cap 50
- maxHp +5/pull, cap 50

Total possible pulls before all caps hit: **80** (10+10+10+10+10+10+10+10).
80 pulls at exponential 1.4× costs = ~350B gold to fully max — deliberately unachievable.

## 5. Relic prestige (`prestigeRelic/entry.ts`)

Per relic, PL0→PL5. Costs (line 42):

| PL | Gold | Fragments |
|---|---|---|
| 0→1 | 500,000 | 100 |
| 1→2 | 1,000,000 | 100 |
| 2→3 | 1,500,000 | 100 |
| 3→4 | 2,000,000 | 100 |
| 4→5 | 2,500,000 | 100 |
| **Total per relic** | **7,500,000** | **500** |

All 5 relics fully prestiged = **37.5M gold + 2,500 fragments**.

Each PL adds +5% to the relic's stat value at runtime.

## 6. Squad treasury buffs (`squadActions` line 963-968)

Squad-wide buff for one full ISO week. Gold from squad treasury (pooled donations):

| Tier | Cost | Buff |
|---|---|---|
| Bronze | 25,000 | (see `getSquadMeteorState.computeBuffs` — separate system) |
| Silver | 100,000 | |
| Gold | 500,000 | |
| Platinum | 2,000,000 | |

Note: Treasury buff and Meteor buffs are separate systems (treasury = weekly
manual purchase, meteor = per-squad-meteor-level passive).

## 7. Squad meteor buffs (passive, from meteor level)

`getSquadMeteorState.computeBuffs` (line 81-91). Meteor level = 1..20 (cap):

```
gold_pct    = level * 1.0     // +1% per level, max +20%
damage_pct  = level * 0.5     // +0.5% per level, max +10%
aoe_pct     = level * 0.5     // +0.5% per level, max +10%
cdr_pct     = level * 0.25    // +0.25% per level, max +5%
```

Level-up cost: 25M HP per level (`HP_PER_LEVEL`), +50M base (`HP_BASE`). Squad-wide
DPS check against the Quantum Meteor arena, 3 attempts per member per day.

## 8. Character purchase gold cost (`Constants.js` line 2-11)

| Character | Cost |
|---|---|
| NeoByte | 0 (starter) |
| Pandypaws | 1,000 |
| NovaByte | 2,000 |
| Glitch | 4,000 |
| HoloDrift | 6,000 |
| CodeBreaker | 8,000 |
| DataPhantom | 10,000 |
| NeonVortex | 15,000 |
| SynthBeats | 20,000 |
| SkyByte | 25,000 |

Total to buy all: 91,000 gold. But most players unlock via kill milestones
(random, from `KILL_MILESTONES` — see Doc 1 §5) so gold path is a backup.

## 9. Observations

1. **OMENX prices scale as `[5, 10, 20, 40, 80]` (2×) but gold prices also
   scale 2×.** Consistent linear/OMENX gold ratio: level 5 costs 16,000g OR
   80 OMENX = 200g/OMENX. Level 1 costs 1,000g OR 5 OMENX = 200g/OMENX.
   **Perfect internal consistency.** Good.

2. **Weekly SKU pricing is same as permanent in OMENX but 50% cheaper in
   gold.** Whales paying OMENX get a WORSE deal on weekly upgrades vs
   permanent. Either intentional (whales pay for convenience, not economy)
   or an oversight. If it's meant to encourage OMENX to fund permanent
   growth over weekly/seasonal churn, keep it. Otherwise the OMENX weekly
   SKU should be ~half the permanent price.

3. **Trail/kill/skin OMENX conversion = `goldCost / 1000`.** 3000g = 3 OMENX,
   20000g = 20 OMENX. Perfectly consistent, but the ratio is HALF the ratio
   used for stats/weapons/talents (200g/OMENX for upgrades vs 1000g/OMENX
   for cosmetics). Cosmetics are effectively 5× cheaper in OMENX terms.
   Deliberate — cosmetics should be OMENX-friendly to drive whale acquisition.

4. **Forge fragment costs vs relic fragment costs.** Relics use 2-5 frags per
   level (max 25 frags for Damage Core L1→L5). Forge weapon augments use 31
   frags per weapon (3+8+20). So a single fully-forged weapon costs MORE
   fragments than a fully-leveled relic. That's fine because forge stacks
   permanently and relics don't take up run slots, but worth knowing when
   tuning drop rates.

5. **Astral Lab costs go astronomical fast.** Pull 20 = 12M gold. Pull 30 =
   345M gold. The intent is "endless gold sink for whales" but only ~5 pulls
   are affordable within a normal player's lifetime gold accumulation.

6. **Character purchase gold is a legacy path.** Kill milestones (Doc 1 §5)
   grant characters randomly, so most players never buy through this route.

7. **Prestige is the endgame gold sink par excellence.** 37.5M gold to fully
   prestige all 5 relics is a huge target. Combined with Astral Lab and Forge,
   there's a clear late-game gold spend path. Good.

8. **Treasury buff prices scale 4× per tier** (25k → 100k → 500k → 2M).
   Steeper than the 2× stat/weapon curve. Encourages squads to save up for
   Platinum rather than cycle Bronze/Silver.

9. **Talent respec (permanent = 5000g / weekly = 2000g / seasonal = 8000g)**
   feels expensive for the low permanent cost (T1 = 1000g).

10. **No cosmic-token gold sink.** `TRAIL_COSMETICS` list a `tokenCost` field
    but I can't find where tokens are actually spent. Cosmetics buy through
    OMENX or gold. Cosmic tokens (`saveData.cosmicTokens`) only received via
    daily login rewards but there's no active spend for them.