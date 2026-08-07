# Doc 1 — Score & Run-End Economy

Everything a run produces on completion: leaderboard `score`, credited
`gold`, `kills`, `relic fragments`, `character/arena` unlocks, `daily tasks`
and `bounty` progress. Server file: `base44/functions/saveScore/entry.ts`
(1034 lines). Client mirror: `src/game/GameEngine.js` + `PickupSystem.js`.

## 1. Sanity caps (rejection thresholds)

Server refuses runs that exceed these — anything over is treated as tampering.

| Constant | Value | Line | Notes |
|---|---|---|---|
| `MAX_KILLS_PER_SEC` | `200` | 38 | Loose ceiling |
| `MAX_GOLD_BASELINE` | `50000` | 44 | S5 only. S6+ removes gold-baseline reject |
| `MAX_GOLD_PER_KILL` | `2000` | 45 | S5 only |
| `MAX_LEVEL` | `500` | 46 | In-run character level |
| `MAX_TIME_SEC` | `60*60` (S5) / `2*60*60` (S6+) | 47, 145 | S6 doubled it for legit long endless runs |
| `MIN_TIME_SEC` | `1` | 48 | Blocks instant runs |
| `MAX_FRAGMENTS_PER_SEC` | `0.2` | 54 | = 1 frag / 5s (S5 only) |
| `ENDLESS_FRAGMENTS_CAP_PER_RUN` | `30` | 55 | S5 only |
| `SCORE_HARD_CEILING` | `25_000_000` | 87 | Last-line backstop. Raised from 10M for Outer Galaxy. |

## 2. Endless-run per-second caps (S5 only)

| Constant | Value | Line |
|---|---|---|
| `ENDLESS_GOLD_PER_SEC` | `12` | 66 |
| `ENDLESS_KILLS_PER_SEC` | `5` | 71 |
| `ENDLESS_GOLD_FLOOR` | `1000` | 72 |
| `ENDLESS_KILLS_FLOOR` | `600` | 73 |
| `ENDLESS_GOLD_HARD_CEILING` | `10000` | 74 |
| `ENDLESS_KILLS_HARD_CEILING` | `12000` | 75 |

**S6+ removes all of these.** S6 relies on the client-side time-decay curve in
`PickupSystem.updatePickups` (line 55) — after 10 min in endless, gold value
decays linearly to 0.25× at 40 min. No more "GOLD CAPPED" banner.

## 3. Score formula

Two disjoint formulas: S5 (legacy) and S6+ (current).

### S5 (`2026-S5` only, frozen)
```
arenaMult   = 2.0 for endless, else 1.0 + arenaIdx*0.2
goldContrib = min(gold, kills*200) * 1.5
victoryBns  = isVictory ? (15000 + sectorIdx*16000) : 0
score       = min(SCORE_HARD_CEILING, floor((kills*45 + level²*15 + time*5 + goldContrib + victoryBns) * arenaMult))
```

### S6+ (`saveScore` line 235-297)
```
killsScore   = kills * 120
levelScore   = level² * 100
sectorScore  = (endless|raid) ? 0 : sectorIdx * 8000
victoryBonus = (isVictory && !endless && !raid) ? sectorIdx * 15000 : 0
endlessScore = endless ? floor(time/60) * 10000 : 0

bonusMult    = (see table below)
score        = min(SCORE_HARD_CEILING, floor(killsScore + levelScore + (sectorScore+victoryBonus)*bonusMult + endlessScore))
```

**Outer Galaxy `bonusMult`** — applied only to sector+victory bonus, kill
score stays sacred:

| Sector | S6 mult (line 277-281) | S7+ mult (line 271-276) |
|---|---|---|
| S1-S10 (idx 0-9) | 1× | 1× |
| S11-S14 (idx 10-13) | 1.5× | 1.25× |
| S15-S17 (idx 14-16) | 2× | 1.5× |
| S18-S19 (idx 17-18) | 2.5× | 1.75× |
| S20 (idx 19) | 3.5× | 2× |

**S7 HEAT bonus** (line 302-312) stacks on top:
```
ddCap = { normal: 1.75, hard: 2.5, cosmic: 3.5 }[difficulty] || 1.0
ddProgress = clamp01((ddPeakSpawnMult - 1.0) / (ddCap - 1.0))
heatBonus  = 1 + ddProgress   // up to ×2.0
score     *= heatBonus        // Sectors only, not endless/raid/meteor
```

