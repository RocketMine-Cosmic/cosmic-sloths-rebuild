# Doc 4 — Squads, Wars, Meteor, Champions

Everything squad-related: membership, XP curve, bounties, wars matchmaking,
squad meteor, treasury, champions payout. Files: `squadActions/entry.ts`,
`squadWarEngine/entry.ts`, `scheduledSquadWarPairing/entry.ts`,
`getSquadMeteorState/entry.ts`, `distributeSquadChampions/entry.ts`,
`src/game/SquadLevels.js`.

## 1. Squad membership

- `MAX_SQUAD_MEMBERS = 5` (`squadActions` line 6).
- Roles: `leader` / `officer` / `member`. Officers can approve join requests
  and kick regular members (not other officers or the leader).
- Privacy modes: `open` (instant join) / `request` (leader approval) / `closed`.

## 2. Squad XP curve (`SquadLevels.js`) — MUST mirror `squadActions` line 27-43

Recently extended to Lv15 (2026-07-01). Backfilled 11 squads on 2026-07-01
after the stored `level` field was capped at Lv7 for a week.

| Level | XP required | Name | Badge |
|---|---|---|---|
| 1 | 0 | Recruits | 🦥 |
| 2 | 5,000 | Drifters | ⭐ |
| 3 | 15,000 | Hunters | 🔥 |
| 4 | 35,000 | Vanguards | ⚡ |
| 5 | 75,000 | Reapers | 💀 |
| 6 | 150,000 | Legends | 👑 |
| 7 | 300,000 | Cosmic Elite | 🌌 |
| 8 | 600,000 | Void Sovereigns | 🛸 |
| 9 | 1,200,000 | Star Forgers | ⚔️ |
| 10 | 2,500,000 | Eternal Ascendants | 🌠 |
| 11 | 5,000,000 | Galaxy Wardens | 🪐 |
| 12 | 10,000,000 | Nebula Tyrants | ☄️ |
| 13 | 20,000,000 | Singularity Lords | 🕳️ |
| 14 | 40,000,000 | Ascended Pantheon | 🔱 |
| 15 | 80,000,000 | Omenforged | ✨ |

**XP sources**: weekly `weekly_kills` roll into `xp` at week rollover
(`squadActions` line 724), plus daily XP grant on first member's daily
bounty claim. **1 kill = 1 XP**.

Daily XP by squad level (`DAILY_SQUAD_XP_BY_LEVEL` line 13-21):

| Level | Daily XP |
|---|---|
| 1 | 500 |
| 2 | 700 |
| 3 | 900 |
| 4 | 1,200 |
| 5 | 1,500 |
| 6 | 1,800 |
| 7+ | 2,000 |

**All squads use Lv7's 2000 daily XP forever past Lv7.** With Lv15 threshold
at 80M XP and daily XP capped at 2000/day/squad, purely daily-driven Lv15
takes ~110 years. Weekly kills are the real driver at high tiers.

## 3. Bounty tiers (`squadActions` line 58-78)

Per-member rewards, one claim per period.

### Weekly bounty tiers (weekly_kills threshold)

| Min level | Kill target | Gold/member | Frags/member |
|---|---|---|---|
| 1 | 2,000 | 250 | 1 |
| 2 | 5,000 | 600 | 1 |
| 3 | 10,000 | 1,250 | 2 |
| 4 | 18,000 | 2,000 | 2 |
| 5 | 30,000 | 3,250 | 3 |
| 6 | 50,000 | 5,000 | 4 |
| 7 | 75,000 | 7,500 | 5 |

### Daily bounty tiers

| Min level | Kill target | Gold/member | Frags/member |
|---|---|---|---|
| 1 | 300 | 75 | 0 |
| 2 | 800 | 150 | 0 |
| 3 | 1,500 | 300 | 0 |
| 4 | 2,500 | 500 | 1 |
| 5 | 4,500 | 750 | 1 |
| 6 | 7,500 | 1,250 | 1 |
| 7 | 12,000 | 2,000 | 2 |

**Both tables cap at Lv7.** A Lv15 squad still gets Lv7 daily rewards.

**Per-day max squad payout**: Lv7 × 5 members = 10,000g + 10 frags/day.
**Per-week max squad payout**: Lv7 × 5 members = 37,500g + 25 frags/week (weekly bounty only).
Combined per-week: 105,000g + 95 frags maximum.

## 4. Squad treasury (S6+, `squadActions` line 944-1201)

Members donate gold to a shared pool (`treasury_gold`). Leaders/officers spend
it to activate buffs for the next week.

Buff tiers (line 963-968):

| Tier | Cost |
|---|---|
| Bronze | 25,000 |
| Silver | 100,000 |
| Gold | 500,000 |
| Platinum | 2,000,000 |

Two-slot model: `active_buff_*` (this week) and `pending_buff_*` (future week).
New purchases go to `pending` if `active` is set; upgrades stack to same slot.

**⚠ IMPORTANT**: The treasury buff's actual gameplay effect is NOT wired in
`squadActions`. Effect application must live elsewhere (probably `GameEngine`
or `saveScore`). Worth verifying — the constants for what the buff actually
DOES don't appear in `squadActions`.

