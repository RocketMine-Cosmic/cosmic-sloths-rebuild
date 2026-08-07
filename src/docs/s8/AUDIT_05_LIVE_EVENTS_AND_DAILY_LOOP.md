# Doc 5 — Live Events & Daily Loop

Everything that pulls a player back day-to-day: daily login rewards, daily
tasks, bounties, weekly boss raid, weekly kill leaderboard, seasonal skin,
Leviathan Trials modifiers.

Files: `claimDailyLogin/entry.ts`, `claimDailyTask/entry.ts`, `claimBounty/entry.ts`,
`claimBossReward/entry.ts`, `submitBossDamage/entry.ts`, `getOrSpawnWeeklyBoss/entry.ts`,
`getWeeklyKillLeaderboard/entry.ts`, `claimSeasonalSkin/entry.ts`, `saveScore/entry.ts`.

## 1. Daily login rewards

`claimDailyLogin/entry.ts`. UTC day tracking via `save.dailyLoginLastClaim`.
7-day cycle (`DAILY_LOGIN_REWARDS`):

| Day | Reward |
|---|---|
| 1 | 200 gold |
| 2 | 300 gold |
| 3 | 1 star fragment |
| 4 | 500 gold |
| 5 | 750 gold |
| 6 | 2 star fragments |
| 7 | **1,500 gold + 3 fragments** (jackpot) |

Streak resets on missed day. Cycle repeats. Weekly total on perfect attendance:
3,250 gold + 6 fragments = ~63,000g equivalent (frags @ 10k gold rate) — solid
casual income stream.

## 2. Daily tasks

Defined in `saveScore` line 367-373, claimed via `claimDailyTask/entry.ts`.
Progressed automatically during runs (endless included, `saveScore` line 397-424).

| Task ID | Description | Target | Reward |
|---|---|---|---|
| `dt_first_run` | Complete 1 run | 1 | 200g |
| `dt_sector_sweep` | Survive 60s in a run | 60s | 300g |
| `dt_kill_streak` | 100 kills in one run | 100 | 250g + 1 frag |
| `dt_level_up` | Reach lvl 10 in one run | 10 | 400g |
| `dt_diversity` | Use 2 different characters | 2 | 500g + 1 frag |

Full daily task clear: **1,650g + 2 fragments** ≈ 21,650g equivalent per day.

## 3. Bounties (weekly)

`BOUNTIES_POOL` in `Constants.js` (line 94-101), progressed via `updateBountyProgress`
in `saveScore` line 428-465. Endless runs excluded from `gold` and `play` bounties.

3 bounties active at once, rerolled weekly. Each has a target + gold reward.
Values from `Constants.js`:

| Bounty | Target | Reward |
|---|---|---|
| Sector Slayer | 500 kills in sectors | 3,000g |
| Endless Grinder | 30-min endless survive | 2,500g |
| Gold Hoarder | 5,000g earned in runs | 2,000g |
| Boss Killer | 5 boss kills | 4,000g |
| Level Hunter | Reach lvl 25 in a run | 3,500g |
| Play Ten | Complete 10 runs | 2,000g |

Full weekly bounty clear: ~17,000g / week average (depends on rotation).

## 4. Weekly Boss Raid (`getOrSpawnWeeklyBoss` + `submitBossDamage` + `claimBossReward`)

Shared world boss. HP scales with participation and week id.

- **HP**: `getOrSpawnWeeklyBoss` spawns boss with HP tuned to weekly participation
  (~50M-200M range depending on active player count).
- **Contribution**: `submitBossDamage` credits damage to `GlobalBossContribution`.
- **Reward tiers** (`claimBossReward`): scale with damage % of total boss HP.
  - Top contributors get: gold + fragments + guaranteed cosmetic drop.
  - Every participant gets a small consolation.
- **Reward rows**: written to `GlobalBossEvent` for auditing.

Boss defeat triggers `is_defeated=true` on `GlobalBoss` and a Discord webhook.

## 5. Weekly Kill Leaderboard (`getWeeklyKillLeaderboard`)

Reads `PlayerSave.weekly_sector_kills` (server-authoritative, sector runs only).
`WeeklyKillSnapshot` freezes values at week rollover so payouts work post-rollover.

**Payout**: separate `distributeKillPool` function — see Doc 6.

## 6. Seasonal skin (`claimSeasonalSkin`)

Every 4 weeks (new season), each player can claim ONE character-specific skin
tied to that season's featured character. Claim is idempotent per-season.

Skin cosmetic (`SKIN_COSMETICS` in `Constants.js`, priced -1 = unpurchaseable)
becomes owned via this claim only. Powerful retention hook — miss a season,
miss that skin forever.

## 7. Leviathan Trials (`saveScore` handles trial modifier scoring)

Weekly modifier arena. Same sector arena but with active modifiers:
- `bullet_hell` — 2× boss projectiles
- `glass_cannon` — 2× dmg dealt, 0.5× HP
- `iron_will` — no HP pickups
- `speed_demon` — 1.5× enemy speed

Runs count as `run_type='sector'` in `RunScore` for leaderboard purposes.
Trial-specific rewards: bonus gold multiplier + guaranteed fragment drop
on victory (defined in `LeviathanTrials.jsx`).

## 8. Full daily/weekly loop economic snapshot

For an active casual player (logs in daily, plays 2-3 runs/day, in Lv3 squad):

| Source | Daily | Weekly |
|---|---|---|
| Daily login (avg) | ~465g + ~0.85 frag | 3,250g + 6 frags |
| Daily tasks (all 5) | 1,650g + 2 frags | 11,550g + 14 frags |
| Squad daily bounty (Lv3) | 300g | 2,100g |
| Squad weekly bounty (Lv3) | — | 1,250g + 2 frags |
| Run gold (2-3 runs @ ~4,000g avg) | ~10,000g | ~70,000g |
| Weekly bounty pool (avg 2/3 cleared) | — | ~11,000g |
| Boss raid (avg tier) | — | ~5,000g + 3 frags |
| **Total** | **~12,400g + ~3 frags** | **~104,000g + ~28 frags** |

At 10,000g/frag equivalent, weekly income ≈ **384,000g/week** for a casual.
Hardcore Lv7 squad member with all clears + high raid tier ≈ 800k-1.2M/week.

## 9. Observations

1. **Daily login jackpot on day 7 is the strongest single-day reward**
   (1,500g + 3 frags = 31,500g equiv). Great retention hook.

2. **Daily task cap at 5 tasks feels right.** `dt_diversity` (need 2
   characters) blocks brand-new players — see Doc 1 §9.4.

3. **Bounties pool = 6 defined, 3 active per week.** Rotation is random per
   week; not visible without reading source. Consider adding a "next week's
   bounties" preview in-UI.

4. **Weekly boss raid HP tuning is dynamic** but the exact formula isn't in
   `Constants.js`.

5. **Seasonal skins are MISSABLE-FOREVER.** High retention value but also
   a rage-quit source when players learn they missed one.

6. **Leviathan Trial modifiers don't grant special leaderboard placement.**

7. **Casual weekly income ~104k gold + 28 frags** = ~384k gold equivalent.
   Prestiging one relic = 32 weeks of casual play.

8. **Endless doesn't advance `Play Ten` / gold bounties** but DOES advance
   dailies. Slight inconsistency but keep current behaviour.

9. **Boss raid reward Discord webhook** posts to `DISCORD_ECONOMY_WEBHOOK`.

10. **Daily login uses `save.dailyLoginLastClaim`** (client-writable) so
    verify UTC-key comparison is server-side.