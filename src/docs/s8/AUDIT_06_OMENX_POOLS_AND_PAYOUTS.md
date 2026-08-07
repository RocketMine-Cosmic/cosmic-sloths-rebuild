# Doc 6 — OMENX Token Pools & Payouts

The full flow: OMENX spent by players → `TokenSpendLog` → `TokenPool` →
distributed via `distributeRewards` + `distributeKillPool` + `distributeStaffPayout`
+ `distributeSquadChampions` → `PayoutLog`.

Files: `purchaseSku/entry.ts` (spend recording), `distributeRewards/entry.ts`
(top orchestrator), `distributeKillPool/entry.ts`, `distributeStaffPayout/entry.ts`,
`distributeSquadChampions/entry.ts`, `previewPayouts/entry.ts` (dry-run),
`leaderboardPayoutConfig/entry.ts` (tier configs).

## 1. TokenPool structure

`TokenPool` entity — one row per (period_id, period_type). Two period_types:

| Period type | period_id example | Cadence | Created by |
|---|---|---|---|
| `week` | `2026-W25` | ISO Mon-start | `purchaseSku` on first spend |
| `season` | `2026-S7` | 4-week season | `purchaseSku` on first spend |

`total_spent` = sum of OMENX debited that period. Written on every purchase.
`distributed = true` once all required pools have been paid out.

## 2. Weekly pool splits (S7+)

`distributeRewards` line 24-30 + `leaderboardPayoutConfig`:

| Pool | % of weekly `total_spent` | Distribution |
|---|---|---|
| Player leaderboard | **15%** | Top-N by score, tiered |
| Kill pool | **20%** | Top-N by weekly_sector_kills, tiered |
| Staff payout | **5%** (or configured `staff_pct_per_wallet`) | Admin wallets |
| Retained (dev + operations) | **60%** | Not distributed |

**S6 was 25%/20%/5%/50%** — S7 dropped leaderboard from 25→15 and lifted
retained from 50→60.

## 3. Seasonal pool splits (S7+)

| Pool | % of seasonal `total_spent` |
|---|---|
| Seasonal leaderboard | **20%** |
| Squad Champions | **10%** |
| Staff payout | 5% |
| Retained | **65%** |

Seasonal payouts run at the FIRST week of the new season (guard in each
distribution function).

## 4. Player leaderboard tiers (`leaderboardPayoutConfig`)

Default weekly config (line 62-79):

| Rank tier | Rank | Share of pool |
|---|---|---|
| Champion | 1 | 12% |
| Elite | 2-3 | 6% each |
| Mythic | 4-10 | 3% each |
| Legendary | 11-25 | 1.5% each |
| Epic | 26-50 | 0.75% each |
| Rare | 51-100 | 0.35% each |

Sum: 12 + 12 + 21 + 22.5 + 18.75 + 17.5 = **103.75%** — slight over-allocation
built in as safety (payouts capped by `MAX_PAYOUT_PER_PLAYER = 10000 OMENX` at
line 91).

Seasonal has DIFFERENT config (larger buckets, up to top 200).

## 5. Kill pool tiers (`distributeKillPool` line 21-60)

Kill leaderboard shares mirror the player LB structure:
- Top 1: 15%
- Top 2-3: 8% each
- Top 4-10: 3.5% each
- Top 11-25: 1.5% each
- Top 26-50: 0.7% each

`MIN_KILLS_TO_QUALIFY = 100` for weekly kills (filters low-effort accounts).
`MAX_PAYOUT_PER_PLAYER` = same 10,000 OMENX cap.

## 6. Staff payout (`distributeStaffPayout`)

Reads `AppConfig.staff_pct_per_wallet` (default 0.5% per admin wallet, capped
by number of admins). Per-admin override via `AdminWallet.payout_pct_override`.

Payouts to each admin wallet with `permissions` containing `distribute_rewards`.
Logged to `PayoutLog` + `AdminChangesLog`.

## 7. Squad Champions (`distributeSquadChampions`) — see Doc 4 §7

10% of seasonal pool, split 50/30/20 among top-3 squads by war performance,
then evenly among each squad's eligible members.

## 8. Payout orchestration & resume safety

`distributeRewards` is the top-level orchestrator but the three big payouts
(`distributeKillPool`, `distributeStaffPayout`, `distributeSquadChampions`)
are standalone endpoints. Reason: single distribution can be 200+ OMENX API
calls, gateway timeout at ~30s. Standalone functions can each finish before
timeout, and `PayoutLog` idempotency prevents double-payment on retry.

`TokenPool.distributed = true` set only when ALL required pools for that
period have completed (checked by scanning `PayoutLog` for expected pool types).

## 9. API key rotation

OMENX grants go through `OMENX_REWARDS_API_KEY_N` (N=1..4 currently).
Each key has rate limits, so payouts batch by rank tier and rotate keys per
batch. Failures on one key retry with the next.

## 10. Full flow example — Week 2026-W25

Assume week's `total_spent` = 50,000 OMENX.

| Pool | Amount | Recipients | Per-recipient |
|---|---|---|---|
| Player LB (15%) | 7,500 OMENX | Top 100 players | #1 gets 900, #50 ~56, #100 ~26 |
| Kill pool (20%) | 10,000 OMENX | Top 50 killers | #1 gets 1,500, #50 ~70 |
| Staff (5%) | 2,500 OMENX | ~5 admin wallets | 500 each avg |
| Retained (60%) | 30,000 OMENX | Dev/ops | — |

Total distributed: 20,000 OMENX. Total held: 30,000 OMENX.

## 11. Observations

1. **60% retention is high** relative to comparable games (10-30% typical).
   Watch churn during S7.

2. **Player LB payout over-allocation (103.75%)** is intentional safety.

3. **`MIN_KILLS_TO_QUALIFY = 100`** for kill pool is very low. Consider
   raising to 500-1000.

4. **`MAX_PAYOUT_PER_PLAYER = 10000` OMENX/week** = huge concentration cap.
   Confirm the cap-remainder is either logged or redistributed downstream.

5. **Champions pool ONLY runs at season-start weeks** (W1, W5, W9, ...
   modulo 4).

6. **`TokenPool.distributed` flip logic** relies on scanning `PayoutLog`.

7. **Weekly + seasonal share a `TokenPool` per period_id** — a single spend
   contributes to BOTH pools. Effective retention closer to 30-35%.

8. **Discord alerts** on payout failures via `DISCORD_ERROR_WEBHOOK`. Consider
   adding a success summary too.

9. **`previewPayouts` dry-run** lets admins simulate distribution before
   pushing. Underused.

10. **API key rotation is thin** (4 keys). Consider requesting 6-8 keys.