## 5. Squad wars (`squadWarEngine` + `scheduledSquadWarPairing`)

Weekly PvP: paired at Monday 00:05 UTC. Match count kills between two squads;
higher kill count wins.

### Matchmaking (bracket + odd-bump)

- `BRACKET_SIZE = 3` — groups squads into 3-level brackets (1-3, 4-6, ...).
- Within a bracket, sort by `war_wins` desc.
- If a bracket has an odd squad, bump lowest-wins DOWN to the next bracket
  (avoids byes wherever possible).
- Minimum squad size: `MIN_MEMBERS_FOR_WAR = 2` (`squadWarEngine` line 82).

### War rewards (`squadWarEngine` line 25-30)

Per-member, claimed after resolution:

| Result | Gold/member | Fragments/member |
|---|---|---|
| Win | 2,500 | 3 |
| Tie | 1,000 | 1 |
| Loss | 500 | 0 |
| Bye (auto-win, no opponent) | 2,500 | 3 |

**Squad stats updated on resolution**:
- Win: `war_wins++`, `war_streak++`
- Loss: `war_losses++`, `war_streak = 0`
- Tie: `war_ties++`, `war_streak = 0`

## 6. Squad meteor (`getSquadMeteorState` + `submitSquadMeteorDamage`)

Squad-wide DPS check against a shared meteor target. Each squad has one meteor.

- `MAX_BUFF_LEVEL = 20` (line 9) — meteor level cap.
- `HP_BASE = 50,000,000` and `HP_PER_LEVEL = 25,000,000` (line 10-11).
  Lv1 meteor = 50M HP, Lv20 = 525M HP.
- `DAILY_ATTEMPT_LIMIT = 3` (line 12) — 3 meteor attacks per member per day.

Buffs unlocked by meteor level (line 81-91):

```
gold_pct    = level * 1.0     // +1% per lvl, cap +20%
damage_pct  = level * 0.5     // +0.5% per lvl, cap +10%
aoe_pct     = level * 0.5     // +0.5% per lvl, cap +10%
cdr_pct     = level * 0.25    // +0.25% per lvl, cap +5%
```

Weekly leaderboard: top 10 damage contributors per squad per week.

## 7. Squad Champions (seasonal, `distributeSquadChampions`)

10% of seasonal OMENX pool (`CHAMPIONS_POOL_PCT = 0.10` line 27) split among
top-3 squads by war performance.

- Ranking: `wins*3 + ties*1 + byes*1`, tiebreak by total_kills, then wars_fought.
- Eligibility: `MIN_WARS_FOUGHT = 2` AND `MIN_SQUAD_MEMBERS = 2` (line 29-30).
- Shares:
  - 1 winner: 100%
  - 2 winners: 65% / 35%
  - 3 winners: **50% / 30% / 20%**
- Per-member: `squadShare / eligibleWallets.length`.
- Blacklisted wallets excluded before splitting.

Runs on cron at Monday 00:00 UTC of the first week of each new season
(guard `(isoWeek - 1) % 4 === 0`).

## 8. Squad war rewards vs Champions payout — worked example

A 5-member Lv7 squad that wins all 4 weeks of a season with high kill totals:

- **War rewards**: 4 weeks × 2500g × 5 members = 50,000g + 4 × 15 = 60 fragments.
- **Weekly bounties** (Lv7 target 75k kills): 4 × 7500g × 5 = 150,000g + 100 frags.
- **Daily bounties** (Lv7 daily 2000g): 28 days × 2000g × 5 = 280,000g + 56 frags.
- **Champions payout**: 10% × season pool × 50% (if #1) / 5 members. If season
  pool is 100k OMENX → 10k × 50% = 5,000 OMENX / 5 = 1,000 OMENX/member.

## 9. Observations

1. **Daily XP caps at Lv7 (2000/day).** Fine at low end. Past Lv7 the daily XP
   feels vestigial. Consider extending the daily table to Lv15.

2. **Bounty tiers cap at Lv7 (12k daily kills, 75k weekly).** Once past Lv7
   the daily/weekly rewards STOP scaling.

3. **Lv7 weekly target (75k kills) is unreachable for casual squads.**

4. **War win = 2500g × 5 = 12,500g per squad per war.** Compare to weekly
   bounty at Lv7 = 37,500g. Wars are ~30% of the weekly bounty.

5. **`MIN_MEMBERS_FOR_WAR = 2` is very permissive.** Leader+alt duo squads
   can farm easy wins.

6. **Bracket size 3 works for current ~20 squad count.**

7. **Champions pool scales with season revenue.** 10% × pool × 50%/5 members.
   Meaningful money; watch for gaming as pool grows.

8. **Bye = auto-win increments `war_streak`.** Streak fragility low today.

9. **Squad Meteor HP scaling** = 50M + 25M×(lvl-1). Lv20 = 525M HP.

10. **Treasury buffs advertised but not APPLIED anywhere I can find.**
    `squadActions` writes `active_buff_tier` but no engine or `saveScore`
    reads it. Real bug if not wired.

11. **Squad chat lacks rate-limiting.** `MutedWallet` exists but no per-wallet
    messages/minute cap. Community-health issue, not balance.