## 4. Arena progression (must mirror `game/Constants.js`)

`ARENA_ORDER` (line 94-100) — 20 sector ids: `station` … `devourer`.
`ARENA_DURATIONS` (line 107-114) — 180s → 750s, +30s per sector.
Victory beat `S{n}` unlocks `S{n+1}` per-character (line 519-543).

## 5. Character unlocks via kill milestones

`KILL_MILESTONES` (line 123): `[0, 2000, 5000, 10000, 20000, 35000, 55000,
80000, 115000, 160000]`. Each threshold crossed grants ONE random locked
character. Full roster of 10 in `ALL_CHARACTER_IDS` (line 125).

## 6. Weekly sector kill counter (kill leaderboard fuel)

Written only on sector runs (not endless/raid/meteor) — `saveScore` line
702-716. Resets when `weekly_sector_kills_week != current week`. At rollover,
a `WeeklyKillSnapshot` row is written (line 725-764) so the payout function
can find that week's kills after the counter resets.

## 7. Daily task definitions (server-authoritative)

`DAILY_TASKS_DEFINITIONS` (line 367-373):

| Task | Target | Gold | Frags |
|---|---|---|---|
| `dt_first_run` (complete 1 run) | 1 | 200 | 0 |
| `dt_sector_sweep` (survive 60s) | 60 | 300 | 0 |
| `dt_kill_streak` (100 kills in one run) | 100 | 250 | 1 |
| `dt_level_up` (reach lvl 10 in one run) | 10 | 400 | 0 |
| `dt_diversity` (2 different characters) | 2 | 500 | 1 |

Total possible per day: 1650g + 2 frags. Endless runs DO progress dailies (line 397-424).

## 8. Bounty progress

`updateBountyProgress` (line 428-465). Endless runs EXCLUDED from `gold` +
`play` bounties (anti-farm). `BOUNTIES_POOL` + `DAILY_MISSIONS_POOL` are
defined in `Constants.js` line 94-109.

## 9. Observations

1. **S5 code paths still resident.** `SILENT_SCORE_MULTIPLIERS` (line 31),
   S5-only `arenaMult`, S5-only endless caps, S5 gold rejection — all guarded
   by `!isS6OrLater` but still shipping. Could be deleted after S7's second
   season closes (mid-August 2026) to shrink the file by ~250 lines.

2. **`SCORE_HARD_CEILING = 25M` is comfortable** for legit play but rare
   Cosmic S20 + high DD peak + long endless tail could theoretically hit it.
   With HEAT ×2 stacking, a 5M base score would touch 10M — still 60% below.
   No action needed.

3. **Time clamp only on S5.** S6+ removed the arena-duration clamp (line
   161-166). Post-boss tail is now allowed to inflate `time_survived` a
   couple of seconds — cosmetic only since S6 formula doesn't use `time*5`.

4. **Daily task `dt_diversity` requires 2 characters — new player wall.**
   A brand-new account only has NeoByte until 2000 kills. They can never
   claim `dt_diversity` (500g + 1 frag = 30% of the daily loop). Consider
   auto-granting a 2nd character at first login OR lowering the target to 1
   for players with only 1 unlocked character.

5. **`MAX_GOLD_PER_KILL = 2000` never lifted for S6+.** S6 replaced the check
   with "no rejection at all" — but if a Cosmic S20 whale hits 300k gold in
   a 10-min sector run with Synthbeats + Astral gold buffs stacked, no
   backstop catches it. Could add an "impossible amount" ceiling like
   `gold > 10 * (kills * 500 + 500000)` to still catch outright tampering.

6. **Endless per-run cap on kills is unbounded on S6+** since caps were
   removed. Only global `SCORE_HARD_CEILING` catches abuse. In practice
   `MAX_KILLS_PER_SEC * time` (200 × 3600 = 720k kills max) is the only
   remaining bound — reasonable.

7. **`heatBonus` on Easy is always 1.0** (line 305 — `ddCap = 1.0` for
   easy). Correct by design — easy shouldn't scale. Just noting so tuning
   doesn't accidentally add it.

8. **Squad kills credit is skipped on endless** (line 903, `skipWar = validation.isEndless`).
   Weekly squad kills come from sector runs only. Consistent with
   `weekly_sector_kills` design. Good.